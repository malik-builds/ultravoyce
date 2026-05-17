import { Router } from "express";

export function healthRouter({ supabaseConfigured = false } = {}) {
  const router = Router();
  router.get("/health", (_req, res) => {
    res.json({ ok: true, supabaseConfigured });
  });
  return router;
}
