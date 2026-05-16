import { Router } from "express";

export function healthRouter(getWorkflow) {
  const router = Router();
  router.get("/health", (_req, res) => {
    res.json({ ok: true, workflowLoaded: Boolean(getWorkflow()?.workflow?.id) });
  });
  return router;
}
