import type { ChangedSourceLine } from "./changed-lines.js";
import { parseLcov } from "./lcov.js";

export type UncoveredLine = {
  filepath: string;
  line: number;
};

export function scoreChangedLines(
  lines: readonly ChangedSourceLine[],
  lcov: string,
  repoRoot: string,
): UncoveredLine[] {
  const coverage = parseLcov(lcov, repoRoot);
  const uncovered: UncoveredLine[] = [];

  for (const line of lines) {
    const hits = coverage.get(line.filepath);
    if (hits === undefined) {
      if (isExecutableText(line.text)) {
        uncovered.push({ filepath: line.filepath, line: line.line });
      }
      continue;
    }

    const hitCount = hits.get(line.line);
    if (hitCount === 0) {
      uncovered.push({ filepath: line.filepath, line: line.line });
    }
  }

  return uncovered;
}

function isExecutableText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return false;
  }
  return !(
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("*/")
  );
}
