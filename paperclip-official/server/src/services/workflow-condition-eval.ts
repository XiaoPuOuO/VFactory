/**
 * Mini DSL for workflow condition steps. No arbitrary eval.
 * Supported forms (trimmed):
 * - {{var}} == 'literal' or "literal"
 * - {{var}} != 'literal'
 * - {{var}} contains 'substring' (case-sensitive)
 */
export function evaluateWorkflowCondition(expression: string, values: Record<string, string>): boolean {
  const s = expression.trim();

  const eq = s.match(/^{\{\s*([A-Za-z0-9_-]+)\s*\}}\s*==\s*(['"])([^'"]*)\2\s*$/);
  if (eq) {
    return (values[eq[1]!] ?? "") === eq[3]!;
  }

  const ne = s.match(/^{\{\s*([A-Za-z0-9_-]+)\s*\}}\s*!=\s*(['"])([^'"]*)\2\s*$/);
  if (ne) {
    return (values[ne[1]!] ?? "") !== ne[3]!;
  }

  const ct = s.match(/^{\{\s*([A-Za-z0-9_-]+)\s*\}}\s+contains\s+(['"])([^'"]*)\2\s*$/i);
  if (ct) {
    return (values[ct[1]!] ?? "").includes(ct[3]!);
  }

  throw new Error(`Unsupported workflow condition expression: ${expression.slice(0, 80)}`);
}
