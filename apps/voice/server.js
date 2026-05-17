import "dotenv/config";
import express from "express";
import { createServer } from "http";
import WebSocket, { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import { mkdir } from "fs/promises";

import {
  PORT, RECORDINGS_DIR, SUPABASE_URL, SUPABASE_SECRET_KEY,
  ALLOW_LOCAL_WEBHOOKS, OPENAI_API_KEY, ELEVENLABS_API_KEY,
} from "./config.js";
import { log } from "./services/log.js";
import { loadWorkflow, WorkflowLoadError } from "./workflow/loader.js";
import { createSession, finalizeSession, sendToClient, startAutoHangupTimer, enforceRecordingCap } from "./workflow/session.js";
import { processUntilInput, handleUserInput } from "./workflow/runtime.js";
import { connectSTT, sendAudioChunk } from "./services/stt.js";
import { healthRouter } from "./routes/health.js";
import { sessionsRouter } from "./routes/sessions.js";
import { workflowsRouter } from "./routes/workflows.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sessions = new Map();

const HTTP_STATUS_TEXT = {
  400: "Bad Request",
  404: "Not Found",
  502: "Bad Gateway",
};

function rejectUpgrade(socket, statusCode, message) {
  const statusText = HTTP_STATUS_TEXT[statusCode] || "Error";
  const body = JSON.stringify({ error: message });
  socket.write(
    `HTTP/1.1 ${statusCode} ${statusText}\r\n` +
      "Content-Type: application/json\r\n" +
      `Content-Length: ${Buffer.byteLength(body)}\r\n` +
      "Connection: close\r\n" +
      "\r\n" +
      body,
  );
  socket.destroy();
}

// ─── Express app ──────────────────────────────────────────────────────────────
const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.use("/vendor/three", express.static(path.join(__dirname, "node_modules", "three", "build")));
app.use(healthRouter({ supabaseConfigured: true }));
app.use(workflowsRouter());
app.use(sessionsRouter());

// ─── WebSocket server ─────────────────────────────────────────────────────────
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 * 20 });

server.on("upgrade", async (request, socket, head) => {
  socket.on("error", (err) => console.error("Socket upgrade error:", err));

  const { pathname, searchParams } = new URL(request.url, "http://localhost");
  if (pathname !== "/ws") {
    socket.destroy();
    return;
  }

  const workflowId = searchParams.get("workflowId");
  if (!workflowId) {
    rejectUpgrade(socket, 400, "workflowId query parameter is required.");
    return;
  }

  try {
    request.workflowDefinition = await loadWorkflow(workflowId);
  } catch (err) {
    const status = err instanceof WorkflowLoadError ? err.statusCode : 502;
    const message =
      err instanceof WorkflowLoadError ? err.message : "Failed to load workflow.";
    console.error("Workflow load failed:", err);
    rejectUpgrade(socket, status, message);
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
});

wss.on("connection", async (ws, request) => {
  if (!OPENAI_API_KEY || !ELEVENLABS_API_KEY) {
    sendToClient(ws, { type: "error", message: "Server is missing required API keys." });
    ws.close(1011, "missing api keys");
    return;
  }

  ws.on("error", (err) => console.error("WebSocket error:", err));

  const workflowDefinition = request.workflowDefinition;
  if (!workflowDefinition) {
    sendToClient(ws, { type: "error", message: "Workflow was not loaded for this connection." });
    ws.close(1011, "workflow not loaded");
    return;
  }

  let session;
  try {
    session = await createSession(ws, workflowDefinition);

    const sttSocket = await connectSTT((raw) => {
      let event;
      try { event = JSON.parse(raw.toString()); } catch { return; }

      if (event.message_type === "session_started") {
        log.info("STT", "session_started — STT ready, starting workflow");
        sendToClient(ws, { type: "stt.ready" });
        session.queue = session.queue
          .then(() => processUntilInput(session))
          .catch((err) => {
            console.error("Workflow startup error:", err);
            sendToClient(ws, { type: "error", message: "Workflow runtime failed during startup." });
          });
      }

      if (event.message_type === "partial_transcript") {
        log.debug("STT", "partial_transcript", { text: event.text, isSpeaking: session.isSpeaking });
        sendToClient(ws, { type: "transcript.partial", text: event.text || "" });
      }

      if (event.message_type === "committed_transcript") {
        const transcript = String(event.text || "").trim();
        if (!transcript) {
          log.debug("STT", "committed_transcript ignored — empty");
          return;
        }
        if (session.closed) {
          log.debug("STT", "committed_transcript ignored — session closed", { transcript });
          return;
        }
        if (session.isSpeaking) {
          log.warn("STT", "committed_transcript DROPPED — barge-in while speaking", { transcript });
          return;
        }
        if (session.isProcessing) {
          log.warn("STT", "committed_transcript DROPPED — still processing previous turn", { transcript });
          return;
        }
        if (!session.awaitingInput) {
          log.debug("STT", "committed_transcript ignored — not awaiting input", { transcript });
          return;
        }
        log.info("STT", "committed_transcript — queueing handleUserInput", { transcript });
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
    });

    session.realtimeSttSocket = sttSocket;
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

        sendAudioChunk(current.realtimeSttSocket, message.audio);
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
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    console.error("SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
    process.exit(1);
  }

  await mkdir(RECORDINGS_DIR, { recursive: true });
  server.listen(PORT, () => {
    console.log(`Voice server listening on http://localhost:${PORT}`);
    console.log("Workflow source: Supabase (per-connection, deployment required)");
    if (ALLOW_LOCAL_WEBHOOKS) console.warn("⚠️  ALLOW_LOCAL_WEBHOOKS=true — local webhook URLs are permitted");
  });
}

bootstrap().catch((err) => {
  console.error("Failed to bootstrap:", err);
  process.exit(1);
});
