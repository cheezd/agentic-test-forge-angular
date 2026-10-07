import { acceptsThreshold } from "./verbs.js";

export type ParsedArgs = {
  help: boolean;
  verb: string | null;
  baseRef: string | null;
  paths: string[];
  jsonPath: string | null;
  threshold: number | null;
  error: string | null;
};

type OptionState = {
  baseRef: string | null;
  jsonPath: string | null;
  threshold: number | null;
  paths: string[];
};

export function parseArgs(args: readonly string[]): ParsedArgs {
  if (args.length === 0 || args.some((arg) => arg === "-h" || arg === "--help")) {
    return emptyArgs({ help: true });
  }

  const verb = args[0];
  if (verb === undefined || verb.startsWith("-")) {
    return emptyArgs({ error: `Unknown option '${verb ?? ""}'. A command is required.` });
  }

  const state: OptionState = { baseRef: null, jsonPath: null, threshold: null, paths: [] };

  for (let index = 1; index < args.length; index++) {
    const token = args[index];
    if (token === undefined) {
      return emptyArgs({ error: "Unexpected argument." });
    }

    const split = splitOption(token);
    if (!split.option.startsWith("-")) {
      return emptyArgs({ error: `Unexpected argument '${token}'.` });
    }

    if (!isKnownOption(split.option)) {
      return emptyArgs({ error: `Unknown option '${split.option}'.` });
    }

    const read = tryReadValue(args, index, split.option, split.inline);
    if (read.error !== null) {
      return emptyArgs({ error: read.error });
    }
    index = read.index;

    const error = takeOption(split.option, read.value, state);
    if (error !== null) {
      return emptyArgs({ error });
    }
  }

  if (state.threshold !== null && !acceptsThreshold(verb)) {
    return emptyArgs({ error: "--threshold applies to crap, mutate, and mutate-gherkin." });
  }

  return {
    help: false,
    verb,
    baseRef: state.baseRef,
    paths: state.paths,
    jsonPath: state.jsonPath,
    threshold: state.threshold,
    error: null,
  };
}

function emptyArgs(overrides: Partial<ParsedArgs>): ParsedArgs {
  return {
    help: false,
    verb: null,
    baseRef: null,
    paths: [],
    jsonPath: null,
    threshold: null,
    error: null,
    ...overrides,
  };
}

function isKnownOption(option: string): boolean {
  return option === "--base" || option === "--path" || option === "--json" || option === "--threshold";
}

function takeOption(option: string, value: string, state: OptionState): string | null {
  switch (option) {
    case "--base":
      return takeBase(state, value);
    case "--path":
      return takePath(state.paths, value);
    case "--json":
      return takeJson(state, value);
    case "--threshold":
      return takeThreshold(state, value);
    default:
      return `Unknown option '${option}'.`;
  }
}

function takeBase(state: OptionState, value: string): string | null {
  if (state.baseRef !== null) {
    return "Option '--base' was specified more than once.";
  }
  if (value.length === 0) {
    return "Option '--base' requires a git ref.";
  }
  state.baseRef = value;
  return null;
}

function takePath(paths: string[], value: string): string | null {
  if (value.length === 0) {
    return "Option '--path' requires a path.";
  }
  paths.push(value);
  return null;
}

function takeJson(state: OptionState, value: string): string | null {
  if (state.jsonPath !== null) {
    return "Option '--json' was specified more than once.";
  }
  if (value.length === 0) {
    return "Option '--json' requires a file path.";
  }
  state.jsonPath = value;
  return null;
}

function takeThreshold(state: OptionState, value: string): string | null {
  if (state.threshold !== null) {
    return "Option '--threshold' was specified more than once.";
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return `Option '--threshold' expects a number zero or greater, got '${value}'.`;
  }
  state.threshold = parsed;
  return null;
}

function splitOption(token: string): { option: string; inline: string | null } {
  const equals = token.indexOf("=");
  if (token.startsWith("--") && equals > 2) {
    return { option: token.slice(0, equals), inline: token.slice(equals + 1) };
  }
  return { option: token, inline: null };
}

function tryReadValue(
  args: readonly string[],
  index: number,
  option: string,
  inline: string | null,
): { index: number; value: string; error: string | null } {
  if (inline !== null) {
    return { index, value: inline, error: null };
  }

  const next = index + 1;
  const nextArg = args[next];
  if (nextArg === undefined || (option !== "--threshold" && nextArg.startsWith("-"))) {
    return { index, value: "", error: `Option '${option}' requires a value.` };
  }
  return { index: next, value: nextArg, error: null };
}
