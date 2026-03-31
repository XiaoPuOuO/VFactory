export type SkillInvocation = {
  /**
   * Skill name (kebab-case, lowercase).
   */
  name: string;
  /**
   * Raw args tokens (string form). Runtime will validate/convert later.
   */
  args: string[];
  /**
   * Original line snippet (for debugging / audit).
   */
  raw: string;
};

const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// v0: 每個 invocation 只從「該行的第一個 /skillname」解析，避免把 URL/程式碼片段誤當成指令。
// 允許 skillname 為 kebab-case，但允許輸入用任何大小寫/含 _/-，最後會正規化為小寫。
const INVOCATION_LINE_RE = /^\s*\/([A-Za-z0-9_-]{1,64})(?:\s+(.*?))?\s*$/;

const ARG_TOKEN_RE =
  /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|[^\s]+/g;

function normalizeSkillName(input: string): string | null {
  const normalized = input.trim().toLowerCase().replace(/_/g, "-");
  if (!SKILL_NAME_RE.test(normalized)) return null;
  return normalized;
}

/**
 * 前端 Markdown 序列化有時把行尾空白變成 `&#x20;` / `&nbsp;`，整行不再符合 INVOCATION_LINE_RE（`&` 非空白）。
 */
function normalizeInvocationSourceText(text: string): string {
  return text
    .replace(/&#x20;/gi, " ")
    .replace(/&#32;/gi, " ")
    .replace(/&nbsp;/gi, " ");
}

function unquoteToken(token: string): string {
  if (token.length < 2) return token;
  const first = token[0]!;
  const last = token[token.length - 1]!;
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    const inner = token.slice(1, -1);
    // v0: 只做最小反斜線解除（保留原始字元語意；更完整的 escape 規則在未來擴充）。
    return inner.replace(/\\(["'\\])/g, "$1");
  }
  return token;
}

export function parseSkillInvocations(text: string): SkillInvocation[] {
  const MAX_INVOCATIONS = 8;
  const MAX_ARGS_PER_INVOCATION = 16;
  const MAX_TOKEN_LENGTH = 256;

  if (!text || typeof text !== "string") return [];

  const lines = normalizeInvocationSourceText(text).split(/\r?\n/);
  const out: SkillInvocation[] = [];

  for (const line of lines) {
    if (out.length >= MAX_INVOCATIONS) break;
    const match = line.match(INVOCATION_LINE_RE);
    if (!match) continue;

    const rawName = match[1] ?? "";
    const name = normalizeSkillName(rawName);
    if (!name) continue;

    const argsStr = match[2];
    const tokens = (argsStr ? (argsStr.match(ARG_TOKEN_RE) ?? []) : []).map(unquoteToken);
    const args = tokens
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .slice(0, MAX_ARGS_PER_INVOCATION)
      .filter((t) => t.length <= MAX_TOKEN_LENGTH);

    out.push({
      name,
      args,
      raw: line.trim(),
    });
  }

  return out;
}

