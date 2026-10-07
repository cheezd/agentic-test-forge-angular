#!/usr/bin/env node
import { run } from "./cli/run.js";

const code = run(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
});

process.exit(code);
