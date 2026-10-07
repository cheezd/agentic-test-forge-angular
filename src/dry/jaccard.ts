import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import * as ts from "typescript";

export const jaccardThreshold = 0.82;
export const minLines = 4;
export const minNodes = 20;

export type DryFinding = {
  advisory: true;
  sonar_issue_key: string | null;
  filepath: string | null;
  qualified_name: string | null;
  duplicate_filepath: string | null;
  duplicate_of: string | null;
  source: string | null;
  similarity_score: number | null;
};

type MethodUnit = {
  qualifiedName: string;
  filepath: string;
  lines: number;
  nodes: number;
  fingerprints: Set<string>;
};

export function jaccardFindings(repoRoot: string, roots: readonly string[]): DryFinding[] {
  const units: MethodUnit[] = [];
  for (const filepath of sourceFiles(repoRoot, roots)) {
    const source = readFileSync(path.join(repoRoot, filepath), "utf8");
    units.push(...methodsIn(source, filepath));
  }
  return scoreUnits(units);
}

export function scoreUnits(units: readonly MethodUnit[]): DryFinding[] {
  const eligible = units.filter((unit) => unit.lines >= minLines && unit.nodes >= minNodes);
  const findings: DryFinding[] = [];
  for (let left = 0; left < eligible.length; left += 1) {
    for (let right = left + 1; right < eligible.length; right += 1) {
      const first = eligible[left];
      const second = eligible[right];
      if (first === undefined || second === undefined) {
        continue;
      }
      const finding = pair(first, second);
      if (finding !== null) {
        findings.push(finding);
      }
    }
  }
  return findings.sort((left, right) => {
    const similarity = (right.similarity_score ?? 0) - (left.similarity_score ?? 0);
    if (similarity !== 0) {
      return similarity;
    }
    const file = (left.filepath ?? "").localeCompare(right.filepath ?? "");
    if (file !== 0) {
      return file;
    }
    return (left.qualified_name ?? "").localeCompare(right.qualified_name ?? "");
  });
}

function methodsIn(source: string, filepath: string): MethodUnit[] {
  const script = filepath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(filepath, source, ts.ScriptTarget.Latest, true, script);
  const units: MethodUnit[] = [];
  const visit = (node: ts.Node) => {
    const body = bodyOf(node);
    if (body !== null) {
      const start = file.getLineAndCharacterOfPosition(node.getStart(file)).line;
      const end = file.getLineAndCharacterOfPosition(node.getEnd()).line;
      const fingerprints = new Set<string>();
      let nodes = 0;
      const walk = (current: ts.Node) => {
        nodes += 1;
        fingerprints.add(dump(current));
        ts.forEachChild(current, walk);
      };
      walk(body);
      units.push({
        qualifiedName: qualifiedName(node),
        filepath,
        lines: end - start + 1,
        nodes,
        fingerprints,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return units;
}

function bodyOf(node: ts.Node): ts.Node | null {
  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node)) {
    return node.body ?? null;
  }
  if (ts.isArrowFunction(node)) {
    return node.body;
  }
  return null;
}

function qualifiedName(node: ts.Node): string {
  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
    return ts.isIdentifier(node.name) ? node.name.text : "function";
  }
  if (ts.isConstructorDeclaration(node)) {
    return "constructor";
  }
  if (ts.isArrowFunction(node) && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
    return node.parent.name.text;
  }
  return "function";
}

function dump(node: ts.Node): string {
  const parts = [ts.SyntaxKind[node.kind] ?? "node"];
  if (ts.isIdentifier(node)) {
    parts.push("_");
  } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    parts.push("_str_");
  } else if (ts.isNumericLiteral(node)) {
    parts.push("0");
  }
  ts.forEachChild(node, (child) => parts.push(dump(child)));
  return parts.join(" ");
}

function pair(left: MethodUnit, right: MethodUnit): DryFinding | null {
  const score = jaccard(left.fingerprints, right.fingerprints);
  if (score < jaccardThreshold) {
    return null;
  }
  const ordered = order(left, right);
  return {
    advisory: true,
    sonar_issue_key: null,
    filepath: ordered.left.filepath,
    qualified_name: ordered.left.qualifiedName,
    duplicate_filepath: ordered.right.filepath,
    duplicate_of: ordered.right.qualifiedName,
    source: "jaccard",
    similarity_score: Math.round(score * 100) / 100,
  };
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) {
    return 1;
  }
  let intersection = 0;
  for (const item of left) {
    if (right.has(item)) {
      intersection += 1;
    }
  }
  const union = left.size + right.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

function order(left: MethodUnit, right: MethodUnit): { left: MethodUnit; right: MethodUnit } {
  const leftKey = `${left.filepath}\n${left.qualifiedName}`;
  const rightKey = `${right.filepath}\n${right.qualifiedName}`;
  return leftKey <= rightKey ? { left, right } : { left: right, right: left };
}

function sourceFiles(repoRoot: string, roots: readonly string[]): string[] {
  const files: string[] = [];
  const starts = roots.length === 0 ? ["."] : roots;
  for (const root of starts) {
    walk(path.resolve(repoRoot, root), repoRoot, files);
  }
  return files;
}

function walk(directory: string, repoRoot: string, files: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist" || entry === ".git") {
      continue;
    }
    const full = path.join(directory, entry);
    let info;
    try {
      info = statSync(full);
    } catch {
      continue;
    }
    if (info.isDirectory()) {
      walk(full, repoRoot, files);
      continue;
    }
    if (!/\.(ts|tsx)$/i.test(entry) || entry.endsWith(".d.ts") || /\.(spec|test)\.(ts|tsx)$/i.test(entry)) {
      continue;
    }
    files.push(path.relative(repoRoot, full).replaceAll("\\", "/"));
  }
}
