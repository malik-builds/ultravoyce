"use client";

import { X } from "lucide-react";
import type { VariableType } from "@/lib/workflow/types";
import { useWorkflowStore } from "@/store/workflow-store";

interface GlobalVariablesDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function GlobalVariablesDrawer({
  open,
  onClose,
}: GlobalVariablesDrawerProps) {
  const globalVariables = useWorkflowStore((s) => s.globalVariables);
  const addGlobalVariable = useWorkflowStore((s) => s.addGlobalVariable);
  const updateGlobalVariable = useWorkflowStore((s) => s.updateGlobalVariable);
  const deleteGlobalVariable = useWorkflowStore((s) => s.deleteGlobalVariable);
  const pushHistory = useWorkflowStore((s) => s.pushHistory);

  if (!open) return null;

  const entries = Object.entries(globalVariables);

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/40"
        aria-label="Close variables"
        onClick={onClose}
      />
      <aside className="fixed right-0 top-12 z-50 flex h-[calc(100%-3rem)] w-[360px] flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl">
        <header className="flex items-center justify-between border-b border-[var(--border-subtle)] p-4">
          <h2 className="font-mono text-sm font-medium">Global variables</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          {entries.length === 0 && (
            <p className="text-[12px] text-[var(--text-tertiary)]">
              No variables yet. Add one below or create from a node config.
            </p>
          )}
          {entries.map(([name, variable]) => (
            <div
              key={name}
              className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] p-3"
            >
              <input
                className="min-w-[100px] flex-1 bg-transparent font-mono text-[12px] outline-none"
                defaultValue={name}
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (next && next !== name) {
                    updateGlobalVariable(name, next, {});
                    pushHistory();
                  }
                }}
              />
              <select
                className="rounded border border-[var(--border-default)] bg-[var(--bg-hover)] px-2 py-1 font-mono text-[10px]"
                value={variable.type}
                onChange={(e) => {
                  updateGlobalVariable(name, name, {
                    type: e.target.value as VariableType,
                  });
                  pushHistory();
                }}
              >
                <option value="string">string</option>
                <option value="number">number</option>
                <option value="boolean">boolean</option>
              </select>
              <input
                className="w-20 rounded border border-[var(--border-default)] bg-transparent px-2 py-1 text-right text-[12px]"
                placeholder="null"
                defaultValue={
                  variable.value === null ? "" : String(variable.value)
                }
                onBlur={(e) => {
                  let value: string | number | boolean | null =
                    e.target.value || null;
                  if (variable.type === "number" && value !== null) {
                    value = Number(value);
                  }
                  if (variable.type === "boolean" && value !== null) {
                    value = value === "true";
                  }
                  updateGlobalVariable(name, name, { value });
                  pushHistory();
                }}
              />
              <button
                type="button"
                className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--error)]"
                onClick={() => {
                  deleteGlobalVariable(name);
                  pushHistory();
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
        <div className="border-t border-[var(--border-subtle)] p-4">
          <button
            type="button"
            className="w-full rounded-md border border-dashed border-[var(--border-default)] py-2 text-[12px] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]"
            onClick={() => {
              const name = prompt("Variable name");
              if (name?.trim()) {
                addGlobalVariable(name.trim(), "string");
                pushHistory();
              }
            }}
          >
            Add variable
          </button>
        </div>
      </aside>
    </>
  );
}
