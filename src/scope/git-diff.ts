import { spawnSync } from "node:child_process";
import { filesUnderPaths } from "./repo-paths.js";

export type ChangedFiles = {
  files: string[] | null;
  error: string | null;
};

export function gitChangedFiles(repoRoot: string, baseRef: string): ChangedFiles {
  if (baseRef.trim().length === 0 || baseRef.includes("\n") || baseRef.includes("\r")) {
    return { files: null, error: `git diff failed for base ref '${baseRef}'.` };
  }

  const result = spawnSync("git", ["diff", "--name-only", `${baseRef}...HEAD`], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { files: null, error: "git executable was not found." };
    }
    return { files: null, error: `git diff failed for base ref '${baseRef}': ${result.error.message}` };
  }

  if (result.status !== 0) {
    const detail = firstLine(result.stderr ?? "") || "git diff failed.";
    return { files: null, error: `git diff failed for base ref '${baseRef}': ${detail}` };
  }

  const files = (result.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return { files, error: null };
}

export function limitToDiff(
  repoRoot: string,
  baseRef: string,
  paths: readonly string[],
  changedFiles: (root: string, base: string) => ChangedFiles = gitChangedFiles,
): ChangedFiles {
  const diff = changedFiles(repoRoot, baseRef);
  if (diff.error !== null || diff.files === null) {
    return { files: null, error: diff.error ?? `git diff failed for base ref '${baseRef}'.` };
  }
  return { files: filesUnderPaths(diff.files, paths), error: null };
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
