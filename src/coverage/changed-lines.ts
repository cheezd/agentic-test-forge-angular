import { spawnSync } from "node:child_process";
import { isUnder, normalize } from "../scope/repo-paths.js";

export type ChangedSourceLine = {
  filepath: string;
  line: number;
  text: string;
};

export function parseUnifiedDiff(diff: string): ChangedSourceLine[] {
  const lines: ChangedSourceLine[] = [];
  let filepath: string | null = null;
  let newLine = 0;
  let inHunk = false;

  for (const raw of diff.split(/\r?\n/)) {
    if (raw.startsWith("diff --git ")) {
      filepath = gitPath(raw);
      inHunk = false;
      continue;
    }
    if (raw.startsWith("+++ ")) {
      const next = raw.slice(4).trim();
      filepath = next === "/dev/null" ? null : stripPrefix(next);
      continue;
    }

    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(raw);
    if (hunk !== null) {
      newLine = Number(hunk[1]);
      inHunk = hunk[2] !== "0";
      continue;
    }
    if (!inHunk || filepath === null) {
      continue;
    }
    if (raw.startsWith("+")) {
      lines.push({ filepath: normalize(filepath), line: newLine, text: raw.slice(1) });
      newLine += 1;
      continue;
    }
    if (raw.startsWith("-") || raw.startsWith("\\")) {
      continue;
    }
    newLine += 1;
  }

  return lines;
}

export function sourceLines(lines: readonly ChangedSourceLine[], roots: readonly string[]): ChangedSourceLine[] {
  return lines.filter((line) => isSourceFile(line.filepath) && isUnderAny(line.filepath, roots));
}

export function gitChangedSourceLines(
  repoRoot: string,
  baseRef: string,
  roots: readonly string[],
): { lines: ChangedSourceLine[] | null; error: string | null } {
  if (baseRef.trim().length === 0 || baseRef.includes("\n") || baseRef.includes("\r")) {
    return { lines: null, error: `git diff failed for base ref '${baseRef}'.` };
  }

  const result = spawnSync("git", ["diff", "-U0", `${baseRef}...HEAD`], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { lines: null, error: "git executable was not found." };
    }
    return { lines: null, error: `git diff failed for base ref '${baseRef}': ${result.error.message}` };
  }
  if (result.status !== 0) {
    const detail = firstLine(result.stderr ?? "") || "git diff failed.";
    return { lines: null, error: `git diff failed for base ref '${baseRef}': ${detail}` };
  }

  return { lines: sourceLines(parseUnifiedDiff(result.stdout ?? ""), roots), error: null };
}

function isSourceFile(filepath: string): boolean {
  if (filepath.endsWith(".d.ts")) {
    return false;
  }
  if (!/\.(ts|tsx)$/i.test(filepath)) {
    return false;
  }
  return !/\.(spec|test)\.(ts|tsx)$/i.test(filepath);
}

function isUnderAny(filepath: string, roots: readonly string[]): boolean {
  return roots.length === 0 || roots.some((root) => isUnder(filepath, root));
}

function gitPath(header: string): string | null {
  const match = / b\/(.+)$/.exec(header);
  return match?.[1] === undefined ? null : match[1];
}

function stripPrefix(pathText: string): string {
  return pathText.startsWith("b/") ? pathText.slice(2) : pathText;
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
