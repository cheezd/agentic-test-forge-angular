import type { ReportStatus } from "./reporting/check-report.js";

/** Pass is 0, fail is 1, and error is 2. A tool error outranks a gate failure. */
export const exitCodes = {
  pass: 0,
  fail: 1,
  error: 2,
} as const;

export function exitCodeFor(status: ReportStatus): number {
  switch (status) {
    case "pass":
      return exitCodes.pass;
    case "fail":
      return exitCodes.fail;
    case "error":
      return exitCodes.error;
  }
}
