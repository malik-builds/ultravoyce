import type { NodeConfig, NodeType, WorkflowNode } from "./types";

export function getNodeSubtitle(node: WorkflowNode): string {
  const { type, config } = node;

  switch (type) {
    case "tell": {
      const c = config as { message: string };
      return c.message.slice(0, 40) || "No message";
    }
    case "ask_question": {
      const c = config as { question: string };
      return c.question.slice(0, 40) || "No question";
    }
    case "get_details": {
      const c = config as { fields: unknown[] };
      return `Collecting ${c.fields.length} field${c.fields.length === 1 ? "" : "s"}`;
    }
    case "calendar_booker": {
      const c = config as { calComEventTypeId: number };
      return c.calComEventTypeId
        ? `cal.com event #${c.calComEventTypeId}`
        : "No event type";
    }
    case "answer_queries": {
      const c = config as { maxTurns: number };
      return `Up to ${c.maxTurns} turns`;
    }
    case "switch": {
      const c = config as { cases: unknown[] };
      return `${c.cases.length} case${c.cases.length === 1 ? "" : "s"}`;
    }
    case "action": {
      const c = config as { webhookUrl: string };
      if (!c.webhookUrl) return "No webhook URL";
      try {
        return new URL(c.webhookUrl).hostname;
      } catch {
        return c.webhookUrl.slice(0, 40);
      }
    }
    case "transfer_call": {
      const c = config as { transferTo: string };
      return c.transferTo || "No number";
    }
    default:
      return "";
  }
}

export function isConfigValid(node: WorkflowNode): boolean {
  const { type, label, config } = node;
  if (!label.trim()) return false;

  switch (type as NodeType) {
    case "tell":
      return Boolean((config as { message: string }).message.trim());
    case "ask_question": {
      const c = config as { question: string; storeIn: string };
      return Boolean(c.question.trim() && c.storeIn.trim());
    }
    case "get_details": {
      const c = config as { prompt: string; fields: { variable: string }[] };
      return Boolean(
        c.prompt.trim() &&
          c.fields.length > 0 &&
          c.fields.every((f) => f.variable.trim()),
      );
    }
    case "calendar_booker": {
      const c = config as { calComEventTypeId: number; timezone: string };
      return Boolean(c.calComEventTypeId > 0 && c.timezone);
    }
    case "answer_queries": {
      const c = config as { knowledgeBase: string };
      return Boolean(c.knowledgeBase.trim());
    }
    case "switch": {
      const c = config as {
        prompt: string;
        cases: { value: string; label: string }[];
      };
      return Boolean(
        c.prompt.trim() &&
          c.cases.length > 0 &&
          c.cases.every((x) => x.value.trim() && x.label.trim()),
      );
    }
    case "action": {
      const c = config as { webhookUrl: string };
      return Boolean(c.webhookUrl.trim());
    }
    case "transfer_call": {
      const c = config as { transferTo: string };
      return Boolean(c.transferTo.trim());
    }
    default:
      return true;
  }
}
