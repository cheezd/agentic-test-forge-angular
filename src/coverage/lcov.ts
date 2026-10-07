export type LineHits = Map<string, Map<number, number>>;

export function parseLcov(lcov: string, repoRoot: string): LineHits {
  const files: LineHits = new Map();
  let current: string | null = null;

  for (const raw of lcov.split(/\r?\n/)) {
    if (raw.startsWith("SF:")) {
      current = normalizeCoveragePath(raw.slice(3), repoRoot);
      if (!files.has(current)) {
        files.set(current, new Map());
      }
      continue;
    }
    if (current === null) {
      continue;
    }
    if (raw.startsWith("DA:")) {
      const [lineText, hitsText] = raw.slice(3).split(",");
      const line = Number(lineText);
      const hits = Number(hitsText);
      if (Number.isInteger(line) && Number.isFinite(hits)) {
        files.get(current)?.set(line, hits);
      }
    }
  }

  return files;
}

function normalizeCoveragePath(filepath: string, repoRoot: string): string {
  const file = filepath.replaceAll("\\", "/").replace(/^\.\//, "");
  const root = repoRoot.replaceAll("\\", "/").replace(/\/+$/, "");
  const prefix = `${root}/`;
  if (file.toLowerCase().startsWith(prefix.toLowerCase())) {
    return file.slice(prefix.length);
  }
  return file;
}
