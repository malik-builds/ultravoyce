"use client";

import { useRef, useState } from "react";
import { useWorkflowStore } from "@/store/workflow-store";

interface TokenTextareaProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}

export function TokenTextarea({
  value,
  onChange,
  rows = 4,
  placeholder,
}: TokenTextareaProps) {
  const globalVariables = useWorkflowStore((s) => s.globalVariables);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const ref = useRef<HTMLTextAreaElement>(null);

  const onInput = (text: string) => {
    onChange(text);
    const match = text.match(/\{\{\s*([a-zA-Z0-9_]*)$/);
    if (match) {
      const prefix = match[1] ?? "";
      const names = Object.keys(globalVariables).filter((n) =>
        n.startsWith(prefix),
      );
      setSuggestions(names.slice(0, 8));
    } else {
      setSuggestions([]);
    }
  };

  const insertToken = (name: string) => {
    const el = ref.current;
    if (!el) return;
    const text = value.replace(/\{\{\s*[a-zA-Z0-9_]*$/, `{{ ${name} }}`);
    onChange(text);
    setSuggestions([]);
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        className="field-input field-textarea"
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onInput(e.target.value)}
        onBlur={() => setTimeout(() => setSuggestions([]), 150)}
      />
      {suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-40 overflow-auto rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] py-1 shadow-lg">
          {suggestions.map((name) => (
            <li key={name}>
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[var(--bg-hover)]"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertToken(name);
                }}
              >
                <span className="font-mono text-[12px]">{name}</span>
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  {globalVariables[name]?.type}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
