import { classifyIntent } from "../../services/llm.js";

// Classifies the user's utterance and routes to the matching case.
export async function enter({ session, node, speak, interpolate }) {
  // Switch nodes wait for user to speak first — no prompt defined by default.
  // If the workflow author sets a prompt message, speak it.
  if (node.config?.entryMessage) {
    await speak(session, interpolate(node.config.entryMessage, session.variables));
  }
  return { waitForInput: true };
}

export async function handleInput({ session, node, speak, send }, utterance) {
  let selected = "";
  try {
    selected = await classifyIntent(session, node, utterance);
  } catch (err) {
    console.error("Switch classification failed:", err);
  }

  const match = (node.config?.cases || []).find((c) => c.value === selected);
  const nextNodeId = match?.nextNodeId || node.config?.defaultCaseNextNodeId || null;

  if (!nextNodeId) {
    await speak(session, "I could not understand that. Could you rephrase it?");
    return { waitForInput: true };
  }

  send(session.clientWs, {
    type: "workflow.switch.decision",
    nodeId: node.id,
    selectedCase: match?.value || null,
    nextNodeId,
  });

  return { waitForInput: false, nextNodeId };
}
