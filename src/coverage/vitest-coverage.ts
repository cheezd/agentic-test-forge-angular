import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export type CoverageRun = {
  lcov: string | null;
  error: string | null;
};

export const coverageMissing = "coverage could not be produced.";

export function runVitestCoverage(repoRoot: string, files: readonly string[]): CoverageRun {
  if (files.length === 0) {
    return { lcov: "", error: null };
  }

  const reports = mkdtempSync(path.join(tmpdir(), "forge-coverage-"));
  try {
    const command = process.platform === "win32" ? "npx.cmd" : "npx";
    const result = spawnSync(
      command,
      [
        "vitest",
        "related",
        "--run",
        "--coverage",
        "--coverage.reporter=lcov",
        `--coverage.reportsDirectory=${reports}`,
        ...files,
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    if (result.error || result.status !== 0) {
      return { lcov: null, error: coverageError(result.stderr ?? result.error?.message) };
    }

    const lcovPath = path.join(reports, "lcov.info");
    try {
      return { lcov: readFileSync(lcovPath, "utf8"), error: null };
    } catch {
      return { lcov: null, error: coverageMissing };
    }
  } finally {
    rmSync(reports, { recursive: true, force: true });
  }
}

function coverageError(detail: string | undefined): string {
  const line = firstLine(detail ?? "");
  return line.length === 0 ? coverageMissing : `${coverageMissing} ${line}`;
}

function firstLine(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return "";
}
