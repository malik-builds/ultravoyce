import WebSocket from "ws";
import { MAX_NODE_VISITS } from "../config.js";
import { streamTTS } from "../services/tts.js";
import { getHandler } from "./nodes/index.js";
import { interpolateString } from "./helpers.js";
import { sendToClient, setVariable, appendTurn } from "./session.js";
import { log } from "../services/log.js";

// The context object passed into every node handler.
function makeCtx(session) {
  return {
    session,
    get node() { return getNode(session.workflow.workflow, session.currentNodeId); },
    speak: speakText,
    setVar: setVariable,
    send: sendToClient,
    interpolate: interpolateString,
  };
}

function getNode(workflow, nodeId) {
  return workflow.nodes.find((n) => n.id === nodeId) || null;
}

async function speakText(session, text) {
  const clean = String(text || "").trim();
  if (!clean || session.closed) return;
  session.isSpeaking = true;
  log.info("TTS", "speak start", { chars: clean.length, preview: clean.slice(0, 80) });
  appendTurn(session, "assistant", clean);
  sendToClient(session.clientWs, { type: "assistant.final", text: clean });
  sendToClient(session.clientWs, { type: "assistant.speaking" });
  let chunkCount = 0;
  let totalAudioBytes = 0;
  let firstChunkMs = null;
  const ttsStart = Date.now();
  try {
    await streamTTS(clean, (audioBase64) => {
      chunkCount++;
      const bytes = Math.round(audioBase64.length * 0.75);
      if (firstChunkMs === null) firstChunkMs = Date.now() - ttsStart;
      totalAudioBytes += bytes;
      log.debug("TTS", `audio chunk #${chunkCount}`, { bytes });
      sendToClient(session.clientWs, { type: "assistant.audio.chunk", audio: audioBase64, mimeType: "audio/mpeg" });
    });
    // Audio starts playing on the client when the first chunk arrives (≈ firstChunkMs from our start).
    // Estimate when playback ends: firstChunkMs + duration of all audio bytes.
    // Wait until that point before signalling done, so the next speak() doesn't tear down the player.
    const serverElapsedMs = Date.now() - ttsStart;
    const estimatedPlayMs = Math.round(totalAudioBytes / 16); // 128kbps ≈ 16 bytes/ms
    const playbackEndsAt = (firstChunkMs ?? serverElapsedMs) + estimatedPlayMs;
    const waitMs = Math.max(500, playbackEndsAt - serverElapsedMs + 400);
    log.info("TTS", "speak done — waiting for playback", { chunks: chunkCount, durationMs: serverElapsedMs, estimatedPlayMs, firstChunkMs, waitMs });
    await new Promise((r) => setTimeout(r, waitMs));
  } catch (err) {
    log.error("TTS", "stream failed", { err: err.message });
    sendToClient(session.clientWs, { type: "error", message: "TTS generation failed." });
  } finally {
    session.isSpeaking = false;
    sendToClient(session.clientWs, { type: "assistant.speaking.done" });
  }
}

function emitWorkflowState(session) {
  const node = getNode(session.workflow.workflow, session.currentNodeId);
  const variables = Object.fromEntries(
    Object.entries(session.variables).map(([k, v]) => [k, v.value])
  );
  sendToClient(session.clientWs, {
    type: "workflow.state",
    nodeId: node?.id || null,
    nodeType: node?.type || null,
    nodeLabel: node?.label || null,
    pendingRequired: [],
    variables,
  });
}

// Walks the node chain, executing each node until one needs user input or the workflow ends.
export async function processUntilInput(session) {
  // Guard: called with null currentNodeId after the last node returned nextNodeId: null
  if (!session.currentNodeId) {
    session.workflowCompleted = true;
    log.info("RUNTIME", "workflow completed");
    sendToClient(session.clientWs, { type: "workflow.completed" });
    return;
  }

  const workflow = session.workflow.workflow;
  let safety = 0;

  while (!session.closed && safety++ < MAX_NODE_VISITS) {
    const node = getNode(workflow, session.currentNodeId);
    if (!node) throw new Error(`Node ${session.currentNodeId} not found`);

    sendToClient(session.clientWs, { type: "workflow.node.entered", nodeId: node.id, nodeType: node.type });
    emitWorkflowState(session);

    const handler = getHandler(node.type);
    if (!handler) {
      log.warn("RUNTIME", `no handler for node type '${node.type}' — skipping`, { nodeId: node.id });
      session.currentNodeId = node.nextNodeId;
    } else {
      log.info("RUNTIME", `node enter`, { nodeId: node.id, type: node.type, label: node.label });
      const enterStart = Date.now();
      const ctx = { ...makeCtx(session), node };
      const result = await handler.enter(ctx);
      log.info("RUNTIME", `node enter done`, { nodeId: node.id, waitForInput: result.waitForInput, nextNodeId: result.nextNodeId, ms: Date.now() - enterStart });

      if (result.waitForInput) {
        session.awaitingInput = true;

        if (session._pendingInput) {
          const pending = session._pendingInput;
          session._pendingInput = null;
          log.info("RUNTIME", "consuming pending input from switch", { nodeId: node.id, pending });
          await handleUserInput(session, pending);
          return;
        }

        log.info("RUNTIME", `node waiting for input`, { nodeId: node.id, type: node.type });
        sendToClient(session.clientWs, { type: "workflow.node.waiting", nodeId: node.id });
        return;
      }
      session.currentNodeId = result.nextNodeId;
    }

    log.info("RUNTIME", `node exited`, { nodeId: node.id, nextNodeId: session.currentNodeId });
    sendToClient(session.clientWs, {
      type: "workflow.node.exited",
      nodeId: node.id,
      nextNodeId: session.currentNodeId,
    });

    if (!session.currentNodeId) {
      session.workflowCompleted = true;
      log.info("RUNTIME", "workflow completed");
      sendToClient(session.clientWs, { type: "workflow.completed" });
      return;
    }
  }
}

// Called when the user speaks while on an input-awaiting node.
export async function handleUserInput(session, utterance) {
  const node = getNode(session.workflow.workflow, session.currentNodeId);
  if (!node || session.closed) return;

  log.info("RUNTIME", "handleUserInput received", { nodeId: node.id, type: node.type, utterance, isProcessing: session.isProcessing, isSpeaking: session.isSpeaking });
  appendTurn(session, "user", utterance);
  sendToClient(session.clientWs, { type: "transcript.final", role: "user", text: utterance });
  sendToClient(session.clientWs, { type: "workflow.user.turn", nodeId: node.id, text: utterance });

  const handler = getHandler(node.type);
  if (!handler?.handleInput) {
    log.warn("RUNTIME", `node ${node.type} has no handleInput — advancing`);
    session.currentNodeId = node.nextNodeId;
    session.awaitingInput = false;
    await processUntilInput(session);
    return;
  }

  const inputStart = Date.now();
  const ctx = { ...makeCtx(session), node };
  const result = await handler.handleInput(ctx, utterance);
  log.info("RUNTIME", "handleInput done", { nodeId: node.id, waitForInput: result.waitForInput, nextNodeId: result.nextNodeId, ms: Date.now() - inputStart });
  emitWorkflowState(session);

  if (!result.waitForInput) {
    session.currentNodeId = result.nextNodeId;
    session.awaitingInput = false;
    await processUntilInput(session);
  }
}
