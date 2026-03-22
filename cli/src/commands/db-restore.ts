import { existsSync } from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { runDatabaseRestore } from "@paperclipai/db";
import { resolveConnectionString } from "./db-backup.js";
import { expandHomePrefix } from "../config/home.js";
import { resolveConfigPath } from "../config/store.js";
import { printPaperclipCliBanner } from "../utils/banner.js";

export type DbRestoreOptions = {
  config?: string;
  file?: string;
  /** 對應 CLI `--i-know-this-overwrites-data` */
  acceptDataLoss?: boolean;
  json?: boolean;
};

export async function dbRestoreCommand(opts: DbRestoreOptions): Promise<void> {
  const backupFile = opts.file?.trim();
  if (!backupFile) {
    throw new Error("Missing --file <path> to a .sql backup.");
  }
  const resolvedPath = path.resolve(expandHomePrefix(backupFile));
  if (!existsSync(resolvedPath)) {
    throw new Error(`Backup file not found: ${resolvedPath}`);
  }
  if (!opts.acceptDataLoss) {
    throw new Error(
      "Refusing to restore without explicit confirmation. Re-run with --i-know-this-overwrites-data (overwrites the target database).",
    );
  }

  printPaperclipCliBanner();
  p.intro(pc.bgCyan(pc.black(" paperclip db:restore ")));

  const configPath = resolveConfigPath(opts.config);
  const connection = resolveConnectionString(opts.config);

  p.log.message(pc.dim(`Config: ${configPath}`));
  p.log.message(pc.dim(`Connection source: ${connection.source}`));
  p.log.message(pc.dim(`Backup file: ${resolvedPath}`));
  p.log.message(pc.red("Target database will be overwritten by the backup contents."));

  const spinner = p.spinner();
  spinner.start("Restoring database...");
  try {
    await runDatabaseRestore({
      connectionString: connection.value,
      backupFile: resolvedPath,
    });
    spinner.stop(pc.green("Restore completed."));
    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            backupFile: resolvedPath,
            connectionSource: connection.source,
          },
          null,
          2,
        ),
      );
    }
    p.outro(
      pc.green(
        "Done. If the app version is newer than the backup, run: pnpm db:migrate",
      ),
    );
  } catch (err) {
    spinner.stop(pc.red("Restore failed."));
    throw err;
  }
}
