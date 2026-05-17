import { readFile } from "fs/promises";
import { WORKFLOW_PATH, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../config.js";

function validate(parsed) {
  if (!parsed?.workflow?.nodes || !Array.isArray(parsed.workflow.nodes)) {
    throw new Error("Invalid workflow: missing nodes array");
  }
  if (!parsed.workflow.entryNodeId) {
    throw new Error("Invalid workflow: missing entryNodeId");
  }
  return parsed;
}

export async function loadFromFile(filePath = WORKFLOW_PATH) {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  // Support both { workflow: {...} } envelope and the workflow object directly
  const normalized = parsed?.workflow ? parsed : { workflow: parsed };
  return validate(normalized);
}

export async function loadFromSupabase(workflowId) {
  const url = `${SUPABASE_URL}/rest/v1/workflows?id=eq.${encodeURIComponent(workflowId)}&select=workflow&limit=1`;
  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) throw new Error(`Supabase fetch failed: ${response.status}`);

  const rows = await response.json();
  if (!rows.length) throw new Error(`Workflow ${workflowId} not found in database`);

  const wfData = rows[0].workflow;
  // Support both { workflow: {...} } and the inner object directly
  const normalized = wfData?.workflow ? wfData : { workflow: wfData };
  return validate(normalized);
}
