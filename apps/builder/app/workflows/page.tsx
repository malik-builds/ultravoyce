"use client";

import { LogOut, MoreHorizontal, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  deleteWorkflowFromDb,
  duplicateWorkflowInDb,
  listWorkflows,
} from "@/lib/supabase/workflows";

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `Updated ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Updated ${days}d ago`;
}

export default function WorkflowsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ["workflows"],
    queryFn: listWorkflows,
  });

  const signOut = async () => {
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut();
    router.push("/sign-in");
  };

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      <header className="flex h-12 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6">
        <span className="font-mono text-sm font-medium">Sayerflow</span>
        <div className="flex items-center gap-2">
          <Link href="/workflows/new" className="btn-primary flex items-center gap-1.5">
            <Plus className="h-4 w-4" />
            New workflow
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded p-2 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[960px] px-6 py-10">
        {isLoading && (
          <p className="text-[13px] text-[var(--text-tertiary)]">Loading…</p>
        )}
        {!isLoading && workflows.length === 0 && (
          <div className="flex flex-col items-center py-24 text-center">
            <div className="mb-6 h-[120px] w-[180px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)]" />
            <h2 className="text-base font-medium text-[var(--text-primary)]">
              No workflows yet
            </h2>
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
              Create your first voice agent workflow.
            </p>
            <Link href="/workflows/new" className="btn-primary mt-6">
              New workflow
            </Link>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workflows.map((wf) => (
            <WorkflowCard
              key={wf.id}
              workflow={wf}
              onMutate={() =>
                void queryClient.invalidateQueries({ queryKey: ["workflows"] })
              }
            />
          ))}
        </div>
      </main>
    </div>
  );
}

function WorkflowCard({
  workflow,
  onMutate,
}: {
  workflow: {
    id: string;
    name: string;
    description: string;
    updated_at: string;
    nodeCount: number;
  };
  onMutate: () => void;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <article className="group relative rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-5 transition hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[0_4px_16px_#00000044]">
      <Link href={`/workflows/${workflow.id}`} className="block">
        <h3 className="font-mono text-sm font-medium text-[var(--text-primary)]">
          {workflow.name}
        </h3>
        <p className="mt-2 line-clamp-2 text-[12px] text-[var(--text-secondary)]">
          {workflow.description || "No description"}
        </p>
        <p className="mt-4 font-mono text-[11px] text-[var(--text-tertiary)]">
          {workflow.nodeCount} nodes
        </p>
        <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
          {formatRelative(workflow.updated_at)}
        </p>
      </Link>
      <button
        type="button"
        className="absolute right-3 top-3 rounded p-1 opacity-0 transition group-hover:opacity-100 hover:bg-[var(--bg-hover)]"
        onClick={() => setMenuOpen((o) => !o)}
      >
        <MoreHorizontal className="h-4 w-4 text-[var(--text-tertiary)]" />
      </button>
      {menuOpen && (
        <div className="absolute right-3 top-10 z-10 min-w-[120px] rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] py-1 shadow-lg">
          <Link
            href={`/workflows/${workflow.id}`}
            className="block px-3 py-1.5 text-[12px] hover:bg-[var(--bg-hover)]"
          >
            Edit
          </Link>
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left text-[12px] hover:bg-[var(--bg-hover)]"
            onClick={async () => {
              const id = await duplicateWorkflowInDb(workflow.id);
              onMutate();
              router.push(`/workflows/${id}`);
            }}
          >
            Duplicate
          </button>
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left text-[12px] text-[var(--error)] hover:bg-[var(--bg-hover)]"
            onClick={async () => {
              if (confirm("Delete this workflow?")) {
                await deleteWorkflowFromDb(workflow.id);
                onMutate();
              }
            }}
          >
            Delete
          </button>
        </div>
      )}
    </article>
  );
}
