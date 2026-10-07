import { normalize } from "../scope/repo-paths.js";

export type MutationFileResult = {
  filepath: string;
  killed: number;
  survived: number;
  inconclusive: number;
};

export type MutationFinding = {
  filepath: string;
  score: number;
  killed: number;
  total: number;
  above_threshold: boolean;
};

export const mutationScoreMissing = "mutation score could not be produced.";

export function scoreMutation(
  files: readonly MutationFileResult[],
  scope: readonly string[],
  floor: number,
): { findings: MutationFinding[]; failed: boolean; error: string | null } {
  const allowed = new Set(scope.map((file) => normalize(file).toLowerCase()));
  const findings: MutationFinding[] = [];
  let inconclusive = 0;

  for (const file of files) {
    const filepath = normalize(file.filepath);
    if (!allowed.has(filepath.toLowerCase())) {
      continue;
    }

    const total = file.killed + file.survived + file.inconclusive;
    if (total === 0) {
      continue;
    }

    const score = (file.killed * 100) / total;
    inconclusive += file.inconclusive;
    findings.push({
      filepath,
      score,
      killed: file.killed,
      total,
      above_threshold: score < floor,
    });
  }

  if (findings.length === 0) {
    return { findings: [], failed: false, error: mutationScoreMissing };
  }

  const failed = inconclusive > 0 || findings.some((finding) => finding.above_threshold);
  return { findings, failed, error: null };
}
