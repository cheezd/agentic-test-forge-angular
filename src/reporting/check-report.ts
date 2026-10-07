import { toolVersion } from "../version.js";
import { resolveStatus, type GateStatus, type ReportStatus } from "./gate-status.js";

export type { ReportStatus };

export type GateReport = {
  name: string;
  status: GateStatus;
  policy: string;
  uncovered: { filepath: string; line: number }[];
};

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
  baseRef: string | null,
  paths: readonly string[],
  errors: readonly string[],
  gates: readonly GateReport[] = [],
): CheckReport {
  const status = resolveStatus(gates, errors);
  const summary = summarize(status, errors, gates);
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
          gates_run: gates.map((gate) => gate.name),
          gate_policies: Object.fromEntries(gates.map((gate) => [gate.name, gate.policy])),
          errors: [...errors],
          reports: Object.fromEntries(
            gates.map((gate) => [
              gate.name,
              { status: gate.status, uncovered: gate.uncovered },
            ]),
          ),
        },
        null,
        2,
      );
    },
  };
}

function summarize(
  status: ReportStatus,
  errors: readonly string[],
  gates: readonly GateReport[],
): string {
  if (status === "error") {
    return errors[0] ?? "Quality gate stopped with a tool error.";
  }
  if (status === "fail") {
    const failed = gates.filter((gate) => gate.status === "fail").map((gate) => gate.name);
    return `Quality gate failed: ${failed.join(", ")}.`;
  }
  const passed = gates.filter((gate) => gate.status === "pass").map((gate) => gate.name);
  const list = passed.length === 0 ? "none" : passed.join(", ");
  return `All hard gates that ran passed (${list}).`;
}
