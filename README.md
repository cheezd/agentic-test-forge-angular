# agentic-test-forge-angular

Angular quality gate for agentic development. Same `forge check` contract as agentic-test-forge.

This slice is the CLI, `forge.json`, and the JSON report. Coverage, mutation, CRAP, DRY, and acceptance land in later tasks. A valid `forge.json` with no gates running passes.

## Local command

```bash
npm install
npm run build
node dist/cli.js --help
```

The command name is `forge` after the package is installed.

## forge.json

Put this file at the consumer repo root. Omitted thresholds default to 30, 80, and 80. A missing `test_project` is exit 2 for `check`, `crap`, and `mutate`. `acceptance_project` is optional. `test_project` names an Angular or Nx project.

```json
{
  "paths": ["src/app"],
  "test_project": "app",
  "acceptance_project": null,
  "crap_threshold": 30,
  "mutation_threshold": 80,
  "gherkin_threshold": 80
}
```

## Usage

```bash
node dist/cli.js check --base main --json report.json
```

`--json` writes the report, and a one-line status still prints. `forge --help` lists the flags. `--base` scores only files changed against that ref, inside `paths`. A git failure is exit 2.

`forge check --base` runs Vitest coverage on the changed TypeScript files. An uncovered changed line exits 1. A run that cannot produce coverage exits 2. Template files stay out of this gate.

Exit 0 when every hard gate that ran passed. Exit 1 when a hard gate fails. Exit 2 when config cannot be loaded, `test_project` is missing, or coverage cannot be produced. A tool error outranks a gate failure. The JSON `status` is `pass`, `fail`, or `error`.
