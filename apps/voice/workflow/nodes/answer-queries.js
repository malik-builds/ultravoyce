import { answerQuery } from "../../services/llm.js";
import { extractSingleValue } from "../../services/llm.js";
import { log } from "../../services/log.js";

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;
const PHONE_RE = /[\+\d][\d\s\-().]{6,}/;

// Answers free-form questions from a knowledge base for up to maxTurns exchanges.
// When the LLM can't answer (fallback fires), switches into a lead-capture sub-flow
// to collect the caller's name and contact details, then offers to continue Q&A.

export async function enter({ session }) {
  session.answerTurns = 0;
  session._leadCapture = null;
  return { waitForInput: true };
}

export async function handleInput({ session, node, speak }, utterance) {
  // ── Lead capture sub-flow ────────────────────────────────────────────────
  const lc = session._leadCapture;

  if (lc?.phase === "need_name") {
    const name = await extractSingleValue(utterance, "caller's full name");
    if (!name || name.trim().length < 2) {
      await speak(session, "Sorry, I didn't catch your name. Could you repeat it?");
      return { waitForInput: true };
    }
    lc.name = name.trim();
    log.info("ANSWER_QUERIES", "lead name captured", { name: lc.name });
    lc.phase = "need_contact";
    await speak(session, "And what's the best way to reach you — phone or email?");
    return { waitForInput: true };
  }

  if (lc?.phase === "need_contact") {
    const emailMatch = utterance.match(EMAIL_RE);
    const phoneMatch = utterance.match(PHONE_RE);
    lc.contact = emailMatch?.[0] || phoneMatch?.[0] || null;

    if (!lc.contact) {
      // Try LLM extraction as fallback
      const extracted = await extractSingleValue(utterance, "phone number or email address");
      lc.contact = extracted || null;
    }

    if (!lc.contact) {
      await speak(session, "Sorry, I didn't catch that. Could you give me a phone number or email address?");
      return { waitForInput: true };
    }

    log.info("ANSWER_QUERIES", "lead contact captured", { contact: lc.contact });
    session.capturedLeads.push({
      source: "inquiry_fallback",
      name: lc.name,
      contact: lc.contact,
      capturedAt: new Date().toISOString(),
    });
    session._leadCapture = null; // reset — allow further Q&A

    await speak(session, "Perfect, we'll get back to you shortly. Is there anything else I can help you with?");
    return { waitForInput: true };
  }

  // ── Normal Q&A ────────────────────────────────────────────────────────────
  const answer = await answerQuery(session, node, utterance);
  const fallbackMessage = node.config?.fallbackMessage || "I do not have that information right now.";
  const didFallback = answer === fallbackMessage;

  await speak(session, answer);

  session.answerTurns = (session.answerTurns || 0) + 1;
  const maxTurns = Number(node.config?.maxTurns || 6);

  if (didFallback) {
    log.info("ANSWER_QUERIES", "fallback fired — entering lead capture");
    session._leadCapture = { phase: "need_name", name: null, contact: null };
    await speak(session, "Could I get your name so we can follow up with you?");
    return { waitForInput: true };
  }

  if (session.answerTurns >= maxTurns) {
    session.answerTurns = 0;
    return { waitForInput: false, nextNodeId: node.nextNodeId };
  }

  return { waitForInput: true };
}
