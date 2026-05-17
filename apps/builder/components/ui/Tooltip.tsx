"use client";

import type { ReactElement } from "react";

export function Tooltip({
  label,
  children,
}: {
  label: string;
  children: ReactElement;
}) {
  return (
    <span className="group/tooltip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute top-full left-1/2 z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] text-[var(--text-primary)] opacity-0 shadow-[0_4px_16px_#00000044] transition-opacity duration-150 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}
