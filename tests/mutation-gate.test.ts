import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "../src/cli/run.js";
import { filesFromReport } from "../src/mutation/stryker.js";
import { scoreMutation } from "../src/mutation/score.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("mutation gate", () => {
  it("passes a kill rate equal to the floor and ignores files outside the diff", () => {
    const root = fixture();
    const seen: string[][] = [];
    const io = capture(root);

    const code = run(["mutate", "--base", "HEAD~1", "--json", path.join(root, "report.json")], io, {
      mutation: (_repo, files) => {
        seen.push([...files]);
        return {
          files: [
            { filepath: "src/app/kept.ts", killed: 4, survived: 1, inconclusive: 0 },
            { filepath: "src/other/ignored.ts", killed: 0, survived: 5, inconclusive: 0 },
          ],
          error: null,
        };
      },
    });

    expect(code).toBe(0);
    expect(seen).toEqual([["src/app/kept.ts"]]);
    const report = JSON.parse(readFileSync(path.join(root, "report.json"), "utf8")) as {
      status: string;
      gates_run: string[];
      reports: {
        mutation: {
          findings: { filepath: string; score: number; killed: number; total: number }[];
        };
      };
    };
    expect(report.status).toBe("pass");
    expect(report.gates_run).toEqual(["mutation"]);
    expect(report.reports.mutation.findings).toEqual([
      { filepath: "src/app/kept.ts", score: 80, killed: 4, total: 5, above_threshold: false },
    ]);
  });

  it("fails when the kill rate is under the floor", () => {
    const root = fixture();
    const io = capture(root);

    const code = run(["mutate", "--base", "HEAD~1"], io, {
      mutation: () => ({
        files: [{ filepath: "src/app/kept.ts", killed: 3, survived: 2, inconclusive: 0 }],
        error: null,
      }),
    });

    expect(code).toBe(1);
    expect(io.out).toContain("mutate: fail");
  });

  it("lets --threshold override the configured floor", () => {
    const root = fixture("{ \"paths\": [\"src/app\"], \"test_project\": \"app\", \"mutation_threshold\": 90 }");
    const io = capture(root);

    const code = run(["mutate", "--base", "HEAD~1", "--threshold", "80"], io, {
      mutation: () => ({
        files: [{ filepath: "src/app/kept.ts", killed: 4, survived: 1, inconclusive: 0 }],
        error: null,
      }),
    });

    expect(code).toBe(0);
  });

  it("exits 2 when Stryker cannot produce a score", () => {
    const root = fixture();
    const io = capture(root);

    const code = run(["mutate", "--base", "HEAD~1"], io, {
      mutation: () => ({ files: null, error: "mutation score could not be produced." }),
    });

    expect(code).toBe(2);
    expect(io.out).toContain("mutate: error");
  });

  it("counts only killed and compile-error mutants as killed", () => {
    const files = filesFromReport({
      files: {
        "src/app/kept.ts": {
          mutants: [{ status: "Killed" }, { status: "CompileError" }, { status: "Survived" }, { status: "Timeout" }],
        },
      },
    });

    const scored = scoreMutation(files, ["src/app/kept.ts"], 80);
    expect(scored.findings[0]).toMatchObject({ killed: 2, total: 4, score: 50, above_threshold: true });
    expect(scored.failed).toBe(true);
  });
});

function fixture(forgeJson = JSON.stringify({ paths: ["src/app"], test_project: "app" })): string {
  const root = mkdtempSync(path.join(tmpdir(), "forge-mutation-"));
  roots.push(root);
  write(root, "forge.json", forgeJson);
  git(root, ["init", "-b", "main"]);
  write(root, "src/app/kept.ts", "export const kept = 1;\n");
  write(root, "src/other/ignored.ts", "export const ignored = 1;\n");
  commit(root, "base");
  write(root, "src/app/kept.ts", "export const kept = 2;\n");
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
