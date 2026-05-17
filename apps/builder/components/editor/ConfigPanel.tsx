"use client";

import { X } from "lucide-react";
import { useMemo } from "react";
import { getPaletteItem } from "@/lib/workflow/node-meta";
import type {
  DetailField,
  NodeConfig,
  PayloadField,
  SwitchCase,
  VariableType,
  WorkflowNode,
} from "@/lib/workflow/types";
import { useWorkflowStore } from "@/store/workflow-store";
import { TokenTextarea } from "./forms/TokenTextarea";
import { VariablePicker } from "./forms/VariablePicker";

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Asia/Colombo",
  "Asia/Tokyo",
  "Australia/Sydney",
];

export function ConfigPanel() {
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const nodes = useWorkflowStore((s) => s.nodes);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const updateNode = useWorkflowStore((s) => s.updateNode);
  const updateNodeConfig = useWorkflowStore((s) => s.updateNodeConfig);
  const pushHistory = useWorkflowStore((s) => s.pushHistory);

  const node = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId),
    [nodes, selectedNodeId],
  );

  if (!node) return null;

  const meta = getPaletteItem(node.type);

  const patchConfig = (config: NodeConfig) => updateNodeConfig(node.id, config);
  const commit = () => pushHistory();

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <header className="flex items-start justify-between border-b border-[var(--border-subtle)] p-4">
        <div>
          <input
            className="w-full bg-transparent font-mono text-sm font-medium text-[var(--text-primary)] outline-none"
            value={node.label}
            onChange={(e) => updateNode(node.id, { label: e.target.value })}
            onBlur={commit}
          />
          <span
            className="mt-1 inline-block rounded-full border border-[var(--border-subtle)] bg-[var(--bg-hover)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-tertiary)]"
            style={{ color: meta?.color }}
          >
            {node.type}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setSelectedNode(null)}
          className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <NodeConfigFields node={node} patchConfig={patchConfig} onCommit={commit} />
      </div>
    </aside>
  );
}

