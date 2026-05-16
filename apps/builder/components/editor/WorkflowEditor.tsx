"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { useEffect } from "react";
import { loadWorkflowFromDb } from "@/lib/supabase/workflows";
import { useWorkflowStore } from "@/store/workflow-store";
import { ConfigPanel } from "./ConfigPanel";
import { EditorToolbar } from "./EditorToolbar";
import { EmptyCanvas } from "./EmptyCanvas";
import { NodePalette } from "./NodePalette";
import { WorkflowCanvas } from "./WorkflowCanvas";

interface WorkflowEditorProps {
  workflowId: string;
}

export function WorkflowEditor({ workflowId }: WorkflowEditorProps) {
  const loadDocument = useWorkflowStore((s) => s.loadDocument);
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const doc = await loadWorkflowFromDb(workflowId);
      if (!cancelled && doc) {
        loadDocument(doc);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workflowId, loadDocument]);

  return (
    <ReactFlowProvider>
      <div className="flex h-screen flex-col overflow-hidden bg-[var(--bg-base)]">
        <EditorToolbar />
        <div className="relative flex min-h-0 flex-1">
          <NodePalette />
          <div className="relative min-w-0 flex-1">
            <WorkflowCanvas />
            <EmptyCanvas />
          </div>
          {selectedNodeId && <ConfigPanel />}
        </div>
      </div>
    </ReactFlowProvider>
  );
}
