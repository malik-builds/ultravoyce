import WebSocket from "ws";
import { MAX_NODE_VISITS } from "../config.js";
import { streamTTS } from "../services/tts.js";
import { getHandler } from "./nodes/index.js";
import { interpolateString } from "./helpers.js";
import { sendToClient, setVariable, appendTurn } from "./session.js";

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
  appendTurn(session, "assistant", clean);
  sendToClient(session.clientWs, { type: "assistant.final", text: clean });
  sendToClient(session.clientWs, { type: "assistant.speaking" });
  try {
    await streamTTS(clean, (audioBase64) => {
      sendToClient(session.clientWs, { type: "assistant.audio.chunk", audio: audioBase64, mimeType: "audio/mpeg" });
    });
  } catch (err) {
    console.error("TTS error:", err);
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
  const workflow = session.workflow.workflow;
  let safety = 0;

  while (!session.closed && safety++ < MAX_NODE_VISITS) {
    const node = getNode(workflow, session.currentNodeId);
    if (!node) throw new Error(`Node ${session.currentNodeId} not found`);

    sendToClient(session.clientWs, { type: "workflow.node.entered", nodeId: node.id, nodeType: node.type });
    emitWorkflowState(session);

    const handler = getHandler(node.type);
    if (!handler) {
      console.warn(`No handler for node type: ${node.type}, skipping`);
      session.currentNodeId = node.nextNodeId;
    } else {
      const ctx = { ...makeCtx(session), node };
      const result = await handler.enter(ctx);

      if (result.waitForInput) {
        session.awaitingInput = true;
        sendToClient(session.clientWs, { type: "workflow.node.waiting", nodeId: node.id });
        return;
      }
      session.currentNodeId = result.nextNodeId;
    }

    sendToClient(session.clientWs, {
      type: "workflow.node.exited",
      nodeId: node.id,
      nextNodeId: session.currentNodeId,
    });

    if (!session.currentNodeId) {
      sendToClient(session.clientWs, { type: "workflow.completed" });
      return;
    }
  }
}

// Called when the user speaks while on an input-awaiting node.
export async function handleUserInput(session, utterance) {
  const node = getNode(session.workflow.workflow, session.currentNodeId);
  if (!node || session.closed) return;

  appendTurn(session, "user", utterance);
  sendToClient(session.clientWs, { type: "transcript.final", role: "user", text: utterance });
  sendToClient(session.clientWs, { type: "workflow.user.turn", nodeId: node.id, text: utterance });

  const handler = getHandler(node.type);
  if (!handler?.handleInput) {
    console.warn(`Node ${node.type} has no handleInput — advancing`);
    session.currentNodeId = node.nextNodeId;
    session.awaitingInput = false;
    await processUntilInput(session);
    return;
  }

  const ctx = { ...makeCtx(session), node };
  const result = await handler.handleInput(ctx, utterance);
  emitWorkflowState(session);

  if (!result.waitForInput) {
    session.currentNodeId = result.nextNodeId;
    session.awaitingInput = false;
    await processUntilInput(session);
  }
}
