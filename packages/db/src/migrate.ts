import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { applyPendingMigrations, inspectMigrations } from "./client.js";
import { resolveMigrationConnection } from "./migration-runtime.js";

/** 從 cwd 或上層目錄載入 .env 的 DATABASE_URL，使 migrate 與 server 使用同一 DB（在 repo 根目錄執行 pnpm db:migrate 時）。 */
function loadRepoEnv(): void {
  if (process.env.DATABASE_URL) return;
  let dir = process.cwd();
  while (true) {
    const envPath = path.join(dir, ".env");
    if (existsSync(envPath)) {
      const raw = readFileSync(envPath, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).replace(/^\s*export\s+/, "").trim();
        if (key !== "DATABASE_URL") continue;
        let value = trimmed.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        process.env.DATABASE_URL = value;
        return;
      }
      return;
    }
    const parent = path.resolve(dir, "..");
    if (parent === dir) return;
    dir = parent;
  }
}

loadRepoEnv();

async function main(): Promise<void> {
  const resolved = await resolveMigrationConnection();

  console.log(`Migrating database via ${resolved.source}`);

  try {
    const before = await inspectMigrations(resolved.connectionString);
    if (before.status === "upToDate") {
      console.log("No pending migrations");
      return;
    }

    console.log(`Applying ${before.pendingMigrations.length} pending migration(s)...`);
    await applyPendingMigrations(resolved.connectionString);

    const after = await inspectMigrations(resolved.connectionString);
    if (after.status !== "upToDate") {
      throw new Error(`Migrations incomplete: ${after.pendingMigrations.join(", ")}`);
    }
    console.log("Migrations complete");
  } finally {
    await resolved.stop();
  }
}

await main();
