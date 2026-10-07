import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { scoreCrap, type CrapFinding } from "../crap/gate.js";
import { gitChangedSourceLines } from "../coverage/changed-lines.js";
import { scoreChangedLines } from "../coverage/score.js";
import { coverageMissing, runVitestCoverage, type CoverageRun } from "../coverage/vitest-coverage.js";
import { exitCodeFor } from "../exit-codes.js";
import { loadForgeConfig } from "../config/load-forge-config.js";
import { mutationScoreMissing, scoreMutation, type MutationFinding } from "../mutation/score.js";
import { runStryker, type MutationRun } from "../mutation/stryker.js";
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
  mutation?: (repoRoot: string, files: readonly string[]) => MutationRun;
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
  } else if ((parsed.verb === verbs.mutate || parsed.verb === verbs.crap) && parsed.baseRef === null) {
    errors.push(`${parsed.verb} requires --base so scores stay on the diff.`);
  } else if (parsed.baseRef !== null && loaded.repoRoot !== null && loaded.config !== null) {
    const scoped = limitToDiff(loaded.repoRoot, parsed.baseRef, paths);
    if (scoped.error !== null) {
      errors.push(scoped.error);
    } else {
      const mutationFloor =
        parsed.verb === verbs.mutate && parsed.threshold !== null
          ? parsed.threshold
          : loaded.config.mutationThreshold;
      const crapCeiling =
        parsed.verb === verbs.crap && parsed.threshold !== null
          ? parsed.threshold
          : loaded.config.crapThreshold;
      if (parsed.verb === verbs.check || parsed.verb === verbs.crap) {
        const coverageAndCrap = evaluateCoverageAndCrap(
          loaded.repoRoot,
          parsed.baseRef,
          paths,
          crapCeiling,
          parsed.verb === verbs.check,
          options.coverage,
        );
        errors.push(...coverageAndCrap.errors);
        gates.push(...coverageAndCrap.gates);
      }
      if (parsed.verb === verbs.check || parsed.verb === verbs.mutate) {
        const mutationGate = evaluateMutation(
          loaded.repoRoot,
          parsed.baseRef,
          paths,
          mutationFloor,
          options.mutation,
        );
        if (mutationGate.error !== null) {
          errors.push(mutationGate.error);
        }
        gates.push(mutationGate.gate);
      }
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

function evaluateCoverageAndCrap(
  repoRoot: string,
  baseRef: string,
  paths: readonly string[],
  ceiling: number,
  includeLineCoverage: boolean,
  coverage: RunOptions["coverage"],
): { gates: GateReport[]; errors: string[] } {
  const changed = gitChangedSourceLines(repoRoot, baseRef, paths);
  if (changed.error !== null || changed.lines === null) {
    const error = changed.error ?? coverageMissing;
    return {
      errors: [error],
      gates: [
        ...(includeLineCoverage ? [coverageGate("error", [])] : []),
        crapGate("error", ceiling, []),
      ],
    };
  }
  if (changed.lines.length === 0) {
    return {
      errors: [],
      gates: [
        ...(includeLineCoverage ? [coverageGate("pass", [])] : []),
        crapGate("pass", ceiling, []),
      ],
    };
  }

  const files = [...new Set(changed.lines.map((line) => line.filepath))];
  const produced = (coverage ?? runVitestCoverage)(repoRoot, files);
  if (produced.error !== null || produced.lcov === null) {
    const error = produced.error ?? coverageMissing;
    return {
      errors: [error],
      gates: [
        ...(includeLineCoverage ? [coverageGate("error", [])] : []),
        crapGate("error", ceiling, []),
      ],
    };
  }

  const gates: GateReport[] = [];
  if (includeLineCoverage) {
    const uncovered = scoreChangedLines(changed.lines, produced.lcov, repoRoot);
    gates.push(coverageGate(uncovered.length > 0 ? "fail" : "pass", uncovered));
  }

  const scored = scoreCrap(repoRoot, changed.lines, produced.lcov, ceiling);
  if (scored.error !== null) {
    return { errors: [scored.error], gates: [...gates, crapGate("error", ceiling, [])] };
  }
  gates.push(crapGate(scored.failed ? "fail" : "pass", ceiling, scored.findings));
  return { gates, errors: [] };
}

function coverageGate(status: GateReport["status"], uncovered: { filepath: string; line: number }[]): GateReport {
  return { name: "coverage", status, policy: "hard", details: { uncovered } };
}

function crapGate(status: GateReport["status"], threshold: number, findings: CrapFinding[]): GateReport {
  return { name: "crap", status, policy: "hard", details: { threshold, findings } };
}

function evaluateMutation(
  repoRoot: string,
  baseRef: string,
  paths: readonly string[],
  floor: number,
  mutation: RunOptions["mutation"],
): { gate: GateReport; error: string | null } {
  const changed = gitChangedSourceLines(repoRoot, baseRef, paths);
  if (changed.error !== null || changed.lines === null) {
    return { gate: mutationGate("error", floor, []), error: changed.error ?? mutationScoreMissing };
  }

  const files = [...new Set(changed.lines.map((line) => line.filepath))];
  if (files.length === 0) {
    return { gate: mutationGate("pass", floor, []), error: null };
  }

  const produced = (mutation ?? runStryker)(repoRoot, files);
  if (produced.error !== null || produced.files === null) {
    return {
      gate: mutationGate("error", floor, []),
      error: produced.error ?? mutationScoreMissing,
    };
  }

  const scored = scoreMutation(produced.files, files, floor);
  if (scored.error !== null) {
    return { gate: mutationGate("error", floor, []), error: scored.error };
  }

  return {
    gate: mutationGate(scored.failed ? "fail" : "pass", floor, scored.findings),
    error: null,
  };
}

function mutationGate(status: GateReport["status"], threshold: number, findings: MutationFinding[]): GateReport {
  return { name: "mutation", status, policy: "hard", details: { threshold, findings } };
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
