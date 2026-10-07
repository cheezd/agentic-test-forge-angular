import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { mutationScoreMissing, type MutationFileResult } from "./score.js";

export type MutationRun = {
  files: MutationFileResult[] | null;
  error: string | null;
};

type StrykerReport = {
  files?: Record<string, { mutants?: { status?: string }[] }>;
};

export function runStryker(repoRoot: string, files: readonly string[]): MutationRun {
  if (files.length === 0) {
    return { files: [], error: null };
  }

  const directory = mkdtempSync(path.join(tmpdir(), "forge-stryker-"));
  const configPath = path.join(directory, "stryker.config.json");
  const reportPath = path.join(directory, "mutation.json");
  try {
    writeFileSync(
      configPath,
      JSON.stringify({
        testRunner: "vitest",
        mutate: [...files],
        reporters: ["json"],
        jsonReporter: { fileName: reportPath },
        coverageAnalysis: "perTest",
      }),
    );
    const command = process.platform === "win32" ? "npx.cmd" : "npx";
    const result = spawnSync(command, ["stryker", "run", `--configFile=${configPath}`], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    if (result.error || result.status !== 0) {
      return { files: null, error: mutationError(result.stderr ?? result.error?.message) };
    }

    try {
      const report = JSON.parse(readFileSync(reportPath, "utf8")) as StrykerReport;
      return { files: filesFromReport(report), error: null };
    } catch {
      return { files: null, error: mutationScoreMissing };
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function filesFromReport(report: StrykerReport): MutationFileResult[] {
  const files: MutationFileResult[] = [];
  for (const [filepath, entry] of Object.entries(report.files ?? {})) {
    let killed = 0;
    let survived = 0;
    let inconclusive = 0;
    for (const mutant of entry.mutants ?? []) {
      const status = (mutant.status ?? "").toLowerCase();
      if (status === "killed" || status === "compileerror") {
        killed += 1;
      } else if (status === "survived") {
        survived += 1;
      } else if (status.length > 0) {
        inconclusive += 1;
      }
    }
    files.push({ filepath, killed, survived, inconclusive });
  }
  return files;
}

function mutationError(detail: string | undefined): string {
  const line = firstLine(detail ?? "");
  return line.length === 0 ? mutationScoreMissing : `${mutationScoreMissing} ${line}`;
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
