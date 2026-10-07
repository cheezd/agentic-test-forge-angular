export const verbs = {
  check: "check",
  crap: "crap",
  mutate: "mutate",
  mutateGherkin: "mutate-gherkin",
  dry: "dry",
} as const;

const names = new Set<string>(Object.values(verbs));

export function isKnownVerb(verb: string): boolean {
  return names.has(verb);
}

export function acceptsThreshold(verb: string): boolean {
  return verb === verbs.crap || verb === verbs.mutate || verb === verbs.mutateGherkin;
}

export function requiresTestProject(verb: string): boolean {
  return verb === verbs.check || verb === verbs.crap || verb === verbs.mutate;
}
