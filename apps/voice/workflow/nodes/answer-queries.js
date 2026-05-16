import { answerQuery } from "../../services/llm.js";

// Answers free-form questions from a knowledge base for up to maxTurns exchanges.
export async function enter({ session }) {
  session.answerTurns = 0;
  return { waitForInput: true };
}

export async function handleInput({ session, node, speak }, utterance) {
  const answer = await answerQuery(session, node, utterance);
  await speak(session, answer);

  session.answerTurns = (session.answerTurns || 0) + 1;
  const maxTurns = Number(node.config?.maxTurns || 6);

  if (session.answerTurns >= maxTurns) {
    session.answerTurns = 0;
    return { waitForInput: false, nextNodeId: node.nextNodeId };
  }

  return { waitForInput: true };
}
