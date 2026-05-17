import { SUPABASE_URL, SUPABASE_SECRET_KEY } from "../config.js";

export class WorkflowLoadError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

function supabaseHeaders() {
  return {
    apikey: SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    "Content-Type": "application/json",
  };
}

async function supabaseGet(path) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const response = await fetch(url, { headers: supabaseHeaders() });
  if (!response.ok) {
    throw new WorkflowLoadError(`Supabase fetch failed: ${response.status}`, 502);
  }
  return response.json();
}

function validate(parsed) {
  if (!parsed?.workflow?.nodes || !Array.isArray(parsed.workflow.nodes)) {
    throw new WorkflowLoadError("Invalid workflow: missing nodes array", 502);
  }
  if (!parsed.workflow.entryNodeId) {
    throw new WorkflowLoadError("Invalid workflow: missing entryNodeId", 502);
  }
  return parsed;
}

async function checkDeployed(workflowId) {
  const rows = await supabaseGet(
    `deployments?workflow_id=eq.${encodeURIComponent(workflowId)}&select=deployed&order=created_at.desc&limit=1`,
  );
  if (!rows.length || rows[0].deployed !== true) {
    throw new WorkflowLoadError("The workflow has not been deployed", 400);
  }
}

export async function loadFromSupabase(workflowId) {
  await checkDeployed(workflowId);

  const rows = await supabaseGet(
    `workflows?id=eq.${encodeURIComponent(workflowId)}&select=workflow&limit=1`,
  );
  if (!rows.length) {
    throw new WorkflowLoadError("Workflow not found", 404);
  }

  const wfData = rows[0].workflow;
  const normalized = wfData?.workflow ? wfData : { workflow: wfData };
  return validate(normalized);
}

export async function loadWorkflow(workflowId) {
  return loadFromSupabase(workflowId);
}

function workflowDocFromJoin(workflowsJoin) {
  const row = Array.isArray(workflowsJoin) ? workflowsJoin[0] : workflowsJoin;
  const doc = row?.workflow;
  if (!doc) return null;
  return doc?.workflow ?? doc;
}

export async function listDeployedWorkflows() {
  const rows = await supabaseGet(
    "deployments?deployed=eq.true&select=workflow_id,created_at,workflows(workflow)&order=created_at.desc",
  );

  const seen = new Set();
  const workflows = [];

  for (const row of rows) {
    if (seen.has(row.workflow_id)) continue;
    seen.add(row.workflow_id);

    const doc = workflowDocFromJoin(row.workflows);
    if (!doc) continue;

    workflows.push({
      id: row.workflow_id,
      name: doc.name || "Untitled workflow",
      description: doc.description || "",
    });
  }

  return workflows;
}
