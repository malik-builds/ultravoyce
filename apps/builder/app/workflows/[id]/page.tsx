import { WorkflowEditor } from "@/components/editor/WorkflowEditor";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function WorkflowEditorPage({ params }: PageProps) {
  const { id } = await params;
  return <WorkflowEditor workflowId={id} />;
}
