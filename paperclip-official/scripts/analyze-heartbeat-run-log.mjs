#!/usr/bin/env node
/**
 * Offline helper: parse a VFactory run log (exported .log) for the token summary line.
 * Usage: node scripts/analyze-heartbeat-run-log.mjs /path/to/run-xxxx.log
 *
 * @see documents/heartbeat-token-cost-optimization.md
 */

import fs from "node:fs";

const p = process.argv[2];
if (!p) {
  console.error("Usage: node analyze-heartbeat-run-log.mjs <run.log>");
  process.exit(1);
}

const text = fs.readFileSync(p, "utf8");
const lines = text.split("\n");

let input = null;
let output = null;
let cacheRead = null;
for (const line of lines.slice(0, 80)) {
  const m = line.match(/Tokens\s*:\s*input=(\d+),\s*output=(\d+)(?:,\s*cacheRead=(\d+))?/);
  if (m) {
    input = Number(m[1]);
    output = Number(m[2]);
    cacheRead = m[3] != null ? Number(m[3]) : null;
    break;
  }
}

const out = { file: p, inputTokens: input, outputTokens: output, cacheReadTokens: cacheRead };
console.log(JSON.stringify(out, null, 2));
