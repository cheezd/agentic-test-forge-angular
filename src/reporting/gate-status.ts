export type GateStatus = "pass" | "fail" | "error" | "skipped" | "advisory";

export type ReportStatus = "pass" | "fail" | "error";

export function resolveStatus(
  gates: readonly { status: GateStatus }[],
  errors: readonly string[],
): ReportStatus {
  if (errors.length > 0 || gates.some((gate) => gate.status === "error")) {
    return "error";
  }
  if (gates.some((gate) => gate.status === "fail")) {
    return "fail";
  }
  return "pass";
}
