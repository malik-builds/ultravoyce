import OpenAI from "openai";
import { OPENAI_API_KEY, OPENAI_TEXT_MODEL } from "../config.js";

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

function historyMessages(turnObjects) {
  return turnObjects.slice(-10).map((t) => ({
    role: t.role === "assistant" ? "assistant" : "user",
    content: t.text,
  }));
}

export async function extractFields(session, utterance, fields) {
  const fieldsPrompt = fields
    .map((f) => `- ${f.variable} (${f.type}): ${f.description}`)
    .join("\n");
  const existing = Object.fromEntries(
    fields.map((f) => [f.variable, session.variables[f.variable]?.value ?? null])
  );

  const { choices } = await openai.chat.completions.create({
    model: OPENAI_TEXT_MODEL,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Extract structured values from the conversation. Return JSON with key \`values\` containing variable-value pairs. Set to null if unknown.\n\nFields:\n${fieldsPrompt}\n\nAlready collected:\n${JSON.stringify(existing)}`,
      },
      ...historyMessages(session.turnObjects),
      { role: "user", content: utterance },
    ],
  });

  const parsed = JSON.parse(choices[0]?.message?.content || "{}");
  // LLM sometimes wraps in `values`, sometimes returns the map directly
  if (parsed.values && typeof parsed.values === "object" && !Array.isArray(parsed.values)) {
    return parsed.values;
  }
  // If parsed itself looks like a variable map (has at least one of the expected keys), use it directly
  const fieldVars = new Set(fields.map((f) => f.variable));
  const directKeys = Object.keys(parsed).filter((k) => fieldVars.has(k));
  if (directKeys.length > 0) return parsed;
  return {};
}

export async function classifyIntent(session, node, utterance) {
  const prompt = node.config?.prompt || "Classify intent";
  const cases = node.config?.cases || [];
  const options = cases.map((c) => `${c.value}: ${c.label}`).join("\n");

  const { choices } = await openai.chat.completions.create({
    model: OPENAI_TEXT_MODEL,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: 'Classify user intent into one of the provided case values. Return JSON {"value":"..."} only.',
      },
      { role: "user", content: `Instruction: ${prompt}\nCases:\n${options}\nUser: ${utterance}` },
    ],
  });

  const parsed = JSON.parse(choices[0]?.message?.content || "{}");
  return String(parsed.value || "").trim();
}

// Extracts a single string value from a free-form utterance using LLM.
export async function extractSingleValue(utterance, description) {
  const { choices } = await openai.chat.completions.create({
    model: OPENAI_TEXT_MODEL,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Extract the ${description} from the user's message. Return JSON: {"value": "<extracted>"} or {"value": null} if not present.`,
      },
      { role: "user", content: utterance },
    ],
  });
  const parsed = JSON.parse(choices[0]?.message?.content || "{}");
  return parsed.value != null ? String(parsed.value) : null;
}

// Converts raw cal.com slot objects into a natural spoken description.
export async function slotsToNaturalLanguage(flatSlots, timezone) {
  const { choices } = await openai.chat.completions.create({
    model: OPENAI_TEXT_MODEL,
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content: `You are a voice booking assistant. Convert these available time slots into ONE short sentence listing up to 3 options, then ask "Which works for you?" Keep it under 25 words total. Use day names and times only (e.g. "Monday at 10am, 2pm, or Wednesday at 9am"). Timezone: ${timezone}.`,
      },
      { role: "user", content: `Available slots (ISO): ${JSON.stringify(flatSlots.slice(0, 3))}` },
    ],
  });
  return choices[0]?.message?.content?.trim() || "I have some slots available. Which would you prefer?";
}

// Determines whether the user selected a slot, declined, requested an unavailable time, or was unclear.
// flatSlots should be ALL available slots (not just the 3 displayed) so the LLM can check availability.
export async function parseSlotSelection(utterance, flatSlots, timezone) {
  const { choices } = await openai.chat.completions.create({
    model: OPENAI_TEXT_MODEL,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `A caller is selecting a booking time. ALL available slots (timezone: ${timezone}) are: ${JSON.stringify(flatSlots.slice(0, 20))}.

Determine their intent:
- They pick/mention a time that IS in the available slots → outcome: "selected_slot", slotTime: <exact ISO from list>
- They decline or say they don't want to book → outcome: "declined", slotTime: null
- They request a specific time that is NOT in the available slots → outcome: "unavailable_time", slotTime: null
- Intent is unclear → outcome: "unclear", slotTime: null

Return JSON: {"outcome": "selected_slot"|"declined"|"unavailable_time"|"unclear", "slotTime": "<ISO or null>"}`,
      },
      { role: "user", content: utterance },
    ],
  });
  const parsed = JSON.parse(choices[0]?.message?.content || "{}");
  return {
    outcome: parsed.outcome || "unclear",
    slotTime: parsed.slotTime || null,
  };
}

export async function answerQuery(session, node, utterance) {
  const knowledge = node.config?.knowledgeBase || "";
  const fallback = node.config?.fallbackMessage || "I do not have that information right now.";

  const { choices } = await openai.chat.completions.create({
    model: OPENAI_TEXT_MODEL,
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content: `Answer questions using only this knowledge base:\n${knowledge}\nIf the answer is not present, reply exactly: __FALLBACK__`,
      },
      ...historyMessages(session.turnObjects),
      { role: "user", content: utterance },
    ],
  });

  const text = choices[0]?.message?.content?.trim() || "";
  return !text || text === "__FALLBACK__" ? fallback : text;
}
