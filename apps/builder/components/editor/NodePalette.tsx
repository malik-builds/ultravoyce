"use client";

import { useMemo, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { PALETTE_CATEGORIES } from "@/lib/workflow/node-meta";
import type { NodeType } from "@/lib/workflow/types";
import { useWorkflowStore } from "@/store/workflow-store";

export function NodePalette() {
  const [query, setQuery] = useState("");
  const addNode = useWorkflowStore((s) => s.addNode);
  const reactFlow = useReactFlow();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PALETTE_CATEGORIES;
    return PALETTE_CATEGORIES.map((cat) => ({
      ...cat,
      items: cat.items.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.type.includes(q),
      ),
    })).filter((cat) => cat.items.length > 0);
  }, [query]);

  const addAtCenter = (type: NodeType) => {
    const position = reactFlow.screenToFlowPosition({
      x: (window.innerWidth + 240) / 2,
      y: (window.innerHeight + 48) / 2,
    });
    addNode(type, position);
  };

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <div className="border-b border-[var(--border-subtle)] p-3">
        <input
          type="search"
          placeholder="Search nodes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="field-input h-9 text-[13px]"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.map((cat) => (
          <div key={cat.id}>
            <p className="px-4 pb-2 pt-4 font-mono text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">
              {cat.label}
            </p>
            {cat.items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.type}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/reactflow", item.type);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={() => addAtCenter(item.type)}
                  className="flex w-full cursor-grab items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-hover)] active:cursor-grabbing"
                >
                  <Icon
                    className="mt-0.5 h-4 w-4 shrink-0"
                    style={{ color: item.color }}
                  />
                  <span>
                    <span className="block text-[13px] font-medium text-[var(--text-primary)]">
                      {item.name}
                    </span>
                    <span className="block text-[11px] text-[var(--text-tertiary)]">
                      {item.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
