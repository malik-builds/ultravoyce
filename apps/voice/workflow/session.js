import crypto from "crypto";
import path from "path";
import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import WebSocket from "ws";
import { RECORDINGS_DIR, AUTO_HANGUP_MS, MAX_RECORDING_BYTES } from "../config.js";
import { writeSessionArtifacts } from "../storage/artifacts.js";

export function sendToClient(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

export function setVariable(session, name, value) {
  if (!session.variables[name]) return;
  session.variables[name].value = value;
  sendToClient(session.clientWs, { type: "workflow.variable.updated", variable: name, value });
}

export function appendTurn(session, role, text) {
  const clean = String(text || "").trim();
  if (!clean) return;
  session.turns.push(`${role}: ${clean}`);
  session.turnObjects.push({ role, text: clean, ts: new Date().toISOString(), nodeId: session.currentNodeId });
}

export async function createSession(ws, workflowDefinition) {
  const sessionId = crypto.randomUUID();
  const sessionDir = path.join(RECORDINGS_DIR, sessionId);
  await mkdir(sessionDir, { recursive: true });

  const audioFilePath = path.join(sessionDir, "audio.pcm");
  const audioStream = createWriteStream(audioFilePath, { flags: "a" });

  const wf = workflowDefinition.workflow;
  const variables = {};
  for (const [key, val] of Object.entries(wf.globalVariables || {})) {
    variables[key] = { ...val };
  }

  return {
    sessionId,
    sessionDir,
    audioFilePath,
    audioStream,
    audioChunksReceived: 0,
    recordedBytes: 0,
    closed: false,
    stopRequested: false,
    workflowCompleted: false,
    autoHangup: false,
    isSpeaking: false,
    isProcessing: false,
    awaitingInput: false,
    answerTurns: 0,
    calendarSlots: null,
    turns: [],
    turnObjects: [],
    workflow: workflowDefinition,
    variables,
    currentNodeId: wf.entryNodeId,
    lastAudioAt: Date.now(),
    autoHangupTimer: null,
    createdAt: new Date().toISOString(),
    clientWs: ws,
    realtimeSttSocket: null,
    capturedLeads: [],
    _pendingInput: null,
    queue: Promise.resolve(),
  };
}

export async function finalizeSession(session, reason) {
  if (!session || session.closed) return;
  session.closed = true;
  clearTimeout(session.autoHangupTimer);

  if (session.valseaSttSocket?.readyState === WebSocket.OPEN) {
    session.valseaSttSocket.close();
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

  await writeSessionArtifacts(session, metadata);
}

export function startAutoHangupTimer(session, ws, onHangup) {
  clearTimeout(session.autoHangupTimer);
  session.autoHangupTimer = setTimeout(() => {
    if (session.closed || session.isSpeaking) {
      startAutoHangupTimer(session, ws, onHangup);
      return;
    }
    sendToClient(ws, { type: "call.auto_hangup" });
    onHangup();
  }, AUTO_HANGUP_MS);
}

export function enforceRecordingCap(session, ws, chunkBytes) {
  session.recordedBytes += chunkBytes;
  if (session.recordedBytes > MAX_RECORDING_BYTES) {
    sendToClient(ws, { type: "error", message: "Recording size limit reached. Ending call." });
    return false;
  }
  return true;
}
