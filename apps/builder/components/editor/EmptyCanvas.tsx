"use client";

import { useWorkflowStore } from "@/store/workflow-store";

export function EmptyCanvas() {
  const loadTemplate = useWorkflowStore((s) => s.loadTemplate);
  const nodes = useWorkflowStore((s) => s.nodes);

  if (nodes.length > 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="pointer-events-auto max-w-md rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/90 p-8 text-center backdrop-blur-sm">
        <p className="text-[15px] font-medium text-[var(--text-primary)]">
          Drag a node from the left panel to get started, or start with a
          template.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            className="btn-primary"
            onClick={() => loadTemplate("calendar")}
          >
            Calendar booking agent
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => loadTemplate("receptionist")}
          >
            Receptionist agent
          </button>
        </div>
      </div>
    </div>
  );
}
