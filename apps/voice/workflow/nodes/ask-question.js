import { parseBasicType } from "../helpers.js";

// Asks a single question and stores the answer in a variable.
export async function enter({ session, node, speak, interpolate }) {
  await speak(session, interpolate(node.config?.question || "Please answer.", session.variables));
  return { waitForInput: true };
}

export async function handleInput({ session, node, speak, setVar }, utterance) {
  const parsed = parseBasicType(utterance, node.config?.variableType || "string");
  if (parsed == null) {
    await speak(session, "I could not understand that. Could you say it again?");
    return { waitForInput: true };
  }
  setVar(session, node.config?.storeIn, parsed);
  return { waitForInput: false, nextNodeId: node.nextNodeId };
}
