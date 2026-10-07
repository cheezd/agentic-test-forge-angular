export function normalize(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\/+/, "");
}

export function isUnder(relativeFile: string, root: string): boolean {
  const prefix = normalize(root).replace(/\/+$/, "");
  if (prefix.length === 0) {
    return true;
  }

  const file = normalize(relativeFile);
  return file.toLowerCase() === prefix.toLowerCase() || file.toLowerCase().startsWith(`${prefix.toLowerCase()}/`);
}

export function filesUnderPaths(files: readonly string[], roots: readonly string[]): string[] {
  const normalized = files.map(normalize);
  if (roots.length === 0) {
    return normalized;
  }
  return normalized.filter((file) => roots.some((root) => isUnder(file, root)));
}
