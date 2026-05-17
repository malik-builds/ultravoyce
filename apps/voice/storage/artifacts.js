import { writeFile } from "fs/promises";
import path from "path";

export async function writeSessionArtifacts(session, metadata) {
  const dir = session.sessionDir;

  const collectedLines = Object.entries(session.variables)
    .filter(([, v]) => v.value != null)
    .map(([k, v]) => `${k}: ${String(v.value)}`)
    .join("\n");

  const leadLines = (session.capturedLeads || [])
    .map((l, i) => {
      const parts = [`[Lead ${i + 1}] source: ${l.source}`];
      if (l.name)    parts.push(`name: ${l.name}`);
      if (l.email)   parts.push(`email: ${l.email}`);
      if (l.contact) parts.push(`contact: ${l.contact}`);
      if (l.phone)   parts.push(`phone: ${l.phone}`);
      return parts.join(", ");
    })
    .join("\n");

  const collectedData = [collectedLines, leadLines].filter(Boolean).join("\n\n--- Captured Leads ---\n") || "(no data collected)";

  await Promise.all([
    writeFile(path.join(dir, "transcript.txt"), session.turns.join("\n"), "utf8"),
    writeFile(path.join(dir, "workflow_trace.json"), JSON.stringify(session.turnObjects, null, 2), "utf8"),
    writeFile(path.join(dir, "metadata.json"), JSON.stringify(metadata, null, 2), "utf8"),
    writeFile(path.join(dir, "collected_data.txt"), collectedData, "utf8"),
  ]);
}
