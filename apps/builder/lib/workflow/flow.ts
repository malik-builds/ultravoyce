import type { Edge, Node } from "@xyflow/react";
import type { WorkflowNode } from "./types";

export const WORKFLOW_NODE_TYPE = "workflowNode";

export type WorkflowNodeData = {
  workflowNode: WorkflowNode;
  isEntry: boolean;
  issues: { severity: "error" | "warning" }[];
};

export function workflowNodesToFlow(
  nodes: WorkflowNode[],
  entryNodeId: string | null,
  nodeIssues: Map<string, { severity: "error" | "warning" }[]>,
): Node<WorkflowNodeData>[] {
  return nodes.map((n) => ({
    id: n.id,
    type: WORKFLOW_NODE_TYPE,
    position: n.position,
    data: {
      workflowNode: n,
      isEntry: n.id === entryNodeId,
      issues: nodeIssues.get(n.id) ?? [],
    },
  }));
}

export function workflowEdgesFromNodes(nodes: WorkflowNode[]): Edge[] {
  const edges: Edge[] = [];

  for (const node of nodes) {
    if (node.type === "switch") {
      const config = node.config as {
        cases: { value: string; label: string; nextNodeId: string | null }[];
        defaultCaseNextNodeId: string | null;
      };
      for (const c of config.cases) {
        if (c.nextNodeId) {
          edges.push({
            id: `e-${node.id}-${c.value}-${c.nextNodeId}`,
            source: node.id,
            sourceHandle: c.value,
            target: c.nextNodeId,
            targetHandle: "input",
          });
        }
      }
      if (config.defaultCaseNextNodeId) {
        edges.push({
          id: `e-${node.id}-default-${config.defaultCaseNextNodeId}`,
          source: node.id,
          sourceHandle: "default",
          target: config.defaultCaseNextNodeId,
          targetHandle: "input",
        });
      }
    } else if (node.nextNodeId) {
      edges.push({
        id: `e-${node.id}-${node.nextNodeId}`,
        source: node.id,
        sourceHandle: "output",
        target: node.nextNodeId,
        targetHandle: "input",
      });
    }
  }

  return edges;
}

export function inferEntryNodeId(nodes: WorkflowNode[]): string | null {
  const targets = new Set<string>();
  for (const node of nodes) {
    if (node.nextNodeId) targets.add(node.nextNodeId);
    if (node.type === "switch") {
      const config = node.config as {
        cases: { nextNodeId: string | null }[];
        defaultCaseNextNodeId: string | null;
      };
      for (const c of config.cases) {
        if (c.nextNodeId) targets.add(c.nextNodeId);
      }
      if (config.defaultCaseNextNodeId) {
        targets.add(config.defaultCaseNextNodeId);
      }
    }
  }
  const entry = nodes.find((n) => !targets.has(n.id));
  return entry?.id ?? nodes[0]?.id ?? null;
}
