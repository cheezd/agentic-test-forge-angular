import { toolVersion } from "../version.js";

export type ReportStatus = "pass" | "fail" | "error";

export type CheckReport = {
  tool: string;
  version: string;
  status: ReportStatus;
  summary: string;
  base: string | null;
  paths: string[];
  errors: string[];
  toJson(): string;
};

export function createCheckReport(
  tool: string,
  status: ReportStatus,
  baseRef: string | null,
  paths: readonly string[],
  errors: readonly string[],
): CheckReport {
  const summary = summarize(status, errors);
  return {
    tool,
    version: toolVersion,
    status,
    summary,
    base: baseRef,
    paths: [...paths],
    errors: [...errors],
    toJson() {
      return JSON.stringify(
        {
          tool,
          version: toolVersion,
          status,
          summary,
          scope: {
            base: baseRef,
            paths: [...paths],
          },
          gates_run: [],
          gate_policies: {},
          errors: [...errors],
          reports: {},
        },
        null,
        2,
      );
    },
  };
}

function summarize(status: ReportStatus, errors: readonly string[]): string {
  if (status === "error") {
    return errors[0] ?? "Quality gate stopped with a tool error.";
  }
  if (status === "fail") {
    return "Quality gate failed.";
  }
  return "All hard gates that ran passed (none).";
}
