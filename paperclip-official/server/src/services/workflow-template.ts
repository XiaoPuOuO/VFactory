/**
 * Renders `{{var}}` placeholders using only keys present in `values` (no unknown substitution).
 */
export function renderWorkflowTemplate(template: string, values: Record<string, string>): string {
  const allowed = new Set(Object.keys(values));
  return template.replace(/{{\s*([A-Za-z0-9_-]+)\s*}}/g, (match, varNameRaw: string) => {
    const varName = String(varNameRaw);
    if (!allowed.has(varName)) return match;
    return values[varName] ?? "";
  });
}

export function contextToTemplateValues(ctx: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (k.startsWith("__")) continue;
    if (v == null) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = String(v);
    }
  }
  return out;
}
