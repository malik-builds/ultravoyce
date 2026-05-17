import { createClient } from "./client";
import type { WorkflowDocument } from "@/lib/workflow/types";

export interface DeploymentListItem {
  id: number;
  created_at: string;
  workflow_id: string;
  workflow_name: string;
  deployed: boolean;
}

type WorkflowJoin = { workflow: WorkflowDocument };

type DeploymentRow = {
  id: number;
  created_at: string;
  workflow_id: string;
  deployed: boolean;
  workflows: WorkflowJoin | WorkflowJoin[] | null;
};

function workflowNameFromJoin(
  workflows: DeploymentRow["workflows"],
): string {
  const row = Array.isArray(workflows) ? workflows[0] : workflows;
  return row?.workflow?.name ?? "Unknown workflow";
}

export async function listDeployments(): Promise<DeploymentListItem[]> {
  const supabase = createClient();
  if (!supabase) return [];

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("deployments")
    .select(
      `
      id,
      created_at,
      workflow_id,
      deployed,
      workflows (
        workflow
      )
    `,
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return ((data ?? []) as unknown as DeploymentRow[]).map((row) => ({
    id: row.id,
    created_at: row.created_at,
    workflow_id: row.workflow_id,
    workflow_name: workflowNameFromJoin(row.workflows),
    deployed: row.deployed,
  }));
}

export async function deployWorkflow(workflowId: string): Promise<void> {
  const supabase = createClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: existing, error: fetchError } = await supabase
    .from("deployments")
    .select("id")
    .eq("user_id", user.id)
    .eq("workflow_id", workflowId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) throw fetchError;

  if (existing) {
    const { error } = await supabase
      .from("deployments")
      .update({ deployed: true })
      .eq("id", existing.id)
      .eq("user_id", user.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("deployments").insert({
    user_id: user.id,
    workflow_id: workflowId,
    deployed: true,
  });
  if (error) throw error;
}

export async function setDeploymentStatus(
  id: number,
  deployed: boolean,
): Promise<void> {
  const supabase = createClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { error } = await supabase
    .from("deployments")
    .update({ deployed })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw error;
}
