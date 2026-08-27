#!/usr/bin/env node
// Phase 7 (Controlled Beta Infrastructure Gate 2) — CI lint regression
// gate. Runs eslint fresh, then compares each file's error count against
// scripts/lint-baseline.json (the accepted historical backlog, ~180
// errors as of this gate). Fails only when a file's error count exceeds
// its baseline, or a file with no baseline entry has any errors at all —
// i.e. only on a genuinely NEW error. Never requires fixing the existing
// backlog; a PR that reduces it is fine too, just not required.
//
// Deliberately scoped to errors, not warnings — matching the "lint
// errors" wording this gate exists to catch, not a broader ratchet on
// every eslint finding.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const baselinePath = path.join(repoRoot, "scripts/lint-baseline.json");

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));

let raw;
try {
  raw = execFileSync("npx", ["eslint", ".", "-f", "json"], { cwd: repoRoot, maxBuffer: 1024 * 1024 * 50 }).toString();
} catch (err) {
  // eslint exits non-zero whenever it finds ANY error (expected — the
  // pre-existing backlog guarantees this every run); its JSON report is
  // still on stdout in that case.
  raw = err.stdout ? err.stdout.toString() : "";
  if (!raw) {
    console.error("eslint failed to run at all:");
    console.error(err.stderr ? err.stderr.toString() : err.message);
    process.exit(1);
  }
}

const results = JSON.parse(raw);

let totalErrors = 0;
let totalWarnings = 0;
const regressions = [];

for (const f of results) {
  const rel = path.relative(repoRoot, f.filePath).split(path.sep).join("/");
  totalErrors += f.errorCount;
  totalWarnings += f.warningCount;

  const baselineCount = baseline.perFileErrorCounts[rel] || 0;
  if (f.errorCount > baselineCount) {
    regressions.push({
      file: rel,
      baseline: baselineCount,
      current: f.errorCount,
      newMessages: f.messages.filter(m => m.severity === 2),
    });
  }
}

console.log(`Lint totals — errors: ${totalErrors} (baseline ${baseline.totalErrors}), warnings: ${totalWarnings} (baseline ${baseline.totalWarnings})`);

if (regressions.length === 0) {
  console.log("No new lint errors vs the accepted baseline. Pre-existing backlog is not required to be fixed.");
  process.exit(0);
}

console.error("\nNew lint errors introduced vs the accepted baseline:\n");
for (const r of regressions) {
  console.error(`${r.file} — baseline ${r.baseline}, now ${r.current}`);
  for (const m of r.newMessages) {
    console.error(`  ${m.line}:${m.column}  ${m.ruleId || ""}  ${m.message}`);
  }
}
console.error("\nFix the new error(s) above, or if a message is a genuine false positive, discuss before suppressing it.");
console.error(`(Existing backlog in scripts/lint-baseline.json is unaffected — only NEW errors fail this check.)`);
process.exit(1);
