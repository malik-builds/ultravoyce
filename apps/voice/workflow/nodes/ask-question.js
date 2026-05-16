import { extractSingleValue } from "../../services/llm.js";
import { parseBasicType } from "../helpers.js";

// Asks a single question and stores the answer in a variable.
export async function enter({ session, node, speak, interpolate }) {
  await speak(session, interpolate(node.config?.question || "Please answer.", session.variables));
  return { waitForInput: true };
}

export async function handleInput({ session, node, speak, setVar }, utterance) {
  const varType = node.config?.variableType || "string";

  let parsed;
  if (varType === "string") {
    const extracted = await extractSingleValue(utterance, node.config?.description || node.config?.storeIn || "answer");
    parsed = extracted != null ? extracted : null;
  } else {
    parsed = parseBasicType(utterance, varType);
  }

  if (parsed == null) {
    await speak(session, "I didn't quite catch that. Could you say it again?");
    return { waitForInput: true };
  }
  setVar(session, node.config?.storeIn, parsed);
  return { waitForInput: false, nextNodeId: node.nextNodeId };
}
