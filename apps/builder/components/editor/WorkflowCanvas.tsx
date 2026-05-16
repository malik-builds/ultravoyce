"use client";

import {
  Background,
  BackgroundVariant,
  ReactFlow,
  useReactFlow,
  type Connection,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  WORKFLOW_NODE_TYPE,
  workflowEdgesFromNodes,
  workflowNodesToFlow,
} from "@/lib/workflow/flow";
import type { NodeType } from "@/lib/workflow/types";
import { getNodeIssues, validateWorkflow } from "@/lib/workflow/validation";
import { useWorkflowStore } from "@/store/workflow-store";
import { WorkflowNodeCard } from "./WorkflowNodeCard";

const nodeTypes = { [WORKFLOW_NODE_TYPE]: WorkflowNodeCard };

function CanvasInner() {
  const reactFlow = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const nodes = useWorkflowStore((s) => s.nodes);
  const entryNodeId = useWorkflowStore((s) => s.entryNodeId);
  const globalVariables = useWorkflowStore((s) => s.globalVariables);
  const name = useWorkflowStore((s) => s.name);
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const addNode = useWorkflowStore((s) => s.addNode);
  const updateNodePosition = useWorkflowStore((s) => s.updateNodePosition);
  const connectNodes = useWorkflowStore((s) => s.connectNodes);
  const disconnectNodes = useWorkflowStore((s) => s.disconnectNodes);
  const deleteNode = useWorkflowStore((s) => s.deleteNode);
  const pushHistory = useWorkflowStore((s) => s.pushHistory);
  const setValidationIssues = useWorkflowStore((s) => s.setValidationIssues);
  const id = useWorkflowStore((s) => s.id);
  const version = useWorkflowStore((s) => s.version);
  const trigger = useWorkflowStore((s) => s.trigger);

  const docForValidation = useMemo(
    () => ({
      id,
      name,
      version,
      trigger,
      globalVariables,
      entryNodeId,
      nodes,
    }),
    [id, name, version, trigger, globalVariables, entryNodeId, nodes],
  );

  const issues = useMemo(
    () => validateWorkflow(docForValidation),
    [docForValidation],
  );

  useEffect(() => {
    setValidationIssues(issues);
  }, [issues, setValidationIssues]);

  const issueMap = useMemo(() => {
    const map = new Map<string, { severity: "error" | "warning" }[]>();
    for (const node of nodes) {
      const nodeIssues = getNodeIssues(issues, node.id);
      if (nodeIssues.length) {
        map.set(
          node.id,
          nodeIssues.map((i) => ({ severity: i.severity })),
        );
      }
    }
    return map;
  }, [issues, nodes]);

  const flowNodes = useMemo(
    () =>
      workflowNodesToFlow(nodes, entryNodeId, issueMap).map((n) => ({
        ...n,
        selected: n.id === selectedNodeId,
      })),
    [nodes, entryNodeId, issueMap, selectedNodeId],
  );

  const flowEdges = useMemo(() => workflowEdgesFromNodes(nodes), [nodes]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          updateNodePosition(change.id, change.position);
          if (change.dragging === false) pushHistory();
        }
        if (change.type === "select") {
          if (change.selected) setSelectedNode(change.id);
        }
        if (change.type === "remove") {
          deleteNode(change.id);
        }
      }
    },
    [updateNodePosition, pushHistory, setSelectedNode, deleteNode],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      for (const change of changes) {
        if (change.type === "remove") {
          const edge = flowEdges.find((e) => e.id === change.id);
          if (edge) {
            disconnectNodes(edge.source, edge.sourceHandle ?? undefined);
          }
        }
      }
    },
    [flowEdges, disconnectNodes],
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      connectNodes(
        connection.source,
        connection.target,
        connection.sourceHandle,
      );
    },
    [connectNodes],
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData("application/reactflow") as NodeType;
      if (!type) return;
      const bounds = wrapperRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const position = reactFlow.screenToFlowPosition({
        x: e.clientX - bounds.left,
        y: e.clientY - bounds.top,
      });
      addNode(type, position);
    },
    [addNode, reactFlow],
  );

  return (
    <div
      ref={wrapperRef}
      className="canvas-dot-grid h-full w-full"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneClick={onPaneClick}
        fitView
        minZoom={0.25}
        maxZoom={1.5}
        defaultEdgeOptions={{ type: "smoothstep" }}
        deleteKeyCode={["Backspace", "Delete"]}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="#ffffff08"
        />
      </ReactFlow>
    </div>
  );
}

export function WorkflowCanvas() {
  return <CanvasInner />;
}
