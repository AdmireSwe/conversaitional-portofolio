// CDUI Intent Model & Parser v1

export type Intent =
  | { type: "SHOW_PROJECTS"; tech?: string }
  | { type: "SHOW_CV" }
  | { type: "GO_BACK" }
  | { type: "UNKNOWN"; reason?: string };

/**
 * Turn raw user text into a structured intent object.
 * This is the "brain" between natural language and UI.
 */
export function parseIntent(input: string): Intent {
  const text = input.toLowerCase().trim();

  if (!text) return { type: "UNKNOWN", reason: "empty" };

  // CV / resume
  if (text.includes("cv") || text.includes("curriculum") || text.includes("lebenslauf")) {
    return { type: "SHOW_CV" };
  }

  // Go back
  if (text === "back" || text === "go back" || text.includes("previous screen")) {
    return { type: "GO_BACK" };
  }

  // Projects
  if (text.includes("project")) {
    // tech filters
    if (text.includes("java")) return { type: "SHOW_PROJECTS", tech: "java" };
    if (text.includes("firebase")) return { type: "SHOW_PROJECTS", tech: "firebase" };
    if (text.includes("backend")) return { type: "SHOW_PROJECTS", tech: "backend" };

    return { type: "SHOW_PROJECTS" };
  }

  return { type: "UNKNOWN", reason: "no match" };
}
