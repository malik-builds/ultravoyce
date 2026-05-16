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
  return parsed.values && typeof parsed.values === "object" ? parsed.values : {};
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
