import { parseBasicType, isLikelyValidValue, firstMissingRequired } from "../helpers.js";
import { extractFields } from "../../services/llm.js";

// Collects multiple fields one at a time via natural conversation.
export async function enter({ session, node, speak, interpolate }) {
  const next = firstMissingRequired(node, session);
  if (!next) return { waitForInput: false, nextNodeId: node.nextNodeId };

  const question = next.question || `Could I get your ${next.description.toLowerCase()}?`;
  await speak(session, interpolate(question, session.variables));
  return { waitForInput: true };
}

export async function handleInput({ session, node, speak, setVar, interpolate }, utterance) {
  const fields = node.config?.fields || [];
  let extracted = {};
  try {
    extracted = await extractFields(session, utterance, fields);
  } catch (err) {
    console.error("Field extraction failed:", err);
    await speak(session, "I had trouble understanding that. Could you repeat it?");
    return { waitForInput: true };
  }

  for (const field of fields) {
    if (!(field.variable in extracted)) continue;
    const parsed = parseBasicType(extracted[field.variable], field.type || "string");
    if (parsed != null && isLikelyValidValue(field, parsed)) {
      setVar(session, field.variable, parsed);
    }
  }

  const next = firstMissingRequired(node, session);
  if (next) {
    const question = next.question || `Got it. Could I also get your ${next.description.toLowerCase()}?`;
    await speak(session, interpolate(question, session.variables));
    return { waitForInput: true };
  }

  return { waitForInput: false, nextNodeId: node.nextNodeId };
}
