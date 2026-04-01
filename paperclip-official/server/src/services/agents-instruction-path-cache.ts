import fs from "node:fs/promises";

type CacheEntry = {
  path: string;
  mtimeMs: number;
};

const pathCache = new Map<string, CacheEntry>();

/**
 * Wraps upward AGENTS.md discovery: reuse last resolved path when mtime unchanged
 * for the same workspace cwd (reduces repeated stat walks on frequent heartbeats).
 */
export async function resolveAgentsFallbackPathWithMtimeCache(
  workspaceCwd: string,
  findPath: () => Promise<string | null>,
): Promise<string | null> {
  const cached = pathCache.get(workspaceCwd);
  if (cached) {
    try {
      const st = await fs.stat(cached.path);
      if (st.isFile() && st.mtimeMs === cached.mtimeMs) {
        return cached.path;
      }
    } catch {
      pathCache.delete(workspaceCwd);
    }
  }

  const found = await findPath();
  if (!found) {
    pathCache.delete(workspaceCwd);
    return null;
  }
  try {
    const st = await fs.stat(found);
    if (st.isFile()) {
      pathCache.set(workspaceCwd, { path: found, mtimeMs: st.mtimeMs });
    }
  } catch {
    pathCache.delete(workspaceCwd);
  }
  return found;
}
