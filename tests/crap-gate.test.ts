import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "../src/cli/run.js";
import { functionsInSource } from "../src/crap/complexity.js";
import { crapScore } from "../src/crap/score.js";

const roots: string[] = [];

const source = `export function kept(n: number): number {
  if (n > 1) return 1;
  if (n > 2) return 2;
  if (n > 3) return 3;
  if (n > 4) return 4;
  if (n > 5) return 5;
  return 0;
}
`;

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("crap gate", () => {
  it("scores a fully uncovered complex function over the ceiling", () => {
    expect(crapScore(5, 0)).toBe(30);
    expect(functionsInSource(source, "src/app/kept.ts")[0]?.complexity).toBe(6);
    expect(crapScore(6, 0)).toBe(42);

    const root = fixture();
    const io = capture(root);
    const code = run(["crap", "--base", "HEAD~1", "--json", path.join(root, "report.json")], io, {
      coverage: () => ({ lcov: "SF:src/app/kept.ts\nDA:2,0\nDA:3,0\nend_of_record\n", error: null }),
    });

    expect(code).toBe(1);
    const report = JSON.parse(readFileSync(path.join(root, "report.json"), "utf8")) as {
      reports: { crap: { findings: { qualified_name: string; filepath: string; complexity: number; coverage: number; crap_score: number }[] } };
    };
    expect(report.reports.crap.findings[0]).toMatchObject({
      qualified_name: "kept",
      filepath: "src/app/kept.ts",
      complexity: 6,
      coverage: 0,
      crap_score: 42,
    });
  });

  it("passes a score equal to the ceiling", () => {
    const root = fixture();
    const io = capture(root);
    const code = run(["crap", "--base", "HEAD~1", "--threshold", "42"], io, {
      coverage: () => ({ lcov: "SF:src/app/kept.ts\nDA:2,0\nend_of_record\n", error: null }),
    });

    expect(code).toBe(0);
    expect(io.out).toContain("crap: pass");
  });

  it("exits 2 when coverage cannot be produced", () => {
    const root = fixture();
    const io = capture(root);
    const code = run(["crap", "--base", "HEAD~1"], io, {
      coverage: () => ({ lcov: null, error: "coverage could not be produced." }),
    });

    expect(code).toBe(2);
    expect(io.out).toContain("crap: error");
  });
});

function fixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), "forge-crap-"));
  roots.push(root);
  write(root, "forge.json", JSON.stringify({ paths: ["src/app"], test_project: "app" }));
  git(root, ["init", "-b", "main"]);
  write(root, "src/app/kept.ts", source);
  commit(root, "base");
  write(root, "src/app/kept.ts", source.replace("return 0;", "return 1;"));
  commit(root, "change");
  return root;
}

function write(root: string, name: string, contents: string): void {
  const destination = path.join(root, name);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
}

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "git failed");
  }
}

function commit(cwd: string, message: string): void {
  git(cwd, ["add", "."]);
  git(cwd, ["-c", "user.email=forge@example.com", "-c", "user.name=Forge", "commit", "-m", message]);
}

function capture(cwd: string): {
  cwd: string;
  out: string;
  err: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
} {
  const io = {
    cwd,
    out: "",
    err: "",
    stdout(text: string) {
      io.out += text;
    },
    stderr(text: string) {
      io.err += text;
    },
  };
  return io;
}