function NodeConfigFields({
  node,
  patchConfig,
  onCommit,
}: {
  node: WorkflowNode;
  patchConfig: (c: NodeConfig) => void;
  onCommit: () => void;
}) {
  switch (node.type) {
    case "tell": {
      const c = node.config as { message: string };
      return (
        <Field label="Message">
          <TokenTextarea
            value={c.message}
            onChange={(message) => patchConfig({ message })}
          />
        </Field>
      );
    }
    case "ask_question": {
      const c = node.config as {
        question: string;
        storeIn: string;
        variableType: VariableType;
      };
      return (
        <>
          <Field label="Question">
            <TokenTextarea
              value={c.question}
              onChange={(question) => patchConfig({ ...c, question })}
            />
          </Field>
          <Field label="Store in">
            <VariablePicker
              value={c.storeIn}
              onChange={(storeIn) => patchConfig({ ...c, storeIn })}
              type={c.variableType}
            />
          </Field>
          <Field label="Variable type">
            <select
              className="field-input"
              value={c.variableType}
              onChange={(e) =>
                patchConfig({
                  ...c,
                  variableType: e.target.value as VariableType,
                })
              }
            >
              <option value="string">string</option>
              <option value="number">number</option>
              <option value="boolean">boolean</option>
            </select>
          </Field>
        </>
      );
    }
    case "get_details": {
      const c = node.config as { prompt: string; fields: DetailField[] };
      return (
        <>
          <Field label="Prompt">
            <TokenTextarea
              value={c.prompt}
              onChange={(prompt) => patchConfig({ ...c, prompt })}
            />
          </Field>
          <Field label="Fields">
            <RepeatableFields
              fields={c.fields}
              onChange={(fields) => patchConfig({ ...c, fields })}
              onCommit={onCommit}
            />
          </Field>
        </>
      );
    }
    case "calendar_booker": {
      const c = node.config as {
        calComEventTypeId: number;
        calComApiKey: string;
        timezone: string;
        bookingConfirmationVariable: string;
        bookingIdVariable?: string;
        bookingTimeVariable?: string;
        attendeeNameVariable: string;
        attendeeEmailVariable: string;
        confirmationMessage: string;
      };
      return (
        <>
          <Field label="Event type ID">
            <input
              type="number"
              className="field-input"
              value={c.calComEventTypeId || ""}
              onChange={(e) =>
                patchConfig({
                  ...c,
                  calComEventTypeId: Number(e.target.value) || 0,
                })
              }
            />
          </Field>
          <Field label="API key">
            <input
              className="field-input font-mono text-[12px]"
              value={c.calComApiKey}
              onChange={(e) =>
                patchConfig({ ...c, calComApiKey: e.target.value })
              }
            />
          </Field>
          <Field label="Timezone">
            <select
              className="field-input"
              value={c.timezone}
              onChange={(e) => patchConfig({ ...c, timezone: e.target.value })}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Attendee name variable">
            <VariablePicker
              value={c.attendeeNameVariable}
              onChange={(v) => patchConfig({ ...c, attendeeNameVariable: v })}
            />
          </Field>
          <Field label="Attendee email variable">
            <VariablePicker
              value={c.attendeeEmailVariable}
              onChange={(v) => patchConfig({ ...c, attendeeEmailVariable: v })}
            />
          </Field>
          <Field label="Booking confirmation variable">
            <VariablePicker
              value={c.bookingConfirmationVariable}
              onChange={(v) =>
                patchConfig({ ...c, bookingConfirmationVariable: v })
              }
              type="boolean"
            />
          </Field>
          <Field label="Booking ID variable" hint="Optional — cal.com booking id or uid">
            <VariablePicker
              value={c.bookingIdVariable ?? ""}
              onChange={(v) =>
                patchConfig({
                  ...c,
                  bookingIdVariable: v || undefined,
                })
              }
              optional
            />
          </Field>
          <Field label="Booking time variable" hint="Optional — confirmed start time">
            <VariablePicker
              value={c.bookingTimeVariable ?? ""}
              onChange={(v) =>
                patchConfig({
                  ...c,
                  bookingTimeVariable: v || undefined,
                })
              }
              optional
            />
          </Field>
          <Field label="Confirmation message">
            <TokenTextarea
              value={c.confirmationMessage}
              onChange={(confirmationMessage) =>
                patchConfig({ ...c, confirmationMessage })
              }
            />
          </Field>
        </>
      );
    }
    case "answer_queries": {
      const c = node.config as {
        knowledgeBase: string;
        fallbackMessage: string;
        maxTurns: number;
      };
      return (
        <>
          <Field label="Knowledge base">
            <TokenTextarea
              value={c.knowledgeBase}
              onChange={(knowledgeBase) => patchConfig({ ...c, knowledgeBase })}
              rows={8}
            />
          </Field>
          <Field label="Fallback message">
            <TokenTextarea
              value={c.fallbackMessage}
              onChange={(fallbackMessage) =>
                patchConfig({ ...c, fallbackMessage })
              }
            />
          </Field>
          <Field label="Max turns">
            <input
              type="number"
              min={1}
              className="field-input"
              value={c.maxTurns}
              onChange={(e) =>
                patchConfig({ ...c, maxTurns: Number(e.target.value) || 5 })
              }
            />
          </Field>
        </>
      );
    }
    case "switch": {
      const c = node.config as {
        prompt: string;
        cases: SwitchCase[];
        defaultCaseNextNodeId: string | null;
      };
      const nodeOptions = useWorkflowStore.getState().nodes.filter(
        (n) => n.id !== node.id,
      );
      return (
        <>
          <Field label="Prompt">
            <TokenTextarea
              value={c.prompt}
              onChange={(prompt) => patchConfig({ ...c, prompt })}
            />
          </Field>
          <Field label="Cases">
            <div className="space-y-3">
              {c.cases.map((item, idx) => (
                <div
                  key={`${item.value}-${idx}`}
                  className="rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] p-3"
                >
                  <p className="mb-3 text-[12px] font-medium text-[var(--text-primary)]">
                    Branch {idx + 1}
                  </p>
                  <label className="mb-3 block">
                    <SwitchFieldHeading
                      title="Value"
                      hint="the result the AI needs to give"
                    />
                    <input
                      className="field-input"
                      placeholder="e.g. booking"
                      value={item.value}
                      onChange={(e) => {
                        const cases = [...c.cases];
                        cases[idx] = { ...item, value: e.target.value };
                        patchConfig({ ...c, cases });
                      }}
                    />
                  </label>
                  <label className="mb-2 block">
                    <SwitchFieldHeading
                      title="Label"
                      hint="the name of the switch branch"
                    />
                    <input
                      className="field-input"
                      placeholder="e.g. Wants to book an appointment"
                      value={item.label}
                      onChange={(e) => {
                        const cases = [...c.cases];
                        cases[idx] = { ...item, label: e.target.value };
                        patchConfig({ ...c, cases });
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="text-[11px] text-[var(--error)] hover:underline"
                    onClick={() => {
                      patchConfig({
                        ...c,
                        cases: c.cases.filter((_, i) => i !== idx),
                      });
                      onCommit();
                    }}
                  >
                    Remove branch
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="w-full rounded-md border border-dashed border-[var(--border-default)] py-2 text-[12px] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]"
                onClick={() => {
                  patchConfig({
                    ...c,
                    cases: [
                      ...c.cases,
                      {
                        value: `case_${c.cases.length + 1}`,
                        label: "New case",
                        nextNodeId: null,
                      },
                    ],
                  });
                  onCommit();
                }}
              >
                Add case
              </button>
            </div>
          </Field>
          <Field label="Default case">
            <select
              className="field-input"
              value={c.defaultCaseNextNodeId ?? ""}
              onChange={(e) =>
                patchConfig({
                  ...c,
                  defaultCaseNextNodeId: e.target.value || null,
                })
              }
            >
              <option value="">None (connect on canvas)</option>
              {nodeOptions.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </select>
          </Field>
        </>
      );
    }
    case "action": {
      const c = node.config as Extract<
        NodeConfig,
        { webhookUrl: string }
      >;
      return (
        <>
          <Field label="Webhook URL">
            <input
              className="field-input"
              value={c.webhookUrl}
              onChange={(e) =>
                patchConfig({ ...c, webhookUrl: e.target.value })
              }
            />
          </Field>
          <Field label="Payload">
            <ActionPayloadFields
              payload={c.payload}
              onChange={(payload) => patchConfig({ ...c, payload })}
            />
          </Field>
          <Field label="On failure">
            <select
              className="field-input"
              value={c.onFailure}
              onChange={(e) =>
                patchConfig({
                  ...c,
                  onFailure: e.target.value as "continue" | "stop",
                })
              }
            >
              <option value="continue">continue</option>
              <option value="stop">stop</option>
            </select>
          </Field>
        </>
      );
    }
    case "transfer_call": {
      const c = node.config as {
        message: string;
        transferTo: string;
        transferType: "cold" | "warm";
      };
      return (
        <>
          <Field label="Message">
            <TokenTextarea
              value={c.message}
              onChange={(message) => patchConfig({ ...c, message })}
            />
          </Field>
          <Field label="Transfer to">
            <input
              className="field-input"
              placeholder="+1234567890"
              value={c.transferTo}
              onChange={(e) =>
                patchConfig({ ...c, transferTo: e.target.value })
              }
            />
          </Field>
          <Field label="Transfer type">
            <select
              className="field-input"
              value={c.transferType}
              onChange={(e) =>
                patchConfig({
                  ...c,
                  transferType: e.target.value as "cold" | "warm",
                })
              }
            >
              <option value="cold">cold</option>
              <option value="warm" disabled>
                warm (coming soon)
              </option>
            </select>
          </Field>
        </>
      );
    }
    default:
      return null;
  }
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {hint && (
        <span className="mb-1 block text-[10px] text-[var(--text-tertiary)]">
          {hint}
        </span>
      )}
      {children}
    </label>
  );
}

function SwitchFieldHeading({
  title,
  hint,
}: {
  title: string;
  hint: string;
}) {
  return (
    <span className="mb-2 flex flex-wrap items-baseline gap-x-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-secondary)]">
        {title}
      </span>
      <span className="text-[11px] font-normal normal-case tracking-normal text-[var(--text-tertiary)]">
        — {hint}
      </span>
    </span>
  );
}

function ActionPayloadFields({
  payload,
  onChange,
}: {
  payload: PayloadField[];
  onChange: (payload: PayloadField[]) => void;
}) {
  return (
    <div className="space-y-2">
      {payload.map((row, idx) => (
        <div key={idx} className="space-y-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] p-2">
          <input
            className="field-input"
            placeholder="Key"
            value={row.key}
            onChange={(e) => {
              const next = [...payload];
              next[idx] = { ...row, key: e.target.value };
              onChange(next);
            }}
          />
          <TokenTextarea
            value={row.value}
            onChange={(value) => {
              const next = [...payload];
              next[idx] = { ...row, value };
              onChange(next);
            }}
            rows={2}
            placeholder="{{ variable }}"
          />
          <button
            type="button"
            className="text-[11px] text-[var(--error)]"
            onClick={() => onChange(payload.filter((_, i) => i !== idx))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="w-full rounded-md border border-dashed border-[var(--border-default)] py-2 text-[12px] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]"
        onClick={() => onChange([...payload, { key: "", value: "" }])}
      >
        Add row
      </button>
    </div>
  );
}

function RepeatableFields({
  fields,
  onChange,
  onCommit,
}: {
  fields: DetailField[];
  onChange: (fields: DetailField[]) => void;
  onCommit: () => void;
}) {
  return (
    <div className="space-y-2">
      {fields.map((field, idx) => (
        <div
          key={idx}
          className="space-y-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] p-2"
        >
          <VariablePicker
            value={field.variable}
            onChange={(variable) => {
              const next = [...fields];
              next[idx] = { ...field, variable };
              onChange(next);
            }}
          />
          <input
            className="field-input"
            placeholder="Description"
            value={field.description}
            onChange={(e) => {
              const next = [...fields];
              next[idx] = { ...field, description: e.target.value };
              onChange(next);
            }}
          />
          <select
            className="field-input"
            value={field.type}
            onChange={(e) => {
              const next = [...fields];
              next[idx] = {
                ...field,
                type: e.target.value as VariableType,
              };
              onChange(next);
            }}
          >
            <option value="string">string</option>
            <option value="number">number</option>
            <option value="boolean">boolean</option>
          </select>
          <label className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(e) => {
                const next = [...fields];
                next[idx] = { ...field, required: e.target.checked };
                onChange(next);
              }}
            />
            Required
          </label>
          <button
            type="button"
            className="text-[11px] text-[var(--error)]"
            onClick={() => {
              onChange(fields.filter((_, i) => i !== idx));
              onCommit();
            }}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="w-full rounded-md border border-dashed border-[var(--border-default)] py-2 text-[12px] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]"
        onClick={() =>
          onChange([
            ...fields,
            {
              variable: "",
              description: "",
              type: "string",
              required: true,
            },
          ])
        }
      >
        Add field
      </button>
    </div>
  );
}
