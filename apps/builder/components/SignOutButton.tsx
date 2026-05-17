"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Tooltip } from "@/components/ui/Tooltip";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  const signOut = async () => {
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut();
    router.push("/sign-in");
  };

  return (
    <Tooltip label="Sign out">
      <button
        type="button"
        onClick={() => void signOut()}
        className="rounded p-2 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
        aria-label="Sign out"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </Tooltip>
  );
}
