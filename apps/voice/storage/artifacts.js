import { writeFile } from "fs/promises";
import path from "path";

export async function writeSessionArtifacts(session, metadata) {
  const dir = session.sessionDir;

  const collectedLines = Object.entries(session.variables)
    .filter(([, v]) => v.value != null)
    .map(([k, v]) => `${k}: ${String(v.value)}`)
    .join("\n");

  await Promise.all([
    writeFile(path.join(dir, "transcript.txt"), session.turns.join("\n"), "utf8"),
    writeFile(path.join(dir, "workflow_trace.json"), JSON.stringify(session.turnObjects, null, 2), "utf8"),
    writeFile(path.join(dir, "metadata.json"), JSON.stringify(metadata, null, 2), "utf8"),
    writeFile(path.join(dir, "collected_data.txt"), collectedLines || "(no data collected)", "utf8"),
  ]);
}
