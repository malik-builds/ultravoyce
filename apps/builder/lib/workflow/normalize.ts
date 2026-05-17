import type { PayloadField, WorkflowDocument } from "./types";

export function normalizeActionPayload(payload: unknown): PayloadField[] {
  if (Array.isArray(payload)) {
    return payload.map((entry) => {
      if (entry && typeof entry === "object" && "key" in entry && "value" in entry) {
        const row = entry as PayloadField;
        return {
          key: String(row.key ?? ""),
          value: String(row.value ?? ""),
        };
      }
      return { key: "", value: "" };
    });
  }
  if (payload && typeof payload === "object") {
    return Object.entries(payload as Record<string, string>).map(
      ([key, value]) => ({
        key,
        value: String(value ?? ""),
      }),
    );
  }
  return [];
}

export function normalizeWorkflowDocument(
  doc: WorkflowDocument,
): WorkflowDocument {
  return {
    ...doc,
    nodes: doc.nodes.map((node) => {
      if (node.type !== "action") return node;
      const config = node.config as { payload?: unknown };
      return {
        ...node,
        config: {
          ...config,
          payload: normalizeActionPayload(config.payload),
        },
      };
    }),
  };
}
