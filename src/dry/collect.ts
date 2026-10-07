import type { DryFinding } from "./jaccard.js";
import { jaccardFindings } from "./jaccard.js";
import { collectSonar } from "./sonar.js";

export type DryCollector = (repoRoot: string, paths: readonly string[]) => DryFinding[] | null;

export function defaultDryCollectors(): Record<string, DryCollector> {
  return {
    sonar: () => collectSonar(),
    jaccard: (repoRoot, paths) => jaccardFindings(repoRoot, paths),
  };
}

export function collectDry(
  repoRoot: string,
  paths: readonly string[],
  sources: readonly string[],
  collectors: Record<string, DryCollector>,
): { ran: boolean; findings: DryFinding[] } {
  let ran = false;
  const findings: DryFinding[] = [];
  for (const source of sources) {
    const collector = collectors[source];
    if (collector === undefined) {
      continue;
    }
    const result = collector(repoRoot, paths);
    if (result === null) {
      continue;
    }
    ran = true;
    findings.push(...result);
  }
  return { ran, findings };
}
