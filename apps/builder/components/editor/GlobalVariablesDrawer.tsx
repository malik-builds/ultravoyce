"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { GlobalVariable, VariableType } from "@/lib/workflow/types";
import { useWorkflowStore } from "@/store/workflow-store";

interface GlobalVariablesDrawerProps {
  open: boolean;
  onClose: () => void;
}

function formatValue(variable: GlobalVariable): string {
  if (variable.value === null) return "";
  return String(variable.value);
}

function parseValue(
  raw: string,
  type: VariableType,
): string | number | boolean | null {
  if (!raw.trim()) return null;
  if (type === "number") return Number(raw);
  if (type === "boolean") return raw === "true";
  return raw;
}

export function GlobalVariablesDrawer({
  open,
  onClose,
}: GlobalVariablesDrawerProps) {
  const globalVariables = useWorkflowStore((s) => s.globalVariables);
  const addGlobalVariable = useWorkflowStore((s) => s.addGlobalVariable);
  const updateGlobalVariable = useWorkflowStore((s) => s.updateGlobalVariable);
  const deleteGlobalVariable = useWorkflowStore((s) => s.deleteGlobalVariable);

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<VariableType>("string");
  const [newValue, setNewValue] = useState("");

  if (!open) return null;

  const entries = Object.entries(globalVariables);

  const handleAdd = () => {
    const name = newName.trim();
    if (!name || globalVariables[name]) return;
    addGlobalVariable(name, newType, parseValue(newValue, newType));
    setNewName("");
    setNewValue("");
  };

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/40"
        aria-label="Close variables"
        onClick={onClose}
      />
      <aside className="fixed right-0 top-12 z-50 flex h-[calc(100%-3rem)] w-[360px] flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl">
        <header className="flex items-start justify-between gap-2 border-b border-[var(--border-subtle)] p-4">
          <div>
            <h2 className="font-mono text-sm font-medium">Global variables</h2>
            <p className="mt-1 text-[11px] leading-snug text-[var(--text-tertiary)]">
              Define workflow-wide variables here. Set defaults now; nodes can
              update them during a call.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          {entries.length === 0 && (
            <p className="mb-4 text-[12px] text-[var(--text-tertiary)]">
              No variables yet. Add one below to use in messages, webhooks, and
              node configs.
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
                aria-label="Variable name"
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (next && next !== name) {
                    updateGlobalVariable(name, next, {});
                  }
                }}
              />
              <select
                className="rounded border border-[var(--border-default)] bg-[var(--bg-hover)] px-2 py-1 font-mono text-[10px]"
                value={variable.type}
                onChange={(e) => {
                  const type = e.target.value as VariableType;
                  updateGlobalVariable(name, name, { type, value: null });
                }}
              >
                <option value="string">string</option>
                <option value="number">number</option>
                <option value="boolean">boolean</option>
              </select>
              {variable.type === "boolean" ? (
                <select
                  className="w-24 rounded border border-[var(--border-default)] bg-transparent px-2 py-1 text-[12px]"
                  value={
                    variable.value === null
                      ? ""
                      : variable.value
                        ? "true"
                        : "false"
                  }
                  onChange={(e) => {
                    const value =
                      e.target.value === ""
                        ? null
                        : e.target.value === "true";
                    updateGlobalVariable(name, name, { value });
                  }}
                >
                  <option value="">null</option>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  className="min-w-[80px] flex-1 rounded border border-[var(--border-default)] bg-transparent px-2 py-1 text-[12px]"
                  placeholder="null"
                  defaultValue={formatValue(variable)}
                  aria-label="Initial value"
                  onBlur={(e) => {
                    updateGlobalVariable(name, name, {
                      value: parseValue(e.target.value, variable.type),
                    });
                  }}
                />
              )}
              <button
                type="button"
                className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--error)]"
                onClick={() => deleteGlobalVariable(name)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
        <div className="border-t border-[var(--border-subtle)] p-4">
          <p className="mb-2 text-[11px] font-medium text-[var(--text-secondary)]">
            Add variable
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              className="min-w-[120px] flex-1 rounded border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2 py-1.5 font-mono text-[12px] outline-none focus:border-[var(--accent)]"
              placeholder="name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
            />
            <select
              className="rounded border border-[var(--border-default)] bg-[var(--bg-hover)] px-2 py-1.5 font-mono text-[10px]"
              value={newType}
              onChange={(e) => {
                setNewType(e.target.value as VariableType);
                setNewValue("");
              }}
            >
              <option value="string">string</option>
              <option value="number">number</option>
              <option value="boolean">boolean</option>
            </select>
            {newType === "boolean" ? (
              <select
                className="w-24 rounded border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2 py-1.5 text-[12px]"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
              >
                <option value="">null</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : (
              <input
                className="min-w-[80px] flex-1 rounded border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2 py-1.5 text-[12px] outline-none"
                placeholder={newType === "number" ? "0" : "initial (optional)"}
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                }}
              />
            )}
          </div>
          <button
            type="button"
            className="mt-3 w-full rounded-md border border-dashed border-[var(--border-default)] py-2 text-[12px] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
            onClick={handleAdd}
            disabled={!newName.trim() || Boolean(globalVariables[newName.trim()])}
          >
            Add variable
          </button>
        </div>
      </aside>
    </>
  );
}
