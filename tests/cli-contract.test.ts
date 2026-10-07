import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli/parse-args.js";
import { run } from "../src/cli/run.js";
import { exitCodeFor } from "../src/exit-codes.js";
import {
  defaultCrapThreshold,
  defaultDrySources,
  defaultGherkinThreshold,
  defaultMutationThreshold,
} from "../src/config/forge-config.js";
import { loadForgeConfig } from "../src/config/load-forge-config.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("parseArgs", () => {
  it("prints help when no command is given", () => {
    expect(parseArgs([]).help).toBe(true);
    expect(parseArgs(["--help"]).help).toBe(true);
  });

  it("rejects a threshold on check", () => {
    const parsed = parseArgs(["check", "--threshold", "10"]);
    expect(parsed.error).toBe("--threshold applies to crap, mutate, and mutate-gherkin.");
  });

  it("keeps repeated paths and a mutate threshold", () => {
    const parsed = parseArgs(["mutate", "--path", "src/app", "--path", "src/lib", "--threshold", "90"]);
    expect(parsed.error).toBeNull();
    expect(parsed.paths).toEqual(["src/app", "src/lib"]);
    expect(parsed.threshold).toBe(90);
  });
});

describe("loadForgeConfig", () => {
  it("defaults omitted thresholds and dry sources", () => {
    const root = tempRoot();
    write(root, "forge.json", JSON.stringify({ paths: ["src/app"], test_project: "app" }));

    const loaded = loadForgeConfig(root);

    expect(loaded.error).toBeNull();
    expect(loaded.config?.crapThreshold).toBe(defaultCrapThreshold);
    expect(loaded.config?.mutationThreshold).toBe(defaultMutationThreshold);
    expect(loaded.config?.gherkinThreshold).toBe(defaultGherkinThreshold);
    expect(loaded.config?.crapThreshold).toBe(30);
    expect(loaded.config?.mutationThreshold).toBe(80);
    expect(loaded.config?.gherkinThreshold).toBe(80);
    expect(loaded.config?.drySources).toEqual([...defaultDrySources]);
    expect(loaded.config?.acceptanceProject).toBeNull();
  });

  it("keeps an empty dry source list and drops blanks", () => {
    const root = tempRoot();
    write(root, "forge.json", JSON.stringify({ dry_sources: ["sonar", "jaccard", " "] }));
    expect(loadForgeConfig(root).config?.drySources).toEqual(["sonar", "jaccard"]);

    write(root, "forge.json", JSON.stringify({ dry_sources: [] }));
    expect(loadForgeConfig(root).config?.drySources).toEqual([]);
  });

  it("finds forge.json in a parent directory", () => {
    const root = tempRoot();
    write(root, "forge.json", JSON.stringify({ test_project: "app" }));
    const nested = path.join(root, "src", "app");

    const loaded = loadForgeConfig(nested);

    expect(loaded.error).toBeNull();
    expect(loaded.repoRoot).toBe(root);
  });

  it("reports a missing file and invalid JSON", () => {
    const root = tempRoot();
    expect(loadForgeConfig(root).error).toContain("forge.json was not found");

    write(root, "forge.json", "{");
    expect(loadForgeConfig(root).error).toContain("not valid JSON");
  });

  it("rejects a negative threshold", () => {
    const root = tempRoot();
    write(root, "forge.json", JSON.stringify({ crap_threshold: -1 }));
    expect(loadForgeConfig(root).error).toContain("crap_threshold");
  });
});

describe("run", () => {
  it("exits 0 for help", () => {
    const io = capture();
    expect(run(["--help"], io)).toBe(0);
    expect(io.out).toContain("forge");
    expect(io.out).toContain("check");
    expect(io.out).toContain("mutate-gherkin");
  });

  it("exits 2 for an unknown command", () => {
    const io = capture();
    expect(run(["nope"], io)).toBe(2);
    expect(io.err).toContain("Unknown command 'nope'.");
  });

  it("exits 2 and writes status error when test_project is missing", () => {
    const root = tempRoot();
    write(root, "forge.json", JSON.stringify({ paths: ["src/app"] }));
    const jsonPath = path.join(root, "report.json");
    const io = capture(root);

    const code = run(["check", "--json", jsonPath], io);

    expect(code).toBe(2);
    expect(io.out).toContain("check: error");
    expect(io.err).toContain("test_project is missing from forge.json.");
    const report = JSON.parse(readFileSync(jsonPath, "utf8")) as {
      status: string;
      tool: string;
      version: string;
      summary: string;
      scope: { base: string | null; paths: string[] };
      gates_run: string[];
      gate_policies: object;
      errors: string[];
      reports: object;
    };
    expect(report.status).toBe("error");
    expect(report.tool).toBe("check");
    expect(report.version).toBe("0.1.0");
    expect(report.summary).toContain("test_project is missing");
    expect(report.scope).toEqual({ base: null, paths: ["src/app"] });
    expect(report.gates_run).toEqual([]);
    expect(report.gate_policies).toEqual({});
    expect(report.errors).toEqual(["test_project is missing from forge.json."]);
    expect(report.reports).toEqual({});
  });

  it("exits 0 when the config names a test project and no gate has run", () => {
    const root = tempRoot();
    write(root, "forge.json", JSON.stringify({ test_project: "app" }));
    const io = capture(root);

    expect(run(["check"], io)).toBe(0);
    expect(io.out).toContain("check: pass");
  });

  it("maps pass, fail, and error onto exit codes 0, 1, and 2", () => {
    expect(exitCodeFor("pass")).toBe(0);
    expect(exitCodeFor("fail")).toBe(1);
    expect(exitCodeFor("error")).toBe(2);
  });
});

function tempRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "forge-angular-"));
  roots.push(root);
  return root;
}

function write(root: string, name: string, contents: string): void {
  const destination = path.join(root, name);
  writeFileSync(destination, contents);
}

function capture(cwd = process.cwd()): { cwd: string; out: string; err: string; stdout: (text: string) => void; stderr: (text: string) => void } {
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
