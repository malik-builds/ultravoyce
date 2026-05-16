import { createClient, isSupabaseConfigured } from "./client";
import type { WorkflowDocument } from "@/lib/workflow/types";

const LOCAL_KEY = "sayerflow_workflows";

interface LocalRow {
  id: string;
  workflow: WorkflowDocument;
  updated_at: string;
}

function readLocal(): LocalRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as LocalRow[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(rows: LocalRow[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(rows));
}

export interface WorkflowListItem {
  id: string;
  name: string;
  description: string;
  updated_at: string;
  nodeCount: number;
}

export async function listWorkflows(): Promise<WorkflowListItem[]> {
  const supabase = createClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase
      .from("workflows")
      .select("id, workflow, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id as string,
      name: (row.workflow as WorkflowDocument).name,
      description: (row.workflow as WorkflowDocument).description ?? "",
      updated_at: row.updated_at as string,
      nodeCount: (row.workflow as WorkflowDocument).nodes.length,
    }));
  }

  return readLocal().map((row) => ({
    id: row.id,
    name: row.workflow.name,
    description: row.workflow.description ?? "",
    updated_at: row.updated_at,
    nodeCount: row.workflow.nodes.length,
  }));
}

export async function loadWorkflowFromDb(
  id: string,
): Promise<WorkflowDocument | null> {
  const supabase = createClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("workflows")
      .select("workflow")
      .eq("id", id)
      .single();
    if (error) throw error;
    const doc = data.workflow as WorkflowDocument;
    doc.id = id;
    return doc;
  }

  const row = readLocal().find((r) => r.id === id);
  return row ? structuredClone(row.workflow) : null;
}

export async function createWorkflowInDb(
  id: string,
  doc: WorkflowDocument,
): Promise<void> {
  const supabase = createClient();
  doc.id = id;

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in");
    const { error } = await supabase.from("workflows").insert({
      id,
      user_id: user.id,
      workflow: doc,
    });
    if (error) throw error;
    return;
  }

  const rows = readLocal();
  rows.push({
    id,
    workflow: doc,
    updated_at: new Date().toISOString(),
  });
  writeLocal(rows);
}

export async function saveWorkflowToDb(
  id: string,
  doc: WorkflowDocument,
): Promise<void> {
  const supabase = createClient();
  doc.id = id;
  const updated_at = new Date().toISOString();

  if (supabase) {
    const { error } = await supabase
      .from("workflows")
      .update({ workflow: doc, updated_at })
      .eq("id", id);
    if (error) throw error;
    return;
  }

  const rows = readLocal();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) {
    rows.push({ id, workflow: doc, updated_at });
  } else {
    rows[idx] = { id, workflow: doc, updated_at };
  }
  writeLocal(rows);
}

export async function deleteWorkflowFromDb(id: string): Promise<void> {
  const supabase = createClient();
  if (supabase) {
    const { error } = await supabase.from("workflows").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  writeLocal(readLocal().filter((r) => r.id !== id));
}

export async function duplicateWorkflowInDb(id: string): Promise<string> {
  const doc = await loadWorkflowFromDb(id);
  if (!doc) throw new Error("Workflow not found");
  const { v4: uuidv4 } = await import("uuid");
  const newId = uuidv4();
  const copy = structuredClone(doc);
  copy.id = newId;
  copy.name = `${copy.name} (copy)`;
  await createWorkflowInDb(newId, copy);
  return newId;
}

export { isSupabaseConfigured };
