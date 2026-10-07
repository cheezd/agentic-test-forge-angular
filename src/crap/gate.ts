import { readFileSync } from "node:fs";
import path from "node:path";
import type { ChangedSourceLine } from "../coverage/changed-lines.js";
import { parseLcov } from "../coverage/lcov.js";
import { functionsInSource } from "./complexity.js";
import { crapScore, isAboveCeiling } from "./score.js";

export type CrapFinding = {
  qualified_name: string;
  filepath: string;
  complexity: number;
  coverage: number;
  crap_score: number;
  above_threshold: boolean;
};

export const complexityMissing = "complexity or coverage could not be produced.";

export function scoreCrap(
  repoRoot: string,
  lines: readonly ChangedSourceLine[],
  lcov: string,
  ceiling: number,
): { findings: CrapFinding[]; failed: boolean; error: string | null } {
  const coverage = parseLcov(lcov, repoRoot);
  const byFile = new Map<string, number[]>();
  for (const line of lines) {
    const current = byFile.get(line.filepath) ?? [];
    current.push(line.line);
    byFile.set(line.filepath, current);
  }

  const findings: CrapFinding[] = [];
  for (const [filepath, changed] of byFile) {
    let source: string;
    try {
      source = readFileSync(path.join(repoRoot, filepath), "utf8");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { findings: [], failed: false, error: `${complexityMissing} ${message}` };
    }

    for (const fn of functionsInSource(source, filepath)) {
      if (!changed.some((line) => line >= fn.startLine && line <= fn.endLine)) {
        continue;
      }
      const hits = coverage.get(filepath);
      const fraction = coverageFraction(hits, fn.startLine, fn.endLine);
      const score = crapScore(fn.complexity, fraction);
      findings.push({
        qualified_name: fn.qualifiedName,
        filepath,
        complexity: fn.complexity,
        coverage: fraction,
        crap_score: score,
        above_threshold: isAboveCeiling(score, ceiling),
      });
    }
  }

  return { findings, failed: findings.some((finding) => finding.above_threshold), error: null };
}

function coverageFraction(hits: Map<number, number> | undefined, start: number, end: number): number {
  if (hits === undefined) {
    return 0;
  }
  let instrumented = 0;
  let covered = 0;
  for (let line = start; line <= end; line += 1) {
    const count = hits.get(line);
    if (count === undefined) {
      continue;
    }
    instrumented += 1;
    if (count > 0) {
      covered += 1;
    }
  }
  if (instrumented === 0) {
    return 0;
  }
  return covered / instrumented;
}
