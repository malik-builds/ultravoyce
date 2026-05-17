"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SignOutButton } from "@/components/SignOutButton";
import {
  listDeployments,
  setDeploymentStatus,
  type DeploymentListItem,
} from "@/lib/supabase/deployments";

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `Created ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Created ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Created ${days}d ago`;
}

export default function DeploymentsPage() {
  const queryClient = useQueryClient();
  const { data: deployments = [], isLoading } = useQuery({
    queryKey: ["deployments"],
    queryFn: listDeployments,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, deployed }: { id: number; deployed: boolean }) =>
      setDeploymentStatus(id, deployed),
    onMutate: async ({ id, deployed }) => {
      await queryClient.cancelQueries({ queryKey: ["deployments"] });
      const previous = queryClient.getQueryData<DeploymentListItem[]>([
        "deployments",
      ]);
      queryClient.setQueryData<DeploymentListItem[]>(["deployments"], (old) =>
        (old ?? []).map((d) => (d.id === id ? { ...d, deployed } : d)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["deployments"], context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["deployments"] });
    },
  });

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      <header className="flex h-12 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6">
        <Link
          href="/workflows"
          className="font-mono text-sm font-medium text-[var(--text-primary)] hover:text-[var(--text-secondary)]"
        >
          Sayerflow
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/workflows" className="btn-ghost">
            Workflows
          </Link>
          <SignOutButton />
        </div>
      </header>

      <main className="mx-auto max-w-[960px] px-6 py-10">
        <div className="mb-8">
          <h1 className="font-mono text-lg font-medium text-[var(--text-primary)]">
            Deployments
          </h1>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            Manage which workflows are live for your voice agents.
          </p>
        </div>

        {isLoading && (
          <p className="text-[13px] text-[var(--text-tertiary)]">Loading…</p>
        )}

        {!isLoading && deployments.length === 0 && (
          <div className="flex flex-col items-center py-24 text-center">
            <div className="mb-6 h-[120px] w-[180px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)]" />
            <h2 className="text-base font-medium text-[var(--text-primary)]">
              No deployments yet
            </h2>
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
              Deployments appear here when a workflow is published.
            </p>
            <Link href="/workflows" className="btn-primary mt-6">
              Go to workflows
            </Link>
          </div>
        )}

        {!isLoading && deployments.length > 0 && (
          <ul className="flex flex-col gap-3">
            {deployments.map((deployment) => (
              <DeploymentRow
                key={deployment.id}
                deployment={deployment}
                toggling={
                  toggleMutation.isPending &&
                  toggleMutation.variables?.id === deployment.id
                }
                onToggle={(deployed) =>
                  toggleMutation.mutate({ id: deployment.id, deployed })
                }
              />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function DeploymentRow({
  deployment,
  toggling,
  onToggle,
}: {
  deployment: DeploymentListItem;
  toggling: boolean;
  onToggle: (deployed: boolean) => void;
}) {
  return (
    <li className="flex items-center gap-4 rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-elevated)] px-5 py-4 transition hover:border-[var(--border-strong)] hover:shadow-[0_4px_16px_#00000044]">
      <div className="min-w-0 flex-1">
        <Link
          href={`/workflows/${deployment.workflow_id}`}
          className="font-mono text-sm font-medium text-[var(--text-primary)] hover:underline"
        >
          {deployment.workflow_name}
        </Link>
        <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
          {formatRelative(deployment.created_at)}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <span
          className={`font-mono text-[11px] ${
            deployment.deployed
              ? "text-[var(--success)]"
              : "text-[var(--text-tertiary)]"
          }`}
        >
          {deployment.deployed ? "Live" : "Inactive"}
        </span>
        <DeployToggle
          checked={deployment.deployed}
          disabled={toggling}
          onChange={onToggle}
          label={`Toggle deployment for ${deployment.workflow_name}`}
        />
      </div>
    </li>
  );
}

function DeployToggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (deployed: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--accent-dim)] disabled:cursor-not-allowed disabled:opacity-40 ${
        checked
          ? "border-[var(--success)] bg-[var(--success)]"
          : "border-[var(--border-default)] bg-[var(--bg-hover)]"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-[var(--text-primary)] shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}
