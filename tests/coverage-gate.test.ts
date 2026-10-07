import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "../src/cli/run.js";
import { parseUnifiedDiff, sourceLines } from "../src/coverage/changed-lines.js";
import { resolveStatus } from "../src/reporting/gate-status.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("coverage gate", () => {
  it("fails when a changed line has no hits", () => {
    const root = fixture();
    const io = capture(root);

    const code = run(["check", "--base", "HEAD~1", "--json", path.join(root, "report.json")], io, {
      coverage: () => ({ lcov: lcov("src/app/kept.ts", 1, 0), error: null }),
      ...passingMutation,
    });

    expect(code).toBe(1);
    expect(io.out).toContain("check: fail");
    const report = JSON.parse(readFileSync(path.join(root, "report.json"), "utf8")) as {
      status: string;
      gates_run: string[];
      reports: { coverage: { status: string; uncovered: { filepath: string; line: number }[] } };
    };
    expect(report.status).toBe("fail");
    expect(report.gates_run).toEqual(["coverage", "crap", "mutation"]);
    expect(report.reports.coverage.uncovered).toEqual([{ filepath: "src/app/kept.ts", line: 1 }]);
  });

  it("passes when every changed executable line is covered", () => {
    const root = fixture();
    const io = capture(root);

    const code = run(["check", "--base", "HEAD~1"], io, {
      coverage: () => ({ lcov: lcov("src/app/kept.ts", 1, 1), error: null }),
      ...passingMutation,
    });

    expect(code).toBe(0);
    expect(io.out).toContain("check: pass");
  });

  it("exits 2 when coverage cannot be produced", () => {
    const root = fixture();
    const io = capture(root);

    const code = run(["check", "--base", "HEAD~1", "--json", path.join(root, "report.json")], io, {
      coverage: () => ({ lcov: null, error: "coverage could not be produced." }),
      ...passingMutation,
    });

    expect(code).toBe(2);
    expect(io.out).toContain("check: error");
    const report = JSON.parse(readFileSync(path.join(root, "report.json"), "utf8")) as { status: string };
    expect(report.status).toBe("error");
  });

  it("lets a coverage tool error outrank a later gate failure", () => {
    expect(
      resolveStatus(
        [
          { status: "error" },
          { status: "fail" },
        ],
        ["coverage could not be produced."],
      ),
    ).toBe("error");
  });

  it("ignores template files in the diff", () => {
    const lines = sourceLines(
      parseUnifiedDiff(`diff --git a/src/app/widget.html b/src/app/widget.html
+++ b/src/app/widget.html
@@ -1 +1 @@
-old
+@if (ready) {
diff --git a/src/app/kept.ts b/src/app/kept.ts
+++ b/src/app/kept.ts
@@ -1 +1 @@
-export const kept = 1;
+export const kept = 2;
`),
      ["src/app"],
    );

    expect(lines.map((line) => line.filepath)).toEqual(["src/app/kept.ts"]);
  });
});

function fixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), "forge-coverage-"));
  roots.push(root);
  write(root, "forge.json", JSON.stringify({ paths: ["src/app"], test_project: "app" }));
  git(root, ["init", "-b", "main"]);
  write(root, "src/app/kept.ts", "export const kept = 1;\n");
  commit(root, "base");
  write(root, "src/app/kept.ts", "export const kept = 2;\n");
  commit(root, "change");
  return root;
}

function lcov(filepath: string, line: number, hits: number): string {
  return `SF:${filepath}\nDA:${line},${hits}\nend_of_record\n`;
}

const passingMutation = {
  mutation: () => ({
    files: [{ filepath: "src/app/kept.ts", killed: 1, survived: 0, inconclusive: 0 }],
    error: null,
  }),
};

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
