export const defaultCrapThreshold = 30;
export const defaultMutationThreshold = 80;
export const defaultGherkinThreshold = 80;
export const defaultDrySources = ["sonar", "jaccard"] as const;

export type ForgeConfig = {
  paths: string[];
  testProject: string | null;
  acceptanceProject: string | null;
  crapThreshold: number;
  mutationThreshold: number;
  gherkinThreshold: number;
  drySources: string[];
};

export type LoadResult =
  | { config: ForgeConfig; repoRoot: string; error: null }
  | { config: null; repoRoot: null; error: string };
