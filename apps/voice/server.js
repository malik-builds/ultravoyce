import "dotenv/config";
import express from "express";
import { createServer } from "http";
import WebSocket, { WebSocketServer } from "ws";
import { mkdir, readFile, writeFile } from "fs/promises";
import { createWriteStream } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import OpenAI from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 8001);
const RECORDINGS_DIR = path.join(__dirname, "recordings");
const WORKFLOW_PATH = process.env.WORKFLOW_PATH || path.join(__dirname, "workflows", "default.json");
const ELEVENLABS_STT_WS_URL =
  "wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&audio_format=pcm_24000&commit_strategy=vad";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL || "eleven_flash_v2_5";
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "Xb7hH8MSUJpSbSDYk0k2";
const ELEVENLABS_TTS_WS_URL = `wss://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream-input?model_id=${ELEVENLABS_TTS_MODEL}`;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini";
const AUTO_HANGUP_MS = Number(process.env.AUTO_HANGUP_MS || 30000);
const TTS_TIMEOUT_MS = Number(process.env.TTS_TIMEOUT_MS || 15000);
const TTS_SENTENCE_FLUSH_REGEX = /[.!?]\s$/;
const MAX_NODE_VISITS = 60;
const MAX_RECORDING_BYTES = Number(process.env.MAX_RECORDING_BYTES || 15 * 1024 * 1024);

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.use("/vendor/three", express.static(path.join(__dirname, "node_modules", "three", "build")));

let workflowDefinition = null;

app.get("/health", (_req, res) => {
  res.json({ ok: true, workflowLoaded: Boolean(workflowDefinition?.workflow?.id) });
});

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 * 20 });
const sessions = new Map();

async function ensureDir(targetPath) {
  await mkdir(targetPath, { recursive: true });
}

async function loadWorkflowDefinition() {
  const content = await readFile(WORKFLOW_PATH, "utf8");
  const parsed = JSON.parse(content);
  if (!parsed.workflow || !Array.isArray(parsed.workflow.nodes)) {
    throw new Error("Invalid workflow file: missing workflow.nodes");
  }
  if (!parsed.workflow.entryNodeId) {
    throw new Error("Invalid workflow file: missing entryNodeId");
  }
  return parsed;
}

function sendToClient(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function getNodeById(workflow, nodeId) {
  return workflow.nodes.find((node) => node.id === nodeId) || null;
}

function cloneVariables(globalVariables) {
  const result = {};
  for (const [key, value] of Object.entries(globalVariables || {})) {
    result[key] = { ...value };
  }
  return result;
}

function interpolateString(raw, variables) {
  if (typeof raw !== "string") return raw;
  return raw.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, keyExpr) => {
    const key = String(keyExpr).trim();
    if (key.startsWith("secrets.")) {
      const secretName = key.slice("secrets.".length);
      return process.env[secretName] || "";
    }
    return variables[key]?.value == null ? "" : String(variables[key].value);
  });
}

function buildWorkflowSnapshot(session) {
  const node = getNodeById(session.workflow.workflow, session.currentNodeId);
  const variables = {};
  for (const [key, entry] of Object.entries(session.variables)) {
    variables[key] = entry.value;
  }

  let pendingRequired = [];
  if (node?.type === "get_details") {
    pendingRequired = (node.config?.fields || [])
      .filter((field) => field.required)
      .filter((field) => {
        const value = session.variables[field.variable]?.value;
        return value == null || String(value).trim() === "";
      })
      .map((field) => field.variable);
  }

  return {
    nodeId: node?.id || null,
    nodeType: node?.type || null,
    nodeLabel: node?.label || null,
    pendingRequired,
    variables,
  };
}

function emitWorkflowState(session) {
  sendToClient(session.clientWs, {
    type: "workflow.state",
    ...buildWorkflowSnapshot(session),
  });
}

function makeRealtimeSttConnection(onMessage) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(ELEVENLABS_STT_WS_URL, {
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
      },
    });

    socket.once("open", () => {
      socket.off("error", reject);
      socket.on("error", (error) => {
        console.error("Realtime STT socket error:", error);
      });
      resolve(socket);
    });
    socket.on("message", onMessage);
    socket.once("error", reject);
  });
}

