import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "../src/cli/run.js";
import { limitToDiff } from "../src/scope/git-diff.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("limitToDiff", () => {
  it("returns changed files under paths and drops the rest", () => {
    const root = tempRoot();
    git(root, ["init", "-b", "main"]);
    write(root, "src/app/kept.ts", "export const kept = 1;\n");
    write(root, "src/other/ignored.ts", "export const ignored = 1;\n");
    commit(root, "base");
    const base = git(root, ["rev-parse", "HEAD"]);

    write(root, "src/app/kept.ts", "export const kept = 2;\n");
    write(root, "src/app/added.ts", "export const added = 1;\n");
    write(root, "src/other/ignored.ts", "export const ignored = 2;\n");
    commit(root, "change");

    const scoped = limitToDiff(root, base, ["src/app"]);

    expect(scoped.error).toBeNull();
    expect(scoped.files?.slice().sort()).toEqual(["src/app/added.ts", "src/app/kept.ts"]);
  });
});

describe("run --base", () => {
  it("exits 2 when git cannot resolve the base ref", () => {
    const root = tempRoot();
    write(root, "forge.json", JSON.stringify({ paths: ["src/app"], test_project: "app" }));
    git(root, ["init", "-b", "main"]);
    const jsonPath = path.join(root, "report.json");
    const io = capture(root);

    const code = run(["check", "--base", "does-not-exist", "--json", jsonPath], io);

    expect(code).toBe(2);
    expect(io.out).toContain("check: error");
    expect(io.err).toContain("git diff failed for base ref 'does-not-exist'");
    const report = JSON.parse(readFileSync(jsonPath, "utf8")) as { status: string };
    expect(report.status).toBe("error");
  });
});

function tempRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "forge-diff-"));
  roots.push(root);
  return root;
}

function write(root: string, name: string, contents: string): void {
  const destination = path.join(root, name);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
}

function git(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "git failed");
  }
  return (result.stdout ?? "").trim();
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
