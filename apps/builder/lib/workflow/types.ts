export type VariableType = "string" | "number" | "boolean";

export type NodeType =
  | "tell"
  | "ask_question"
  | "get_details"
  | "calendar_booker"
  | "answer_queries"
  | "switch"
  | "action"
  | "transfer_call";

export interface Position {
  x: number;
  y: number;
}

export interface GlobalVariable {
  type: VariableType;
  value: string | number | boolean | null;
}

export interface Trigger {
  type: "inbound_websocket";
  config: { connectorId: string };
}

export interface SwitchCase {
  value: string;
  label: string;
  nextNodeId: string | null;
}

export interface DetailField {
  variable: string;
  description: string;
  type: VariableType;
  required: boolean;
}

export type NodeConfig =
  | { message: string }
  | {
      question: string;
      storeIn: string;
      variableType: VariableType;
    }
  | { prompt: string; fields: DetailField[] }
  | {
      calComEventTypeId: number;
      calComApiKey: string;
      timezone: string;
      bookingConfirmationVariable: string;
      bookingIdVariable: string;
      bookingTimeVariable: string;
      attendeeNameVariable: string;
      attendeeEmailVariable: string;
      confirmationMessage: string;
    }
  | {
      knowledgeBase: string;
      fallbackMessage: string;
      maxTurns: number;
    }
  | {
      prompt: string;
      cases: SwitchCase[];
      defaultCaseNextNodeId: string | null;
    }
  | {
      webhookUrl: string;
      method: "POST";
      payload: Record<string, string>;
      onSuccess: "continue";
      onFailure: "continue" | "stop";
    }
  | {
      message: string;
      transferTo: string;
      transferType: "cold" | "warm";
    };

export interface WorkflowNode {
  id: string;
  type: NodeType;
  label: string;
  position: Position;
  nextNodeId: string | null;
  config: NodeConfig;
}

export interface WorkflowDocument {
  id: string;
  name: string;
  version: number;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  trigger: Trigger;
  globalVariables: Record<string, GlobalVariable>;
  entryNodeId: string | null;
  nodes: WorkflowNode[];
}

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  nodeId?: string;
  edgeId?: string;
  message: string;
  severity: ValidationSeverity;
}
