"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { createBlankWorkflow } from "@/lib/workflow/defaults";
import { createWorkflowInDb } from "@/lib/supabase/workflows";

export default function NewWorkflowPage() {
  const router = useRouter();

  useEffect(() => {
    void (async () => {
      const id = uuidv4();
      const doc = createBlankWorkflow(id);
      await createWorkflowInDb(id, doc);
      router.replace(`/workflows/${id}`);
    })();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-[var(--text-secondary)]">
      Creating workflow…
    </div>
  );
}