async function synthesizeSpeechStream(text, onAudioChunk) {
  return await new Promise((resolve, reject) => {
    const ttsSocket = new WebSocket(ELEVENLABS_TTS_WS_URL, {
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
      },
    });

    let settled = false;
    const safeResolve = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve();
    };
    const safeReject = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      try {
        ttsSocket.close();
      } catch {
        // ignore
      }
      reject(error);
    };
    const timeoutId = setTimeout(() => safeReject(new Error("TTS stream timeout")), TTS_TIMEOUT_MS);

    let sendBuffer = "";
    ttsSocket.once("open", () => {
      ttsSocket.send(
        JSON.stringify({
          text: " ",
          voice_settings: { stability: 0.4, similarity_boost: 0.8, use_speaker_boost: true },
          generation_config: { chunk_length_schedule: [80, 120, 180, 240] },
        })
      );

      for (const char of text) {
        sendBuffer += char;
        if (sendBuffer.length >= 90 || TTS_SENTENCE_FLUSH_REGEX.test(sendBuffer)) {
          ttsSocket.send(JSON.stringify({ text: sendBuffer }));
          sendBuffer = "";
        }
      }
      if (sendBuffer) {
        ttsSocket.send(JSON.stringify({ text: sendBuffer, flush: true }));
      } else {
        ttsSocket.send(JSON.stringify({ text: " ", flush: true }));
      }
      ttsSocket.send(JSON.stringify({ text: "" }));
    });

    ttsSocket.on("message", (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.audio) onAudioChunk(data.audio);
        if (data.isFinal) {
          ttsSocket.close();
          safeResolve();
        }
      } catch (error) {
        safeReject(error);
      }
    });

    ttsSocket.once("error", safeReject);
    ttsSocket.once("close", safeResolve);
  });
}

function appendTurn(session, role, text) {
  const clean = String(text || "").trim();
  if (!clean) return;
  session.turns.push(`${role}: ${clean}`);
  session.turnObjects.push({
    role,
    text: clean,
    ts: new Date().toISOString(),
    nodeId: session.currentNodeId,
  });
}

async function speakText(session, text) {
  const clean = String(text || "").trim();
  if (!clean || session.closed) return;
  session.isSpeaking = true;
  appendTurn(session, "assistant", clean);
  sendToClient(session.clientWs, { type: "assistant.final", text: clean });
  sendToClient(session.clientWs, { type: "assistant.speaking" });
  try {
    await synthesizeSpeechStream(clean, (audioBase64) => {
      sendToClient(session.clientWs, {
        type: "assistant.audio.chunk",
        audio: audioBase64,
        mimeType: "audio/mpeg",
      });
    });
  } catch (error) {
    console.error("TTS generation failed:", error);
    sendToClient(session.clientWs, { type: "error", message: "TTS generation failed." });
  } finally {
    session.isSpeaking = false;
    sendToClient(session.clientWs, { type: "assistant.speaking.done" });
  }
}

function setVariable(session, name, value) {
  if (!session.variables[name]) return;
  session.variables[name].value = value;
  sendToClient(session.clientWs, {
    type: "workflow.variable.updated",
    variable: name,
    value,
  });
}

function parseBasicType(rawValue, variableType) {
  if (rawValue == null) return null;
  const value = String(rawValue).trim();
  if (!value) return null;
  if (variableType === "number") {
    const n = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  if (variableType === "boolean") {
    const lowered = value.toLowerCase();
    if (["yes", "y", "true", "confirm", "confirmed"].includes(lowered)) return true;
    if (["no", "n", "false", "cancel"].includes(lowered)) return false;
    return null;
  }
  return value;
}

function isLikelyValidFieldValue(field, value) {
  if (value == null) return false;
  const str = String(value).trim();
  if (!str) return false;

  const desc = String(field?.description || "").toLowerCase();
  const variable = String(field?.variable || "").toLowerCase();

  if (desc.includes("email") || variable.includes("email")) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
  }
  if (desc.includes("phone") || variable.includes("phone")) {
    return /^[+\d][\d\s\-()]{6,}$/.test(str);
  }
  return true;
}

async function extractDetailsWithLlm(session, utterance, fields) {
  const fieldsPrompt = fields
    .map((field) => `- ${field.variable} (${field.type}): ${field.description}`)
    .join("\n");
  const existingValues = {};
  for (const field of fields) {
    existingValues[field.variable] = session.variables[field.variable]?.value ?? null;
  }

  const completion = await openai.chat.completions.create({
    model: OPENAI_TEXT_MODEL,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Extract structured values from caller text. Return strictly JSON object with key `values` containing variable-value pairs. If missing, set to null.",
      },
      {
        role: "user",
        content: `Fields:\n${fieldsPrompt}\nExisting values:\n${JSON.stringify(existingValues)}\nCaller utterance:\n${utterance}`,
      },
    ],
  });

  const content = completion.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);
  return parsed.values && typeof parsed.values === "object" ? parsed.values : {};
}

