import * as tell from "./tell.js";
import * as askQuestion from "./ask-question.js";
import * as getDetails from "./get-details.js";
import * as answerQueries from "./answer-queries.js";
import * as switchNode from "./switch.js";
import * as action from "./action.js";
import * as calendarBooker from "./calendar-booker.js";
import * as transferCall from "./transfer-call.js";

const registry = {
  tell,
  ask_question: askQuestion,
  get_details: getDetails,
  answer_queries: answerQueries,
  switch: switchNode,
  action,
  calendar_booker: calendarBooker,
  transfer_call: transferCall,
};

export function getHandler(nodeType) {
  return registry[nodeType] || null;
}

export const INPUT_AWAITING_TYPES = new Set([
  "ask_question",
  "get_details",
  "answer_queries",
  "switch",
]);
