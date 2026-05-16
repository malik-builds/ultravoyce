import { Router } from "express";

export function workflowRouter(getWorkflow, setWorkflow) {
  const router = Router();

  router.post("/workflow", (req, res) => {
    const body = req.body;
    // Accept { workflow: {...} } or the inner workflow object directly
    const wf = body?.workflow ? body : body?.id ? { workflow: body } : null;
    if (!wf?.workflow?.nodes || !Array.isArray(wf.workflow.nodes) || !wf.workflow.entryNodeId) {
      return res.status(400).json({ ok: false, error: "Invalid workflow: missing nodes or entryNodeId" });
    }
    setWorkflow(wf);
    console.log(`Workflow updated via API: ${wf.workflow.id || "unknown"}`);
    res.json({ ok: true, workflowId: wf.workflow.id });
  });

  router.get("/workflow", (_req, res) => {
    const wf = getWorkflow();
    if (!wf) return res.status(404).json({ ok: false, error: "No workflow loaded" });
    res.json({ ok: true, workflow: wf.workflow });
  });

  return router;
}
