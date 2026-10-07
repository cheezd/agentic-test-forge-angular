import { toolVersion } from "../version.js";
import { verbs } from "./verbs.js";

function command(name: string, description: string): string {
  return `  ${name.padEnd(16)} ${description}`;
}

export function renderHelp(): string {
  return `forge ${toolVersion}
Angular quality gates for agentic development.

Usage:
  forge <command> [options]

Commands:
${command(verbs.check, "Run the hard gates, then the advisory passes")}
${command(verbs.crap, "Score CRAP against the ceiling")}
${command(verbs.mutate, "Score mutation against the kill-rate floor")}
${command(verbs.mutateGherkin, "Score Gherkin mutation against the floor")}
${command(verbs.dry, "Advisory duplication pass")}

Options:
  --base <ref>       Limit analysis to the git diff against this ref
  --path <path>      Source root. Repeat to replace the configured roots
  --json <file>      Write the JSON report. Human output still prints
  --threshold <n>    Ceiling or floor for crap, mutate, and mutate-gherkin
  -h, --help         Show this help
`;
}
