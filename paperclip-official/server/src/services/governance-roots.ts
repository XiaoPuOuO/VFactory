import path from "node:path";
import { fileURLToPath } from "node:url";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PAPERCLIP_OFFICIAL_ROOT = path.resolve(CURRENT_DIR, "../../..");

function normalizeResolvedPath(value: string): string {
  return path.resolve(value);
}

export function getBundledGovernanceWorkspaceCwd(): string {
  return PAPERCLIP_OFFICIAL_ROOT;
}

export function getGovernanceWorkspaceCwds(workspaceCwd: string): string[] {
  const ordered = [getBundledGovernanceWorkspaceCwd(), workspaceCwd];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const candidate of ordered) {
    const resolved = normalizeResolvedPath(candidate);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    out.push(resolved);
  }

  return out;
}
