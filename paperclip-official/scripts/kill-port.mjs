#!/usr/bin/env node
/**
 * 釋放指定埠上佔用的 process（例如前次 server 崩潰後埠殘留）。
 * 用法: node scripts/kill-port.mjs [port]
 * 預設 port: 3100
 * 依賴系統 lsof / kill（macOS / Linux）。
 */
import { execSync } from "node:child_process";

const port = process.argv[2] ? String(process.argv[2]).trim() : "3100";
const portNum = parseInt(port, 10);
if (!Number.isInteger(portNum) || portNum <= 0 || portNum > 65535) {
  console.error(`Invalid port: ${port}`);
  process.exit(1);
}

try {
  const pids = execSync(`lsof -ti :${portNum}`, { encoding: "utf8" })
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (pids.length === 0) {
    console.log(`Port ${portNum} is not in use.`);
    process.exit(0);
  }
  execSync(`kill -9 ${pids.join(" ")}`, { stdio: "inherit" });
  console.log(`Killed process(es) on port ${portNum}: ${pids.join(", ")}`);
} catch (err) {
  // lsof exits 1 when no matching processes
  if (err.status === 1) {
    console.log(`Port ${portNum} is not in use.`);
    process.exit(0);
  }
  console.error(err.message || err);
  process.exit(err.status ?? 1);
}
