import { Router } from "express";
import { listDeployedWorkflows, WorkflowLoadError } from "../workflow/loader.js";

export function workflowsRouter() {
  const router = Router();

  router.get("/workflows/deployed", async (_req, res) => {
    try {
      const workflows = await listDeployedWorkflows();
      res.json({ ok: true, workflows });
    } catch (err) {
      const status = err instanceof WorkflowLoadError ? err.statusCode : 502;
      res.status(status).json({
        ok: false,
        error: err.message || "Failed to list deployed workflows",
      });
    }
  });

  return router;
}
