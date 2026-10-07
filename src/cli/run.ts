import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gitChangedSourceLines } from "../coverage/changed-lines.js";
import { scoreChangedLines } from "../coverage/score.js";
import { coverageMissing, runVitestCoverage, type CoverageRun } from "../coverage/vitest-coverage.js";
import { exitCodeFor } from "../exit-codes.js";
import { loadForgeConfig } from "../config/load-forge-config.js";
import { createCheckReport, type GateReport, type ReportStatus } from "../reporting/check-report.js";
import { limitToDiff } from "../scope/git-diff.js";
import { renderHelp } from "./help.js";
import { parseArgs } from "./parse-args.js";
import { isKnownVerb, requiresTestProject, verbs } from "./verbs.js";

export type RunIo = {
  cwd: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
};

export type RunOptions = {
  coverage?: (repoRoot: string, files: readonly string[]) => CoverageRun;
};

export function run(args: readonly string[], io: RunIo, options: RunOptions = {}): number {
  const parsed = parseArgs(args);
  if (parsed.help) {
    io.stdout(renderHelp());
    return exitCodeFor("pass");
  }

  if (parsed.error !== null) {
    io.stderr(`${parsed.error}\n`);
    return exitCodeFor("error");
  }

  if (parsed.verb === null || !isKnownVerb(parsed.verb)) {
    io.stderr(`Unknown command '${parsed.verb}'.\n`);
    io.stdout(renderHelp());
    return exitCodeFor("error");
  }

  const loaded = loadForgeConfig(io.cwd);
  const paths = parsed.paths.length > 0 ? parsed.paths : (loaded.config?.paths ?? []);
  const errors: string[] = [];
  const gates: GateReport[] = [];

  if (loaded.error !== null) {
    errors.push(loaded.error);
  } else if (loaded.config !== null && requiresTestProject(parsed.verb) && loaded.config.testProject === null) {
    errors.push("test_project is missing from forge.json.");
  } else if (parsed.baseRef !== null && loaded.repoRoot !== null) {
    const scoped = limitToDiff(loaded.repoRoot, parsed.baseRef, paths);
    if (scoped.error !== null) {
      errors.push(scoped.error);
    } else if (parsed.verb === verbs.check) {
      const coverageGate = evaluateCoverage(loaded.repoRoot, parsed.baseRef, paths, options.coverage);
      if (coverageGate.error !== null) {
        errors.push(coverageGate.error);
      }
      gates.push(coverageGate.gate);
    }
  }

  let report = createCheckReport(parsed.verb, parsed.baseRef, paths, errors, gates);

  if (parsed.jsonPath !== null) {
    const writeError = tryWriteReport(parsed.jsonPath, report.toJson());
    if (writeError !== null) {
      errors.push(writeError);
      report = createCheckReport(parsed.verb, parsed.baseRef, paths, errors, gates);
    }
  }

  for (const error of errors) {
    io.stderr(`${error}\n`);
  }

  const printed: ReportStatus = errors.length > 0 ? "error" : report.status;
  io.stdout(`${parsed.verb}: ${printed}\n`);
  return exitCodeFor(printed);
}

function evaluateCoverage(
  repoRoot: string,
  baseRef: string,
  paths: readonly string[],
  coverage: RunOptions["coverage"],
): { gate: GateReport; error: string | null } {
  const changed = gitChangedSourceLines(repoRoot, baseRef, paths);
  if (changed.error !== null || changed.lines === null) {
    return {
      gate: coverageGate("error", []),
      error: changed.error ?? coverageMissing,
    };
  }
  if (changed.lines.length === 0) {
    return { gate: coverageGate("pass", []), error: null };
  }

  const files = [...new Set(changed.lines.map((line) => line.filepath))];
  const produced = (coverage ?? runVitestCoverage)(repoRoot, files);
  if (produced.error !== null || produced.lcov === null) {
    return {
      gate: coverageGate("error", []),
      error: produced.error ?? coverageMissing,
    };
  }

  const uncovered = scoreChangedLines(changed.lines, produced.lcov, repoRoot);
  return {
    gate: coverageGate(uncovered.length > 0 ? "fail" : "pass", uncovered),
    error: null,
  };
}

function coverageGate(status: GateReport["status"], uncovered: GateReport["uncovered"]): GateReport {
  return { name: "coverage", status, policy: "hard", uncovered };
}

function tryWriteReport(filePath: string, json: string): string | null {
  try {
    const destination = path.resolve(filePath);
    const directory = path.dirname(destination);
    mkdirSync(directory, { recursive: true });
    writeFileSync(destination, json);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Could not write the JSON report to '${filePath}': ${message}`;
  }
}
