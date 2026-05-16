import { parseBasicType, isLikelyValidValue, firstMissingRequired } from "../helpers.js";
import { extractFields } from "../../services/llm.js";
import { log } from "../../services/log.js";

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
  const prevMissing = firstMissingRequired(node, session);

  let extracted = {};
  try {
    extracted = await extractFields(session, utterance, fields);
    log.info("GET_DETAILS", "LLM extraction result", { utterance, extracted });
  } catch (err) {
    log.error("GET_DETAILS", "extractFields threw", { err: err.message });
    await speak(session, "I had trouble understanding that. Could you repeat it?");
    return { waitForInput: true };
  }

  for (const field of fields) {
    if (!(field.variable in extracted)) continue;
    const parsed = parseBasicType(extracted[field.variable], field.type || "string");
    const valid = parsed != null && isLikelyValidValue(field, parsed);
    log.info("GET_DETAILS", "field", { variable: field.variable, raw: extracted[field.variable], parsed, valid });
    if (valid) {
      setVar(session, field.variable, parsed);
    }
  }

  const next = firstMissingRequired(node, session);
  if (next) {
    // Same field still missing → extraction failed, retry with a clarifying prompt
    const isRetry = prevMissing && prevMissing.variable === next.variable;
    const question = isRetry
      ? `Sorry, I didn't catch that. Could you repeat your ${next.description.toLowerCase()}?`
      : (next.question || `Got it. Could I also get your ${next.description.toLowerCase()}?`);
    await speak(session, interpolate(question, session.variables));
    return { waitForInput: true };
  }

  return { waitForInput: false, nextNodeId: node.nextNodeId };
}
