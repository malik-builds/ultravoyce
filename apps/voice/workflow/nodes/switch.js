import { classifyIntent } from "../../services/llm.js";
import { log } from "../../services/log.js";

// Classifies the user's utterance and routes to the matching case.
export async function enter({ session, node, speak, send, interpolate }) {
  const cfg = node.config || {};

  // If the prompt references a session variable and that variable already has a value,
  // classify immediately without asking the user again.
  // e.g. prompt: "The caller said they need {{ userNeed }} classify their intent."
  const varRefs = (cfg.prompt || "").match(/\{\{\s*(\w+)\s*\}\}/g) || [];
  const storedValues = varRefs
    .map((ref) => ref.replace(/\{\{\s*|\s*\}\}/g, "").trim())
    .map((name) => session.variables[name]?.value)
    .filter((v) => v != null && String(v).trim() !== "");

  if (storedValues.length > 0) {
    const utterance = storedValues.join(" ");
    log.info("SWITCH", "classifying from stored variable", { utterance });
    return classifyAndRoute({ session, node, speak, send, interpolate }, utterance);
  }

  if (cfg.entryMessage) {
    await speak(session, interpolate(cfg.entryMessage, session.variables));
  }
  return { waitForInput: true };
}

export async function handleInput({ session, node, speak, send, interpolate }, utterance) {
  return classifyAndRoute({ session, node, speak, send, interpolate }, utterance);
}

async function classifyAndRoute({ session, node, speak, send, interpolate }, utterance) {
  const cfg = node.config || {};

  // Interpolate the prompt so {{ userNeed }} etc. are substituted before the LLM sees it.
  const interpolatedNode = {
    ...node,
    config: { ...cfg, prompt: interpolate(cfg.prompt || "Classify intent", session.variables) },
  };

  let selected = "";
  try {
    selected = await classifyIntent(session, interpolatedNode, utterance);
  } catch (err) {
    log.error("SWITCH", "classification failed", { err: err.message });
  }

  log.info("SWITCH", "classification result", { utterance, selected });

  const match = (cfg.cases || []).find((c) => c.value === selected);
  const nextNodeId = match?.nextNodeId || cfg.defaultCaseNextNodeId || null;

  if (!nextNodeId) {
    await speak(session, "I could not understand that. Could you rephrase it?");
    return { waitForInput: true };
  }

  // When routing via the default case (no intent matched), tag the session so the
  // next node knows to explain why it's asking for details before diving in.
  if (!match && cfg.defaultCaseNextNodeId) {
    session._defaultCaseMessage = "No worries! Let me take your details and we'll have someone reach out to you shortly.";
  }

  send(session.clientWs, {
    type: "workflow.switch.decision",
    nodeId: node.id,
    selectedCase: match?.value || null,
    nextNodeId,
  });

  return { waitForInput: false, nextNodeId };
}
