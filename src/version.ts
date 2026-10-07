import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const toolVersion: string = require("../package.json").version;
