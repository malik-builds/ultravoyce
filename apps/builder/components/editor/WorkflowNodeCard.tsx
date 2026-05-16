"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { AlertTriangle } from "lucide-react";
import { getPaletteItem, NODE_COLORS } from "@/lib/workflow/node-meta";
import { getNodeSubtitle } from "@/lib/workflow/subtitles";
import type { WorkflowNodeData } from "@/lib/workflow/flow";

export function WorkflowNodeCard({ data, selected }: NodeProps) {
  const { workflowNode, isEntry, issues } = data as WorkflowNodeData;
  const meta = getPaletteItem(workflowNode.type);
  const color = meta?.color ?? NODE_COLORS[workflowNode.type];
  const Icon = meta?.icon;
  const subtitle = getNodeSubtitle(workflowNode);
  const hasError = issues.some((i) => i.severity === "error");
  const hasWarning = issues.some((i) => i.severity === "warning");

  const ringClass = hasError
    ? "ring-2 ring-[var(--error)]"
    : hasWarning
      ? "ring-2 ring-[var(--warning)]"
      : selected
        ? "ring-2 ring-[var(--accent)] shadow-[0_4px_16px_#00000066]"
        : "";

  const switchConfig =
    workflowNode.type === "switch"
      ? (workflowNode.config as {
          cases: { value: string; label: string; nextNodeId: string | null }[];
        })
      : null;

  return (
    <div className="relative">
      {isEntry && (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 font-mono text-[10px] text-[var(--text-tertiary)]">
          start
        </div>
      )}

      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className="!h-[11px] !w-[11px] !border-2 !border-[var(--border-strong)] !bg-[var(--bg-base)] hover:!border-[var(--accent)]"
      />

      <div
        className={`flex w-[240px] overflow-hidden rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[0_2px_8px_#00000044] ${ringClass}`}
      >
        <div className="w-1 shrink-0" style={{ backgroundColor: color }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 px-3 py-3.5">
            {Icon && (
              <Icon className="h-4 w-4 shrink-0" style={{ color }} />
            )}
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text-primary)]">
              {workflowNode.label || "Untitled"}
            </span>
            <span className="shrink-0 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-hover)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-tertiary)]">
              {workflowNode.type}
            </span>
            {(hasError || hasWarning) && (
              <AlertTriangle
                className={`h-3.5 w-3.5 shrink-0 ${hasError ? "text-[var(--error)]" : "text-[var(--warning)]"}`}
              />
            )}
          </div>
          {subtitle && (
            <p className="truncate px-3 pb-3 text-[11px] text-[var(--text-secondary)]">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {switchConfig ? (
        <div className="relative mt-1 flex justify-around px-2">
          {switchConfig.cases.map((c) => (
            <div key={c.value} className="flex flex-col items-center">
              <Handle
                type="source"
                position={Position.Bottom}
                id={c.value}
                className="!static !transform-none !h-[11px] !w-[11px] !border-2 !border-[var(--border-strong)] !bg-[var(--bg-base)] hover:!border-[var(--accent)]"
              />
              <span className="mt-1 max-w-[56px] truncate text-center text-[10px] text-[var(--text-tertiary)]">
                {c.value}
              </span>
            </div>
          ))}
          <div className="flex flex-col items-center">
            <Handle
              type="source"
              position={Position.Bottom}
              id="default"
              className="!static !transform-none !h-[11px] !w-[11px] !border-2 !border-[var(--border-strong)] !bg-[var(--bg-base)]"
            />
            <span className="mt-1 text-[10px] text-[var(--text-tertiary)]">
              default
            </span>
          </div>
        </div>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          id="output"
          className="!h-[11px] !w-[11px] !border-2 !border-[var(--border-strong)] !bg-[var(--bg-base)] hover:!border-[var(--accent)]"
        />
      )}
    </div>
  );
}
