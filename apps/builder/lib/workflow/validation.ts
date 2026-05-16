import type { ValidationIssue, WorkflowDocument, WorkflowNode } from "./types";
import { isConfigValid } from "./subtitles";

export function validateWorkflow(doc: WorkflowDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodeIds = new Set(doc.nodes.map((n) => n.id));

  if (!doc.entryNodeId) {
    issues.push({
      message: "No entry node set",
      severity: "error",
    });
  } else if (!nodeIds.has(doc.entryNodeId)) {
    issues.push({
      message: "Entry node does not exist",
      severity: "error",
    });
  }

  for (const node of doc.nodes) {
    issues.push(...validateNode(node, doc.nodes, nodeIds));
  }

  return issues;
}

function validateNode(
  node: WorkflowNode,
  nodes: WorkflowNode[],
  nodeIds: Set<string>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!node.label.trim()) {
    issues.push({
      nodeId: node.id,
      message: "Node has no label",
      severity: "warning",
    });
  }

  if (!isConfigValid(node)) {
    issues.push({
      nodeId: node.id,
      message: "Required configuration is missing",
      severity: "error",
    });
  }

  if (node.nextNodeId && !nodeIds.has(node.nextNodeId)) {
    issues.push({
      nodeId: node.id,
      message: "Connection points to a missing node",
      severity: "error",
    });
  }

  if (node.type === "switch") {
    const config = node.config as {
      cases: { value: string; nextNodeId: string | null }[];
      defaultCaseNextNodeId: string | null;
    };
    for (const c of config.cases) {
      if (c.nextNodeId && !nodeIds.has(c.nextNodeId)) {
        issues.push({
          nodeId: node.id,
          edgeId: `${node.id}:${c.value}`,
          message: `Case "${c.value}" points to a missing node`,
          severity: "error",
        });
      }
      if (!c.nextNodeId) {
        issues.push({
          nodeId: node.id,
          edgeId: `${node.id}:${c.value}`,
          message: `Case "${c.value}" has no outgoing connection`,
          severity: "warning",
        });
      }
    }
    if (
      config.defaultCaseNextNodeId &&
      !nodeIds.has(config.defaultCaseNextNodeId)
    ) {
      issues.push({
        nodeId: node.id,
        message: "Default case points to a missing node",
        severity: "error",
      });
    }
  } else if (!node.nextNodeId) {
    const hasIncoming = nodes.some(
      (n) =>
        n.nextNodeId === node.id ||
        (n.type === "switch" &&
          (
            n.config as {
              cases: { nextNodeId: string | null }[];
              defaultCaseNextNodeId: string | null;
            }
          ).cases.some((c) => c.nextNodeId === node.id) ||
          (
            n.config as { defaultCaseNextNodeId: string | null }
          ).defaultCaseNextNodeId === node.id),
    );
    if (hasIncoming || node.id === nodes[0]?.id) {
      issues.push({
        nodeId: node.id,
        message: "No outgoing connection",
        severity: "warning",
      });
    }
  }

  if (node.type === "ask_question") {
    const storeIn = (node.config as { storeIn: string }).storeIn;
    if (storeIn && !(storeIn in ({} as WorkflowDocument["globalVariables"]))) {
      // checked at store level with globalVariables
    }
  }

  return issues;
}

export function getNodeIssues(
  issues: ValidationIssue[],
  nodeId: string,
): ValidationIssue[] {
  return issues.filter((i) => i.nodeId === nodeId);
}

export function hasBlockingErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}
