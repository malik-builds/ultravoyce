"use client";

import type { VariableType } from "@/lib/workflow/types";
import { useWorkflowStore } from "@/store/workflow-store";

interface VariablePickerProps {
  value: string;
  onChange: (value: string) => void;
  type?: VariableType;
  allowCreate?: boolean;
}

export function VariablePicker({
  value,
  onChange,
  type = "string",
  allowCreate = true,
}: VariablePickerProps) {
  const globalVariables = useWorkflowStore((s) => s.globalVariables);
  const ensureVariable = useWorkflowStore((s) => s.ensureVariable);
  const addGlobalVariable = useWorkflowStore((s) => s.addGlobalVariable);

  const names = Object.keys(globalVariables);

  return (
    <select
      className="field-input"
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "__new__") {
          const name = prompt("Variable name");
          if (name?.trim()) {
            addGlobalVariable(name.trim(), type);
            onChange(name.trim());
          }
          return;
        }
        onChange(v);
        if (v) ensureVariable(v, type);
      }}
    >
      <option value="">Select variable…</option>
      {names.map((n) => (
        <option key={n} value={n}>
          {n} ({globalVariables[n]?.type})
        </option>
      ))}
      {allowCreate && <option value="__new__">+ Create new…</option>}
    </select>
  );
}
