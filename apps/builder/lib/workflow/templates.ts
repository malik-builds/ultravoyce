import calendarBooking from "./templates/calendar-booking.json";
import type { WorkflowDocument } from "./types";

export function getCalendarBookingTemplate(): WorkflowDocument {
  const doc = (calendarBooking as { workflow: WorkflowDocument }).workflow;
  return structuredClone(doc);
}

export function getReceptionistTemplate(): WorkflowDocument {
  return {
    id: "wf_receptionist_01",
    name: "Receptionist Agent",
    version: 1,
    description: "Routes callers by intent to booking, Q&A, or transfer.",
    trigger: { type: "inbound_websocket", config: { connectorId: "conn_abc123" } },
    globalVariables: {
      customerName: { type: "string", value: null },
    },
    entryNodeId: "node_tell_01",
    nodes: [
      {
        id: "node_tell_01",
        type: "tell",
        label: "Greet caller",
        position: { x: 300, y: 60 },
        nextNodeId: "node_ask_01",
        config: {
          message: "Hello! Thank you for calling. How can I help you today?",
        },
      },
      {
        id: "node_ask_01",
        type: "ask_question",
        label: "Get caller name",
        position: { x: 300, y: 180 },
        nextNodeId: "node_switch_01",
        config: {
          question: "Could I get your name please?",
          storeIn: "customerName",
          variableType: "string",
        },
      },
      {
        id: "node_switch_01",
        type: "switch",
        label: "Route by intent",
        position: { x: 300, y: 300 },
        nextNodeId: null,
        config: {
          prompt:
            "Based on what {{ customerName }} just said, classify their intent.",
          cases: [
            {
              value: "query",
              label: "General question",
              nextNodeId: "node_query_01",
            },
            {
              value: "booking",
              label: "Wants to book",
              nextNodeId: "node_getdetails_01",
            },
            {
              value: "transfer",
              label: "Wants a human",
              nextNodeId: "node_transfer_01",
            },
          ],
          defaultCaseNextNodeId: "node_query_01",
        },
      },
      {
        id: "node_query_01",
        type: "answer_queries",
        label: "Answer questions",
        position: { x: 60, y: 460 },
        nextNodeId: null,
        config: {
          knowledgeBase: "We provide plumbing, electrical, and HVAC services.",
          fallbackMessage: "I'm sorry, I don't have that information.",
          maxTurns: 5,
        },
      },
      {
        id: "node_getdetails_01",
        type: "get_details",
        label: "Collect contact info",
        position: { x: 300, y: 460 },
        nextNodeId: null,
        config: {
          prompt: "Collect contact details for a booking.",
          fields: [
            {
              variable: "customerName",
              description: "Full name",
              type: "string",
              required: true,
            },
          ],
        },
      },
      {
        id: "node_transfer_01",
        type: "transfer_call",
        label: "Transfer to agent",
        position: { x: 560, y: 460 },
        nextNodeId: null,
        config: {
          message: "Please hold while I connect you.",
          transferTo: "+10000000000",
          transferType: "cold",
        },
      },
    ],
  };
}
