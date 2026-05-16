import "dotenv/config";
import express from "express";
import { createServer } from "http";
import WebSocket, { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import { mkdir } from "fs/promises";

import { PORT, RECORDINGS_DIR, WORKFLOW_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ALLOW_LOCAL_WEBHOOKS, OPENAI_API_KEY, ELEVENLABS_API_KEY, MAX_RECORDING_BYTES } from "./config.js";
import { loadFromFile, loadFromSupabase } from "./workflow/loader.js";
import { createSession, finalizeSession, sendToClient, startAutoHangupTimer, enforceRecordingCap } from "./workflow/session.js";
import { processUntilInput, handleUserInput } from "./workflow/runtime.js";
import { connectSTT, sendAudioChunk } from "./services/stt.js";
import { healthRouter } from "./routes/health.js";
import { workflowRouter } from "./routes/workflow.js";
import { sessionsRouter } from "./routes/sessions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── State ───────────────────────────────────────────────────────────────────
let workflowDefinition = null;
const sessions = new Map();

// ─── Express app ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/vendor/three", express.static(path.join(__dirname, "node_modules", "three", "build")));
app.use(healthRouter(() => workflowDefinition));
app.use(workflowRouter(() => workflowDefinition, (wf) => { workflowDefinition = wf; }));
app.use(sessionsRouter());

// ─── WebSocket server ─────────────────────────────────────────────────────────
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 * 20 });

server.on("upgrade", (request, socket, head) => {
  socket.on("error", (err) => console.error("Socket upgrade error:", err));
  const { pathname } = new URL(request.url, "http://localhost");
  if (pathname !== "/ws") { socket.destroy(); return; }
  wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws));
});

wss.on("connection", async (ws) => {
  if (!OPENAI_API_KEY || !ELEVENLABS_API_KEY || !workflowDefinition) {
    sendToClient(ws, { type: "error", message: "Server missing API keys or workflow definition." });
    ws.close(1011, "missing configuration");
    return;
  }

  ws.on("error", (err) => console.error("WebSocket error:", err));

  let session;
  try {
    session = await createSession(ws, workflowDefinition);

    const sttSocket = await connectSTT((raw) => {
      let event;
      try { event = JSON.parse(raw.toString()); } catch { return; }

      if (event.message_type === "session_started") {
        sendToClient(ws, { type: "stt.ready" });
        session.queue = session.queue
          .then(() => processUntilInput(session))
          .catch((err) => {
            console.error("Workflow startup error:", err);
            sendToClient(ws, { type: "error", message: "Workflow runtime failed during startup." });
          });
      }

      if (event.message_type === "partial_transcript") {
        sendToClient(ws, { type: "transcript.partial", text: event.text || "" });
      }

      if (event.message_type === "committed_transcript") {
        const transcript = String(event.text || "").trim();
        if (!transcript || session.closed || session.isSpeaking) return;
        session.lastAudioAt = Date.now();
        session.queue = session.queue
          .then(() => handleUserInput(session, transcript))
          .catch((err) => {
            console.error("Workflow turn error:", err);
            sendToClient(ws, { type: "error", message: "Workflow processing failed for this turn." });
          });
      }
    });

    session.realtimeSttSocket = sttSocket;
    sessions.set(ws, session);

    sendToClient(ws, { type: "session.started", sessionId: session.sessionId });
    sendToClient(ws, { type: "call.state", state: "connected" });
    sendToClient(ws, { type: "workflow.started", workflowId: workflowDefinition.workflow.id });
  } catch (err) {
    console.error("Session init failed:", err);
    sendToClient(ws, { type: "error", message: "Failed to initialize voice session." });
    ws.close(1011, "session setup failed");
    return;
  }

  startAutoHangupTimer(session, ws, () => ws.close(1000, "auto hangup"));

  ws.on("message", async (data, isBinary) => {
    const current = sessions.get(ws);
    if (!current || current.closed || isBinary) return;
    try {
      const message = JSON.parse(data.toString());

      if (message.type === "audio.chunk" && typeof message.audio === "string") {
        current.lastAudioAt = Date.now();
        startAutoHangupTimer(current, ws, () => ws.close(1000, "auto hangup"));

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
    await finalizeSession(current, current.stopRequested ? "user_ended" : "socket_closed").catch((err) => {
      console.error("Finalize on close failed:", err);
    });
  });
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function bootstrap() {
  await mkdir(RECORDINGS_DIR, { recursive: true });

  if (WORKFLOW_ID && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    console.log(`Loading workflow ${WORKFLOW_ID} from Supabase...`);
    workflowDefinition = await loadFromSupabase(WORKFLOW_ID);
  } else {
    workflowDefinition = await loadFromFile();
  }

  server.listen(PORT, () => {
    console.log(`Voice server listening on http://localhost:${PORT}`);
    console.log(`Loaded workflow: ${workflowDefinition.workflow.name} (${workflowDefinition.workflow.id})`);
    if (ALLOW_LOCAL_WEBHOOKS) console.warn("⚠️  ALLOW_LOCAL_WEBHOOKS=true — local webhook URLs are permitted");
  });
}

bootstrap().catch((err) => {
  console.error("Failed to bootstrap voice server:", err);
  process.exit(1);
});
