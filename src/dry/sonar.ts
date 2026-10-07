import { spawnSync } from "node:child_process";
import type { DryFinding } from "./jaccard.js";

export type SonarSettings = {
  host: string;
  token: string;
  projectKey: string;
};

export function readSonarSettings(env: NodeJS.ProcessEnv = process.env): SonarSettings | null {
  const host = env.SONAR_HOST_URL;
  const token = env.SONAR_TOKEN;
  const projectKey = env.SONAR_PROJECT_KEY;
  if (host === undefined || token === undefined || projectKey === undefined) {
    return null;
  }
  if (host.length === 0 || token.length === 0 || projectKey.length === 0) {
    return null;
  }
  return { host, token, projectKey };
}

export function sonarScannerAvailable(): boolean {
  const command = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(command, ["sonar-scanner"], { encoding: "utf8" });
  return result.status === 0;
}

export function collectSonar(
  available: () => boolean = sonarScannerAvailable,
  settings: SonarSettings | null = readSonarSettings(),
  fetchIssues: (value: SonarSettings) => DryFinding[] | null = () => null,
): DryFinding[] | null {
  if (!available() || settings === null) {
    return null;
  }
  return fetchIssues(settings);
}
