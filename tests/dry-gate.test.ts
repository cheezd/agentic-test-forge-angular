import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "../src/cli/run.js";
import { jaccardFindings } from "../src/dry/jaccard.js";
import { collectSonar, readSonarSettings } from "../src/dry/sonar.js";

const roots: string[] = [];

const method = `export function copy(n: number): number {
  let total = 0;
  if (n > 1) {
    total += 1;
  }
  if (n > 2) {
    total += 2;
  }
  for (let i = 0; i < n; i++) {
    if (total > 3 && n > 4) {
      total += i;
    } else {
      total -= 1;
    }
  }
  return total;
}
`;

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("dry gate", () => {
  it("does not turn a passing check into a failure when methods match", () => {
    const root = repo();
    const io = capture(root);

    const code = run(["check", "--base", "HEAD~1"], io, {
      coverage: () => ({ lcov: covered(method), error: null }),
      mutation: () => ({
        files: [{ filepath: "src/app/left.ts", killed: 1, survived: 0, inconclusive: 0 }],
        error: null,
      }),
    });

    expect(code).toBe(0);
    expect(io.out).toContain("check: pass");
  });

  it("reports the jaccard pair and a sonar issue key", () => {
    const root = repo();
    const io = capture(root);

    const code = run(["dry", "--json", path.join(root, "report.json")], io, {
      dryCollectors: {
        sonar: () => [
          {
            advisory: true,
            sonar_issue_key: "AX123",
            filepath: "src/app/left.ts",
            qualified_name: null,
            duplicate_filepath: null,
            duplicate_of: null,
            source: "sonar",
            similarity_score: null,
          },
        ],
        jaccard: jaccardFindings,
      },
    });

    expect(code).toBe(0);
    const report = JSON.parse(readFileSync(path.join(root, "report.json"), "utf8")) as {
      status: string;
      reports: {
        dry: {
          status: string;
          findings: {
            source: string | null;
            filepath: string | null;
            duplicate_filepath: string | null;
            similarity_score: number | null;
            sonar_issue_key: string | null;
          }[];
        };
      };
    };
    expect(report.status).toBe("pass");
    expect(report.reports.dry.status).toBe("advisory");
    const jaccard = report.reports.dry.findings.find((finding) => finding.source === "jaccard");
    const sonar = report.reports.dry.findings.find((finding) => finding.source === "sonar");
    expect(jaccard?.filepath).toBe("src/app/left.ts");
    expect(jaccard?.duplicate_filepath).toBe("src/app/right.ts");
    expect(jaccard?.similarity_score).toBeGreaterThanOrEqual(0.82);
    expect(sonar?.sonar_issue_key).toBe("AX123");
  });

  it("skips DRY when the selected source cannot run", () => {
    const root = repo(JSON.stringify({ paths: ["src/app"], dry_sources: ["sonar"] }));
    const io = capture(root);

    const code = run(["dry", "--json", path.join(root, "report.json")], io, {
      dryCollectors: {
        sonar: () => collectSonar(() => false, readSonarSettings({})),
      },
    });

    expect(code).toBe(0);
    const report = JSON.parse(readFileSync(path.join(root, "report.json"), "utf8")) as {
      reports: { dry: { status: string } };
    };
    expect(report.reports.dry.status).toBe("skipped");
  });
});

function covered(source: string): string {
  const lines = source.split("\n").length;
  const records = Array.from({ length: lines }, (_, index) => `DA:${index + 1},1`).join("\n");
  return `SF:src/app/left.ts\n${records}\nend_of_record\nSF:src/app/right.ts\n${records}\nend_of_record\n`;
}

function repo(
  forgeJson = JSON.stringify({
    paths: ["src/app"],
    test_project: "app",
    dry_sources: ["jaccard", "sonar"],
  }),
): string {
  const root = mkdtempSync(path.join(tmpdir(), "forge-dry-"));
  roots.push(root);
  write(root, "forge.json", forgeJson);
  write(root, "src/app/left.ts", method);
  write(root, "src/app/right.ts", method.replace("function copy", "function clone"));
  git(root, ["init", "-b", "main"]);
  git(root, ["add", "."]);
  git(root, ["-c", "user.email=forge@example.com", "-c", "user.name=Forge", "commit", "-m", "base"]);
  write(root, "src/app/left.ts", method.replace("return total;", "return total + 0;"));
  git(root, ["add", "."]);
  git(root, ["-c", "user.email=forge@example.com", "-c", "user.name=Forge", "commit", "-m", "change"]);
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