async function classifySwitchCase(session, node, utterance) {
  const prompt = interpolateString(node.config?.prompt || "Classify intent", session.variables);
  const cases = node.config?.cases || [];
  const options = cases.map((c) => `${c.value}: ${c.label}`).join("\n");

  const completion = await openai.chat.completions.create({
    model: OPENAI_TEXT_MODEL,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Classify user intent into one of the provided case values. Return JSON {\"value\":\"...\"} only.",
      },
      {
        role: "user",
        content: `Instruction: ${prompt}\nCases:\n${options}\nUser utterance:\n${utterance}`,
      },
    ],
  });
  const content = completion.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);
  return String(parsed.value || "").trim();
}

async function answerWithKnowledge(session, node, utterance) {
  const knowledge = node.config?.knowledgeBase || "";
  const fallbackMessage = node.config?.fallbackMessage || "I do not have that information right now.";
  const historyTurns = session.turnObjects.slice(-8).map((turn) => ({ role: turn.role, content: turn.text }));

  const completion = await openai.chat.completions.create({
    model: OPENAI_TEXT_MODEL,
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content:
          `You answer user questions using only this knowledge base:\n${knowledge}\n` +
          "If answer is not present, reply exactly with: __FALLBACK__",
      },
      ...historyTurns,
      {
        role: "user",
        content: utterance,
      },
    ],
  });

  let text = completion.choices?.[0]?.message?.content?.trim() || "";
  if (!text || text === "__FALLBACK__") {
    text = fallbackMessage;
  }
  return text;
}

