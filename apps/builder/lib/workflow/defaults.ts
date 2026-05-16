import { v4 as uuidv4 } from "uuid";
import type { NodeConfig, NodeType, Position, WorkflowNode } from "./types";

export function createNodeId(type: NodeType): string {
  return `node_${type}_${uuidv4().slice(0, 8)}`;
}

export function defaultConfig(type: NodeType): NodeConfig {
  switch (type) {
    case "tell":
      return { message: "" };
    case "ask_question":
      return { question: "", storeIn: "", variableType: "string" };
    case "get_details":
      return { prompt: "", fields: [] };
    case "calendar_booker":
      return {
        calComEventTypeId: 0,
        calComApiKey: "{{ secrets.CAL_COM_API_KEY }}",
        timezone: "UTC",
        bookingConfirmationVariable: "",
        bookingIdVariable: "",
        bookingTimeVariable: "",
        attendeeNameVariable: "",
        attendeeEmailVariable: "",
        confirmationMessage: "",
      };
    case "answer_queries":
      return { knowledgeBase: "", fallbackMessage: "", maxTurns: 5 };
    case "switch":
      return {
        prompt: "",
        cases: [
          { value: "case_1", label: "Case 1", nextNodeId: null },
          { value: "case_2", label: "Case 2", nextNodeId: null },
        ],
        defaultCaseNextNodeId: null,
      };
    case "action":
      return {
        webhookUrl: "",
        method: "POST",
        payload: {},
        onSuccess: "continue",
        onFailure: "continue",
      };
    case "transfer_call":
      return {
        message: "",
        transferTo: "",
        transferType: "cold",
      };
  }
}

export function defaultLabel(type: NodeType): string {
  const labels: Record<NodeType, string> = {
    tell: "Tell",
    ask_question: "Ask question",
    get_details: "Get details",
    calendar_booker: "Calendar booker",
    answer_queries: "Answer queries",
    switch: "Switch",
    action: "Action",
    transfer_call: "Transfer call",
  };
  return labels[type];
}

export function createNode(
  type: NodeType,
  position: Position,
  partial?: Partial<WorkflowNode>,
): WorkflowNode {
  return {
    id: partial?.id ?? createNodeId(type),
    type,
    label: partial?.label ?? defaultLabel(type),
    position,
    nextNodeId: type === "switch" ? null : null,
    config: partial?.config ?? defaultConfig(type),
  };
}

export function createBlankWorkflow(id: string): import("./types").WorkflowDocument {
  return {
    id,
    name: "Untitled workflow",
    version: 1,
    description: "",
    trigger: { type: "inbound_websocket", config: { connectorId: "" } },
    globalVariables: {},
    entryNodeId: null,
    nodes: [],
  };
}
