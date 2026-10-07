import * as ts from "typescript";

export type SourceFunction = {
  qualifiedName: string;
  startLine: number;
  endLine: number;
  complexity: number;
};

export function functionsInSource(source: string, filepath: string): SourceFunction[] {
  const script = filepath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(filepath, source, ts.ScriptTarget.Latest, true, script);
  const found: SourceFunction[] = [];

  const visit = (node: ts.Node, className: string | null) => {
    if (ts.isClassDeclaration(node) && node.name !== undefined) {
      for (const member of node.members) {
        visit(member, node.name.text);
      }
      return;
    }

    if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
      found.push(describe(node.name.text, node, file));
      return;
    }

    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
      const name = className === null ? node.name.text : `${className}.${node.name.text}`;
      found.push(describe(name, node, file));
      return;
    }

    if (ts.isConstructorDeclaration(node)) {
      const name = className === null ? "constructor" : `${className}.constructor`;
      found.push(describe(name, node, file));
      return;
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      found.push(describe(node.name.text, node.initializer, file));
    }

    ts.forEachChild(node, (child) => visit(child, className));
  };

  visit(file, null);
  return found;
}

function describe(qualifiedName: string, node: ts.Node, file: ts.SourceFile): SourceFunction {
  const start = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
  const end = file.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
  return { qualifiedName, startLine: start, endLine: end, complexity: complexityOf(node) };
}

function complexityOf(root: ts.Node): number {
  let score = 1;
  const visit = (node: ts.Node) => {
    if (node !== root && isFunctionLike(node)) {
      return;
    }
    if (addsDecision(node)) {
      score += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return score;
}

function isFunctionLike(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node)
  );
}

function addsDecision(node: ts.Node): boolean {
  if (
    ts.isIfStatement(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isCaseClause(node) ||
    ts.isCatchClause(node) ||
    ts.isConditionalExpression(node)
  ) {
    return true;
  }
  return ts.isBinaryExpression(node) && (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || node.operatorToken.kind === ts.SyntaxKind.BarBarToken);
}
