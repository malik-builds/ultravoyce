import "dotenv/config";
import express from "express";
import { createServer } from "http";
import WebSocket, { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import { mkdir } from "fs/promises";

import {
  PORT, RECORDINGS_DIR, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  DEV_WORKFLOW_PATH, ALLOW_LOCAL_WEBHOOKS, OPENAI_API_KEY, ELEVENLABS_API_KEY, VALSEA_API_KEY, STT_PROVIDER,
} from "./config.js";
import { log } from "./services/log.js";
import { loadFromFile, loadFromSupabase } from "./workflow/loader.js";
import { createSession, finalizeSession, sendToClient, startAutoHangupTimer, enforceRecordingCap } from "./workflow/session.js";
import { processUntilInput, handleUserInput } from "./workflow/runtime.js";
import { connectSTT as connectValseaSTT, sendAudioChunk as sendValseaChunk } from "./services/stt-valsea.js";
import { connectSTT as connectElevenLabsSTT, sendAudioChunk as sendElevenLabsChunk } from "./services/stt.js";
import { healthRouter } from "./routes/health.js";
import { sessionsRouter } from "./routes/sessions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sessions = new Map();
const useSupabase = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

// ─── Express app ──────────────────────────────────────────────────────────────
const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.use("/vendor/three", express.static(path.join(__dirname, "node_modules", "three", "build")));
app.use(healthRouter(() => useSupabase ? "supabase" : DEV_WORKFLOW_PATH));
app.use(sessionsRouter());

// ─── WebSocket server ─────────────────────────────────────────────────────────
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 * 20 });

server.on("upgrade", (request, socket, head) => {
  socket.on("error", (err) => console.error("Socket upgrade error:", err));
  const { pathname } = new URL(request.url, "http://localhost");
  if (pathname !== "/ws") { socket.destroy(); return; }
  wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
});

