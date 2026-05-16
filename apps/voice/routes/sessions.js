import { Router } from "express";
import { readFile } from "fs/promises";
import path from "path";
import { RECORDINGS_DIR } from "../config.js";

export function sessionsRouter() {
  const router = Router();

  router.get("/sessions/:sessionId", async (req, res) => {
    const { sessionId } = req.params;
    if (!/^[0-9a-f-]{36}$/.test(sessionId)) {
      return res.status(400).json({ ok: false, error: "Invalid session ID" });
    }
    const dir = path.join(RECORDINGS_DIR, sessionId);
    try {
      const [transcript, collectedData, metadataRaw] = await Promise.all([
        readFile(path.join(dir, "transcript.txt"), "utf8").catch(() => null),
        readFile(path.join(dir, "collected_data.txt"), "utf8").catch(() => null),
        readFile(path.join(dir, "metadata.json"), "utf8").catch(() => null),
      ]);
      if (!transcript && !collectedData) {
        return res.status(404).json({ ok: false, error: "Session not found" });
      }
      res.json({
        ok: true,
        sessionId,
        transcript,
        collectedData,
        metadata: metadataRaw ? JSON.parse(metadataRaw) : null,
      });
    } catch {
      res.status(500).json({ ok: false, error: "Failed to read session data" });
    }
  });

  return router;
}
