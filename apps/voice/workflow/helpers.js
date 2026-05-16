export function interpolateString(raw, variables) {
  if (typeof raw !== "string") return raw;
  return raw.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, keyExpr) => {
    const key = String(keyExpr).trim();
    if (key.startsWith("secrets.")) return process.env[key.slice("secrets.".length)] || "";
    return variables[key]?.value == null ? "" : String(variables[key].value);
  });
}

export function parseBasicType(rawValue, variableType) {
  if (rawValue == null) return null;
  const value = String(rawValue).trim();
  if (!value) return null;
  if (variableType === "number") {
    const n = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  if (variableType === "boolean") {
    const lower = value.toLowerCase();
    if (["yes", "y", "true", "confirm", "confirmed"].includes(lower)) return true;
    if (["no", "n", "false", "cancel"].includes(lower)) return false;
    return null;
  }
  return value;
}

export function isLikelyValidValue(field, value) {
  if (value == null) return false;
  const str = String(value).trim();
  if (!str) return false;
  const meta = `${field?.description || ""} ${field?.variable || ""}`.toLowerCase();
  if (meta.includes("email")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
  if (meta.includes("phone")) return /^[+\d][\d\s\-()]{6,}$/.test(str);
  return true;
}

export function firstMissingRequired(node, session) {
  return (node.config?.fields || [])
    .filter((f) => f.required)
    .find((f) => {
      const val = session.variables[f.variable]?.value;
      return val == null || String(val).trim() === "";
    }) || null;
}