wss.on("connection", async (ws, request) => {
  const useValsea = STT_PROVIDER === "valsea" || STT_PROVIDER === "dual";
  const useElevenLabsSTT = STT_PROVIDER !== "valsea";
  if (!OPENAI_API_KEY || !ELEVENLABS_API_KEY || (useValsea && !VALSEA_API_KEY)) {
    sendToClient(ws, { type: "error", message: "Server is missing required API keys." });
    ws.close(1011, "missing api keys");
    return;
  }

  ws.on("error", (err) => console.error("WebSocket error:", err));

  // Load the workflow for this connection
  let workflowDefinition;
  try {
    if (useSupabase) {
      const url = new URL(request.url, "http://localhost");
      const workflowId = url.searchParams.get("workflowId");
      if (!workflowId) {
        sendToClient(ws, { type: "error", message: "workflowId query parameter is required." });
        ws.close(1008, "missing workflowId");
        return;
      }
      workflowDefinition = await loadFromSupabase(workflowId);
    } else {
      // Dev mode: load the default local file regardless of query params
      workflowDefinition = await loadFromFile(DEV_WORKFLOW_PATH);
    }
  } catch (err) {
    console.error("Workflow load failed:", err);
    sendToClient(ws, { type: "error", message: err.message || "Failed to load workflow." });
    ws.close(1011, "workflow load failed");
    return;
  }

  let session;
  try {
    session = await createSession(ws, workflowDefinition);

    // ── Shared: commit a transcript to the workflow queue ─────────────────────
    function onFinalTranscript(transcript) {
      if (!transcript) return;
      if (session.closed) { log.debug("STT", "final ignored — session closed"); return; }
      if (session.isSpeaking) { log.warn("STT", "final DROPPED — barge-in while speaking", { transcript }); return; }
      if (session.isProcessing) { log.warn("STT", "final DROPPED — still processing", { transcript }); return; }
      if (!session.awaitingInput) { log.debug("STT", "final ignored — not awaiting input"); return; }
      log.info("STT", "final — queueing handleUserInput", { transcript });
      session.lastAudioAt = Date.now();
      session.isProcessing = true;
      session.queue = session.queue
        .then(() => handleUserInput(session, transcript))
        .catch((err) => {
          console.error("Workflow turn error:", err);
          sendToClient(ws, { type: "error", message: "Workflow processing failed for this turn." });
        })
        .finally(() => { session.isProcessing = false; });
    }

    function onReady() {
      sendToClient(ws, { type: "stt.ready" });
      session.queue = session.queue
        .then(() => processUntilInput(session))
        .catch((err) => {
          console.error("Workflow startup error:", err);
          sendToClient(ws, { type: "error", message: "Workflow runtime failed during startup." });
        });
    }

    // ── Valsea STT ────────────────────────────────────────────────────────────
    let valseaSocket = null;
    if (useValsea) {
      const valseaFinals = STT_PROVIDER === "valsea"; // only drive workflow in valsea-only mode
      valseaSocket = await connectValseaSTT((raw) => {
        let event;
        try { event = JSON.parse(raw.toString()); } catch { return; }
        if (event.type === "session.ready") {
          log.info("STT", `Valsea ready — ${valseaFinals ? "driving workflow" : "partials display only"}`);
          if (valseaFinals) onReady();
        }
        if (event.type === "transcript.partial") {
          sendToClient(ws, { type: "transcript.partial", text: event.text || "" });
        }
        if (event.type === "transcript.final" && valseaFinals) {
          onFinalTranscript(String(event.text || "").trim());
        }
      });
    }

    // ── ElevenLabs STT ────────────────────────────────────────────────────────
    let elevenLabsSocket = null;
    if (useElevenLabsSTT) {
      elevenLabsSocket = await connectElevenLabsSTT((raw) => {
        let event;
        try { event = JSON.parse(raw.toString()); } catch { return; }
        if (event.message_type === "session_started") {
          log.info("STT", "ElevenLabs ready — driving workflow");
          onReady();
        }
        if (event.message_type === "committed_transcript") {
          onFinalTranscript(String(event.text || "").trim());
        }
      });
    }

    session.valseaSttSocket = valseaSocket;
    session.realtimeSttSocket = elevenLabsSocket;
    sessions.set(ws, session);

    sendToClient(ws, { type: "session.started", sessionId: session.sessionId });
    sendToClient(ws, { type: "workflow.started", workflowId: workflowDefinition.workflow.id });
  } catch (err) {
    console.error("Session init failed:", err);
    sendToClient(ws, { type: "error", message: "Failed to initialize voice session." });
    ws.close(1011, "session setup failed");
    return;
  }

  startAutoHangupTimer(session, ws, () => {
    session.autoHangup = true;
    ws.close(1000, "auto hangup");
  });

  ws.on("message", async (data, isBinary) => {
    const current = sessions.get(ws);
    if (!current || current.closed || isBinary) return;
    try {
      const message = JSON.parse(data.toString());

      if (message.type === "audio.chunk" && typeof message.audio === "string") {
        current.lastAudioAt = Date.now();
        startAutoHangupTimer(current, ws, () => {
          current.autoHangup = true;
          ws.close(1000, "auto hangup");
        });

        const pcmBytes = Buffer.from(message.audio, "base64");
        if (!enforceRecordingCap(current, ws, pcmBytes.length)) {
          current.stopRequested = true;
          ws.close(1009, "recording size limit");
          return;
        }

        current.audioChunksReceived += 1;
        const canContinue = current.audioStream.write(pcmBytes);
        if (!canContinue) await new Promise((r) => current.audioStream.once("drain", r));

        if (current.valseaSttSocket) sendValseaChunk(current.valseaSttSocket, message.audio);
        if (current.realtimeSttSocket) sendElevenLabsChunk(current.realtimeSttSocket, message.audio);
        return;
      }

      if (message.type === "call.end" || message.type === "call.decline") {
        current.stopRequested = true;
        ws.close(1000, "call ended by user");
      }
    } catch (err) {
      console.error("Message handling error:", err);
      sendToClient(ws, { type: "error", message: "Failed to process incoming message." });
    }
  });

  ws.on("close", async () => {
    const current = sessions.get(ws);
    sessions.delete(ws);
    if (!current) return;

    let reason = "socket_closed";
    if (current.workflowCompleted) reason = "workflow_completed";
    else if (current.stopRequested) reason = "user_ended";
    else if (current.autoHangup) reason = "auto_hangup";

    await finalizeSession(current, reason).catch((err) => {
      console.error("Finalize on close failed:", err);
    });
  });
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function bootstrap() {
  await mkdir(RECORDINGS_DIR, { recursive: true });
  server.listen(PORT, () => {
    const mode = useSupabase ? "Supabase (per-connection)" : `dev file: ${DEV_WORKFLOW_PATH}`;
    console.log(`Voice server listening on http://localhost:${PORT}`);
    console.log(`Workflow source: ${mode}`);
    if (ALLOW_LOCAL_WEBHOOKS) console.warn("⚠️  ALLOW_LOCAL_WEBHOOKS=true — local webhook URLs are permitted");
  });
}

bootstrap().catch((err) => {
  console.error("Failed to bootstrap:", err);
  process.exit(1);
});
