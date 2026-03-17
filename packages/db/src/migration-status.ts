import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { inspectMigrations } from "./client.js";
import { resolveMigrationConnection } from "./migration-runtime.js";

/** 與 migrate.ts 一致：從 cwd 或上層目錄載入 .env 的 DATABASE_URL，使 preflight 與 server 使用同一 DB。 */
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

const jsonMode = process.argv.includes("--json");

async function main(): Promise<void> {
  const connection = await resolveMigrationConnection();

  try {
    const state = await inspectMigrations(connection.connectionString);
    const payload =
      state.status === "upToDate"
        ? {
            source: connection.source,
            status: "upToDate" as const,
            tableCount: state.tableCount,
            pendingMigrations: [] as string[],
          }
        : {
            source: connection.source,
            status: "needsMigrations" as const,
            tableCount: state.tableCount,
            pendingMigrations: state.pendingMigrations,
            reason: state.reason,
          };

    if (jsonMode) {
      console.log(JSON.stringify(payload));
      return;
    }

    if (payload.status === "upToDate") {
      console.log(`Database is up to date via ${payload.source}`);
      return;
    }

    console.log(
      `Pending migrations via ${payload.source}: ${payload.pendingMigrations.join(", ")}`,
    );
  } finally {
    await connection.stop();
  }
}

await main();
