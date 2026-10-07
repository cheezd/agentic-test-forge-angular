import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  defaultCrapThreshold,
  defaultDrySources,
  defaultGherkinThreshold,
  defaultMutationThreshold,
  type ForgeConfig,
  type LoadResult,
} from "./forge-config.js";

export const forgeFileName = "forge.json";

type Document = {
  paths?: unknown;
  test_project?: unknown;
  acceptance_project?: unknown;
  crap_threshold?: unknown;
  mutation_threshold?: unknown;
  gherkin_threshold?: unknown;
  dry_sources?: unknown;
};

export function loadForgeConfig(startDirectory: string): LoadResult {
  const repoRoot = findRoot(startDirectory);
  if (repoRoot === null) {
    return { config: null, repoRoot: null, error: "forge.json was not found." };
  }

  const filePath = path.join(repoRoot, forgeFileName);
  let document: Document | null;
  try {
    const text = readFileSync(filePath, "utf8");
    document = JSON.parse(text) as Document | null;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        config: null,
        repoRoot: null,
        error: `forge.json is not valid JSON: ${error.message}`,
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      config: null,
      repoRoot: null,
      error: `forge.json could not be read: ${message}`,
    };
  }

  if (document === null || typeof document !== "object" || Array.isArray(document)) {
    return { config: null, repoRoot: null, error: "forge.json is not valid JSON." };
  }

  const thresholdError = validateThresholds(document);
  if (thresholdError !== null) {
    return { config: null, repoRoot: null, error: thresholdError };
  }

  return { config: toConfig(document), repoRoot, error: null };
}

function findRoot(startDirectory: string): string | null {
  let current = path.resolve(startDirectory);
  for (;;) {
    if (existsSync(path.join(current, forgeFileName))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function validateThresholds(document: Document): string | null {
  if (!isValidThreshold(document.crap_threshold)) {
    return "crap_threshold must be a number zero or greater.";
  }
  if (!isValidThreshold(document.mutation_threshold)) {
    return "mutation_threshold must be a number zero or greater.";
  }
  if (!isValidThreshold(document.gherkin_threshold)) {
    return "gherkin_threshold must be a number zero or greater.";
  }
  return null;
}

function isValidThreshold(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function toConfig(document: Document): ForgeConfig {
  return {
    paths: stringList(document.paths),
    testProject: blankToNull(document.test_project),
    acceptanceProject: blankToNull(document.acceptance_project),
    crapThreshold: numberOr(document.crap_threshold, defaultCrapThreshold),
    mutationThreshold: numberOr(document.mutation_threshold, defaultMutationThreshold),
    gherkinThreshold: numberOr(document.gherkin_threshold, defaultGherkinThreshold),
    drySources: sources(document.dry_sources),
  };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function blankToNull(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  return value;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function sources(value: unknown): string[] {
  if (value === undefined) {
    return [...defaultDrySources];
  }
  if (!Array.isArray(value)) {
    return [...defaultDrySources];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