async function executeActionNode(session, node) {
  const webhookUrl = interpolateString(node.config?.webhookUrl || "", session.variables);
  const method = node.config?.method || "POST";
  const payloadTemplate = node.config?.payload || {};
  const payload = {};
  for (const [key, value] of Object.entries(payloadTemplate)) {
    payload[key] = typeof value === "string" ? interpolateString(value, session.variables) : value;
  }
  if (!webhookUrl) {
    return { ok: false, message: "Missing webhookUrl in action node." };
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(webhookUrl);
  } catch {
    return { ok: false, message: "Invalid webhook URL." };
  }
  if (parsedUrl.protocol !== "https:") {
    return { ok: false, message: "Webhook URL must use https." };
  }
  const privateRangeHostRegex =
    /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|::1|0\.0\.0\.0|fc|fd)/i;
  if (privateRangeHostRegex.test(parsedUrl.hostname)) {
    return { ok: false, message: "Webhook host is blocked." };
  }
  try {
    const response = await fetch(parsedUrl.toString(), {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      return { ok: false, message: `Webhook failed with status ${response.status}` };
    }
    return { ok: true, message: "Webhook executed." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Webhook request failed" };
  }
}

async function executeCalendarNode(session, node) {
  const config = node.config || {};
  const apiKeyRaw = interpolateString(config.calComApiKey || "", session.variables);
  if (!apiKeyRaw) {
    return { ok: false, message: "CAL_COM_API_KEY secret missing." };
  }
  const attendeeName = session.variables[config.attendeeNameVariable]?.value || "Caller";
  const attendeeEmail = session.variables[config.attendeeEmailVariable]?.value;
  if (!attendeeEmail) {
    return { ok: false, message: "Attendee email missing; cannot book appointment." };
  }
  const bookingId = `demo_${crypto.randomUUID().slice(0, 10)}`;
  const bookingTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  setVariable(session, config.bookingIdVariable, bookingId);
  setVariable(session, config.bookingTimeVariable, bookingTime);
  setVariable(session, config.bookingConfirmationVariable, true);
  const confirmation = interpolateString(
    config.confirmationMessage || `Done ${attendeeName}, your booking is set for ${bookingTime}.`,
    session.variables
  );
  return { ok: true, message: confirmation };
}

async function processLinearNodesUntilInput(session) {
  const workflow = session.workflow.workflow;
  let safetyCounter = 0;
  while (!session.closed && safetyCounter < MAX_NODE_VISITS) {
    safetyCounter += 1;
    const node = getNodeById(workflow, session.currentNodeId);
    if (!node) {
      throw new Error(`Node ${session.currentNodeId} not found`);
    }

    sendToClient(session.clientWs, { type: "workflow.node.entered", nodeId: node.id, nodeType: node.type });
    emitWorkflowState(session);

    if (["ask_question", "get_details", "answer_queries", "switch"].includes(node.type)) {
      session.awaitingInput = true;
      if (node.type === "ask_question") {
        await speakText(session, interpolateString(node.config?.question || "Please answer.", session.variables));
      } else if (node.type === "get_details") {
        const requiredMissing = (node.config?.fields || [])
          .filter((f) => f.required)
          .filter((f) => {
            const value = session.variables[f.variable]?.value;
            return value == null || String(value).trim() === "";
          });
        if (requiredMissing.length) {
          const guidance = requiredMissing.map((f) => f.description).join(", ");
          await speakText(
            session,
            interpolateString(
              `${node.config?.prompt || "I need a few details."} Please provide: ${guidance}.`,
              session.variables
            )
          );
        } else {
          session.awaitingInput = false;
          session.currentNodeId = node.nextNodeId;
          continue;
        }
      } else if (node.type === "answer_queries") {
        await speakText(session, "Go ahead. What would you like to know?");
      }
      sendToClient(session.clientWs, { type: "workflow.node.waiting", nodeId: node.id });
      return;
    }

    if (node.type === "tell") {
      await speakText(session, interpolateString(node.config?.message || "", session.variables));
      session.currentNodeId = node.nextNodeId;
    } else if (node.type === "action") {
      const result = await executeActionNode(session, node);
      sendToClient(session.clientWs, { type: "workflow.action.result", nodeId: node.id, ...result });
      if (!result.ok && node.config?.onFailure === "stop") {
        session.currentNodeId = null;
      } else {
        session.currentNodeId = node.nextNodeId;
      }
    } else if (node.type === "calendar_booker") {
      const result = await executeCalendarNode(session, node);
      sendToClient(session.clientWs, { type: "workflow.calendar.result", nodeId: node.id, ...result });
      await speakText(session, result.message);
      if (!result.ok && node.config?.onFailure === "stop") {
        session.currentNodeId = null;
      } else {
        session.currentNodeId = node.nextNodeId;
      }
    } else if (node.type === "transfer_call") {
      await speakText(session, interpolateString(node.config?.message || "Transferring your call now.", session.variables));
      sendToClient(session.clientWs, {
        type: "workflow.transfer.requested",
        transferTo: interpolateString(node.config?.transferTo || "", session.variables),
      });
      session.currentNodeId = node.nextNodeId;
    } else {
      session.currentNodeId = node.nextNodeId;
    }

    sendToClient(session.clientWs, { type: "workflow.node.exited", nodeId: node.id, nextNodeId: session.currentNodeId });
    if (!session.currentNodeId) {
      sendToClient(session.clientWs, { type: "workflow.completed" });
      return;
    }
  }
}

async function handleUserInputForCurrentNode(session, utterance) {
  const workflow = session.workflow.workflow;
  const node = getNodeById(workflow, session.currentNodeId);
  if (!node || session.closed) return;
  appendTurn(session, "user", utterance);
  sendToClient(session.clientWs, { type: "transcript.final", role: "user", text: utterance });
  sendToClient(session.clientWs, { type: "workflow.user.turn", nodeId: node.id, text: utterance });

  if (node.type === "ask_question") {
    const variableName = node.config?.storeIn;
    const variableType = node.config?.variableType || "string";
    const parsed = parseBasicType(utterance, variableType);
    if (parsed == null) {
      await speakText(session, "I could not understand that clearly. Please repeat.");
      return;
    }
    setVariable(session, variableName, parsed);
    session.currentNodeId = node.nextNodeId;
    session.awaitingInput = false;
    await processLinearNodesUntilInput(session);
    return;
  }

  if (node.type === "get_details") {
    const fields = node.config?.fields || [];
    let extracted = {};
    try {
      extracted = await extractDetailsWithLlm(session, utterance, fields);
    } catch (error) {
      console.error("Detail extraction failed:", error);
      await speakText(session, "I had trouble understanding that. Please repeat your details.");
      return;
    }

    for (const field of fields) {
      if (!(field.variable in extracted)) continue;
      const parsed = parseBasicType(extracted[field.variable], field.type || "string");
      if (parsed != null && isLikelyValidFieldValue(field, parsed)) {
        setVariable(session, field.variable, parsed);
      }
    }

    const missingRequired = fields
      .filter((field) => field.required)
      .filter((field) => {
        const value = session.variables[field.variable]?.value;
        return value == null || String(value).trim() === "";
      });

    if (missingRequired.length) {
      const prompt = missingRequired.map((field) => field.description).join(", ");
      await speakText(session, `Thanks. I still need: ${prompt}.`);
      emitWorkflowState(session);
      return;
    }

    session.currentNodeId = node.nextNodeId;
    session.awaitingInput = false;
    await processLinearNodesUntilInput(session);
    return;
  }

  if (node.type === "answer_queries") {
    const answer = await answerWithKnowledge(session, node, utterance);
    await speakText(session, answer);
    session.answerTurns += 1;
    const maxTurns = Number(node.config?.maxTurns || 6);
    if (session.answerTurns >= maxTurns) {
      session.answerTurns = 0;
      session.currentNodeId = node.nextNodeId;
      session.awaitingInput = false;
      await processLinearNodesUntilInput(session);
    }
    return;
  }

  if (node.type === "switch") {
    let selected = "";
    try {
      selected = await classifySwitchCase(session, node, utterance);
    } catch (error) {
      console.error("Switch classification failed:", error);
    }
    const caseMatch = (node.config?.cases || []).find((c) => c.value === selected);
    if (!caseMatch?.nextNodeId && !node.config?.defaultCaseNextNodeId) {
      await speakText(session, "I could not classify that. Please say it another way.");
      return;
    }
    session.currentNodeId = caseMatch?.nextNodeId || node.config?.defaultCaseNextNodeId || null;
    sendToClient(session.clientWs, {
      type: "workflow.switch.decision",
      nodeId: node.id,
      selectedCase: caseMatch?.value || null,
      nextNodeId: session.currentNodeId,
    });
    session.awaitingInput = false;
    await processLinearNodesUntilInput(session);
  }
}

async function finalizeSession(session, reason) {
  if (!session || session.closed) return;
  session.closed = true;
  if (session.autoHangupTimer) {
    clearTimeout(session.autoHangupTimer);
  }
  if (session.realtimeSttSocket?.readyState === WebSocket.OPEN) {
    session.realtimeSttSocket.close();
  }
  if (!session.audioStream.writableEnded && !session.audioStream.destroyed) {
    await new Promise((resolve) => session.audioStream.end(resolve));
  }
  const metadata = {
    sessionId: session.sessionId,
    workflowId: session.workflow.workflow.id,
    createdAt: session.createdAt,
    endedAt: new Date().toISOString(),
    reason,
    audioChunksReceived: session.audioChunksReceived,
    turns: session.turns.length,
    autoHangupMs: AUTO_HANGUP_MS,
  };

  await Promise.all([
    writeFile(path.join(session.sessionDir, "transcript.txt"), session.turns.join("\n"), "utf8"),
    writeFile(path.join(session.sessionDir, "workflow_trace.json"), JSON.stringify(session.turnObjects, null, 2), "utf8"),
    writeFile(path.join(session.sessionDir, "metadata.json"), JSON.stringify(metadata, null, 2), "utf8"),
  ]);
}

server.on("upgrade", (request, socket, head) => {
  socket.on("error", (error) => {
    console.error("Socket upgrade error:", error);
  });
  const { pathname } = new URL(request.url, "http://localhost");
  if (pathname !== "/ws") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws);
  });
});

