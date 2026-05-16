import { ALLOW_LOCAL_WEBHOOKS } from "../../config.js";

const PRIVATE_RANGE = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|::1|0\.0\.0\.0|fc|fd)/i;

// Fires an n8n / webhook with interpolated variable payload.
export async function enter({ session, node, send, interpolate }) {
  const result = await callWebhook(node, session, interpolate);
  send(session.clientWs, { type: "workflow.action.result", nodeId: node.id, ...result });

  if (!result.ok && node.config?.onFailure === "stop") {
    return { waitForInput: false, nextNodeId: null };
  }
  return { waitForInput: false, nextNodeId: node.nextNodeId };
}

async function callWebhook(node, session, interpolate) {
  const rawUrl = interpolate(node.config?.webhookUrl || "", session.variables);
  if (!rawUrl) return { ok: false, message: "Missing webhookUrl in action node." };

  let url;
  try { url = new URL(rawUrl); } catch { return { ok: false, message: "Invalid webhook URL." }; }

  if (!ALLOW_LOCAL_WEBHOOKS && url.protocol !== "https:") {
    return { ok: false, message: "Webhook URL must use https." };
  }
  if (!ALLOW_LOCAL_WEBHOOKS && PRIVATE_RANGE.test(url.hostname)) {
    return { ok: false, message: "Webhook host is blocked." };
  }

  const payload = {};
  for (const [k, v] of Object.entries(node.config?.payload || {})) {
    payload[k] = typeof v === "string" ? interpolate(v, session.variables) : v;
  }

  try {
    const res = await fetch(url.toString(), {
      method: node.config?.method || "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, message: `Webhook failed: ${res.status}` };
    return { ok: true, message: "Webhook executed." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Webhook request failed" };
  }
}
