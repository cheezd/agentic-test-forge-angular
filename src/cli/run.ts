import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { exitCodeFor } from "../exit-codes.js";
import { loadForgeConfig } from "../config/load-forge-config.js";
import { createCheckReport, type ReportStatus } from "../reporting/check-report.js";
import { limitToDiff } from "../scope/git-diff.js";
import { renderHelp } from "./help.js";
import { parseArgs } from "./parse-args.js";
import { isKnownVerb, requiresTestProject } from "./verbs.js";

export type RunIo = {
  cwd: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
};

export function run(args: readonly string[], io: RunIo): number {
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
  if (loaded.error !== null) {
    errors.push(loaded.error);
  } else if (loaded.config !== null && requiresTestProject(parsed.verb) && loaded.config.testProject === null) {
    errors.push("test_project is missing from forge.json.");
  } else if (parsed.baseRef !== null && loaded.repoRoot !== null) {
    const scoped = limitToDiff(loaded.repoRoot, parsed.baseRef, paths);
    if (scoped.error !== null) {
      errors.push(scoped.error);
    }
  }

  const status: ReportStatus = errors.length > 0 ? "error" : "pass";
  let report = createCheckReport(parsed.verb, status, parsed.baseRef, paths, errors);

  if (parsed.jsonPath !== null) {
    const writeError = tryWriteReport(parsed.jsonPath, report.toJson());
    if (writeError !== null) {
      errors.push(writeError);
      report = createCheckReport(parsed.verb, "error", parsed.baseRef, paths, errors);
    }
  }

  for (const error of errors) {
    io.stderr(`${error}\n`);
  }

  const printed: ReportStatus = errors.length > 0 ? "error" : report.status;
  io.stdout(`${parsed.verb}: ${printed}\n`);
  return exitCodeFor(printed);
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
