"use client";

import {
  LogOut,
  Redo2,
  Save,
  Undo2,
  Variable,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { hasBlockingErrors } from "@/lib/workflow/validation";
import { useWorkflowStore } from "@/store/workflow-store";
import { GlobalVariablesDrawer } from "./GlobalVariablesDrawer";

export function EditorToolbar() {
  const router = useRouter();
  const reactFlow = useReactFlow();
  const [zoom, setZoom] = useState(100);
  const [varsOpen, setVarsOpen] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);
  const [errorsOpen, setErrorsOpen] = useState(false);

  const name = useWorkflowStore((s) => s.name);
  const setName = useWorkflowStore((s) => s.setName);
  const isDirty = useWorkflowStore((s) => s.isDirty);
  const isSaving = useWorkflowStore((s) => s.isSaving);
  const saveError = useWorkflowStore((s) => s.saveError);
  const lastSavedAt = useWorkflowStore((s) => s.lastSavedAt);
  const save = useWorkflowStore((s) => s.save);
  const undo = useWorkflowStore((s) => s.undo);
  const redo = useWorkflowStore((s) => s.redo);
  const historyIndex = useWorkflowStore((s) => s.historyIndex);
  const history = useWorkflowStore((s) => s.history);
  const validationIssues = useWorkflowStore((s) => s.validationIssues);
  const pushHistory = useWorkflowStore((s) => s.pushHistory);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;
  const blocking = hasBlockingErrors(validationIssues);

  const handleSave = useCallback(async () => {
    if (blocking) {
      setErrorsOpen(true);
      return;
    }
    await save();
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 2000);
  }, [blocking, save]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void handleSave();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        (e.key === "Z" || (e.key === "z" && e.shiftKey))
      ) {
        e.preventDefault();
        redo();
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "f") {
        e.preventDefault();
        reactFlow.fitView({ padding: 0.2 });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave, undo, redo, reactFlow]);

  const signOut = async () => {
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut();
    router.push("/sign-in");
  };

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4">
        <span className="font-mono text-sm font-medium text-[var(--text-primary)]">
          Sayerflow
        </span>
        <span className="h-5 w-px bg-[var(--border-subtle)]" />
        <input
          className="min-w-0 flex-1 bg-transparent font-mono text-sm text-[var(--text-primary)] outline-none"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => pushHistory()}
        />

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!canUndo}
            onClick={undo}
            className="rounded p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-30"
            aria-label="Undo"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={redo}
            className="rounded p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-30"
            aria-label="Redo"
          >
            <Redo2 className="h-4 w-4" />
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {blocking && (
            <span className="text-[11px] text-[var(--error)]">
              Fix errors before saving
            </span>
          )}
          <button
            type="button"
            onClick={() => setVarsOpen(true)}
            className="flex items-center gap-1.5 rounded px-2 py-1.5 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <Variable className="h-4 w-4" />
            Variables
          </button>
          <span className="h-5 w-px bg-[var(--border-subtle)]" />
          <button
            type="button"
            onClick={() => {
              reactFlow.zoomOut();
              setZoom(Math.round(reactFlow.getZoom() * 100));
            }}
            className="rounded p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => reactFlow.setViewport({ ...reactFlow.getViewport(), zoom: 1 })}
            className="min-w-[3rem] font-mono text-[12px] text-[var(--text-secondary)]"
          >
            {zoom}%
          </button>
          <button
            type="button"
            onClick={() => {
              reactFlow.zoomIn();
              setZoom(Math.round(reactFlow.getZoom() * 100));
            }}
            className="rounded p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => reactFlow.fitView({ padding: 0.2 })}
            className="rounded px-2 py-1 text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            Fit
          </button>
          <span className="h-5 w-px bg-[var(--border-subtle)]" />
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded p-2 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium ${
              isDirty
                ? "bg-[var(--accent)] text-[var(--text-primary)]"
                : "border border-[var(--border-default)] text-[var(--text-secondary)]"
            }`}
          >
            {isDirty && (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--accent-bright)]" />
            )}
            <Save className="h-3.5 w-3.5" />
            {isSaving
              ? "Saving…"
              : saveFlash || (!isDirty && lastSavedAt)
                ? "Saved"
                : saveError
                  ? "Failed — retry"
                  : "Save"}
          </button>
        </div>
      </header>

      <GlobalVariablesDrawer open={varsOpen} onClose={() => setVarsOpen(false)} />

      {errorsOpen && blocking && (
        <div className="absolute left-1/2 top-14 z-50 w-[400px] -translate-x-1/2 rounded-lg border border-[var(--error)] bg-[var(--bg-elevated)] p-4 shadow-xl">
          <p className="mb-2 text-sm font-medium text-[var(--error)]">
            Cannot save — fix these issues:
          </p>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-[12px] text-[var(--text-secondary)]">
            {validationIssues
              .filter((i) => i.severity === "error")
              .map((i, idx) => (
                <li key={idx}>• {i.message}</li>
              ))}
          </ul>
          <button
            type="button"
            className="mt-3 text-[12px] text-[var(--text-tertiary)] underline"
            onClick={() => setErrorsOpen(false)}
          >
            Dismiss
          </button>
        </div>
      )}
    </>
  );
}