wss.on("connection", async (ws) => {
  if (!OPENAI_API_KEY || !ELEVENLABS_API_KEY || !workflowDefinition) {
    sendToClient(ws, {
      type: "error",
      message: "Server missing OPENAI_API_KEY, ELEVENLABS_API_KEY, or workflow definition.",
    });
    ws.close(1011, "missing configuration");
    return;
  }

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });

  let session;
  try {
    const sessionId = crypto.randomUUID();
    const sessionDir = path.join(RECORDINGS_DIR, sessionId);
    await ensureDir(sessionDir);

    const audioFilePath = path.join(sessionDir, "audio.pcm");
    const audioStream = createWriteStream(audioFilePath, { flags: "a" });

    session = {
      sessionId,
      sessionDir,
      audioFilePath,
      audioStream,
      audioChunksReceived: 0,
      closed: false,
      stopRequested: false,
      isSpeaking: false,
      awaitingInput: false,
      answerTurns: 0,
      recordedBytes: 0,
      turns: [],
      turnObjects: [],
      workflow: workflowDefinition,
      variables: cloneVariables(workflowDefinition.workflow.globalVariables || {}),
      currentNodeId: workflowDefinition.workflow.entryNodeId,
      lastAudioAt: Date.now(),
      autoHangupTimer: null,
      createdAt: new Date().toISOString(),
      clientWs: ws,
      realtimeSttSocket: null,
      queue: Promise.resolve(),
    };

    const sttSocket = await makeRealtimeSttConnection((raw) => {
      let event;
      try {
        event = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (event.message_type === "session_started") {
        sendToClient(ws, { type: "stt.ready" });
        session.queue = session.queue
          .then(async () => {
            await processLinearNodesUntilInput(session);
            emitWorkflowState(session);
          })
          .catch((error) => {
            console.error("Workflow queue startup task failed:", error);
            sendToClient(ws, { type: "error", message: "Workflow runtime failed during startup." });
          });
      }

      if (event.message_type === "partial_transcript") {
        sendToClient(ws, { type: "transcript.partial", text: event.text || "" });
      }

      if (event.message_type === "committed_transcript") {
        const transcript = String(event.text || "").trim();
        if (!transcript || session.closed) return;
        session.lastAudioAt = Date.now();
        session.queue = session.queue
          .then(async () => {
            await handleUserInputForCurrentNode(session, transcript);
            emitWorkflowState(session);
          })
          .catch((error) => {
            console.error("Workflow queue turn task failed:", error);
            sendToClient(ws, { type: "error", message: "Workflow processing failed for this turn." });
          });
      }
    });
    session.realtimeSttSocket = sttSocket;

    sessions.set(ws, session);
    sendToClient(ws, { type: "session.started", sessionId });
    sendToClient(ws, { type: "call.state", state: "connected" });
    sendToClient(ws, { type: "workflow.started", workflowId: workflowDefinition.workflow.id });
  } catch (error) {
    console.error("Session initialization failed:", error);
    sendToClient(ws, { type: "error", message: "Failed to initialize voice session." });
    ws.close(1011, "session setup failed");
    return;
  }

  function resetAutoHangupTimer() {
    if (!session || session.closed) return;
    if (session.autoHangupTimer) clearTimeout(session.autoHangupTimer);
    session.autoHangupTimer = setTimeout(() => {
      if (session.closed) return;
      if (session.isSpeaking) {
        resetAutoHangupTimer();
        return;
      }
      sendToClient(ws, { type: "call.auto_hangup" });
      ws.close(1000, "auto hangup");
    }, AUTO_HANGUP_MS);
  }

  resetAutoHangupTimer();

  ws.on("message", async (data, isBinary) => {
    const current = sessions.get(ws);
    if (!current || current.closed) return;
    try {
      if (isBinary) return;

      const message = JSON.parse(data.toString());
      if (message.type === "audio.chunk" && typeof message.audio === "string") {
        current.lastAudioAt = Date.now();
        resetAutoHangupTimer();

        const pcmBytes = Buffer.from(message.audio, "base64");
        current.recordedBytes += pcmBytes.length;
        if (current.recordedBytes > MAX_RECORDING_BYTES) {
          sendToClient(ws, { type: "error", message: "Recording size limit reached. Ending call." });
          current.stopRequested = true;
          ws.close(1009, "recording size limit");
          return;
        }
        current.audioChunksReceived += 1;
        const canContinue = current.audioStream.write(pcmBytes);
        if (!canContinue) {
          await new Promise((resolve) => current.audioStream.once("drain", resolve));
        }

        if (current.realtimeSttSocket?.readyState === WebSocket.OPEN) {
          current.realtimeSttSocket.send(
            JSON.stringify({
              message_type: "input_audio_chunk",
              audio_base_64: message.audio,
              commit: false,
            })
          );
        }
        return;
      }

      if (message.type === "call.end" || message.type === "call.decline") {
        current.stopRequested = true;
        ws.close(1000, "call ended by user");
      }
    } catch (error) {
      console.error("Message handling error:", error);
      sendToClient(ws, { type: "error", message: "Failed to process incoming message." });
    }
  });

  ws.on("close", async () => {
    const current = sessions.get(ws);
    sessions.delete(ws);
    if (!current) return;
    await finalizeSession(current, current.stopRequested ? "user_ended" : "socket_closed").catch((error) => {
      console.error("Finalize on close failed:", error);
    });
  });
});

async function bootstrap() {
  await ensureDir(RECORDINGS_DIR);
  workflowDefinition = await loadWorkflowDefinition();
  server.listen(PORT, () => {
    console.log(`Voice server listening on http://localhost:${PORT}`);
    console.log(`Loaded workflow: ${workflowDefinition.workflow.name} (${workflowDefinition.workflow.id})`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to bootstrap voice server:", error);
  process.exit(1);
});
