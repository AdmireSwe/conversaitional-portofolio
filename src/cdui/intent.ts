// CDUI Intent Model & Parser v1

export type Intent =
  | { type: "SHOW_PROJECTS"; tech?: string }
  | { type: "SHOW_CV" }
  | { type: "GO_BACK" }
  | { type: "UNKNOWN"; reason?: string };

  function hasAny(text: string, candidates: string[]): boolean {
    return candidates.some((word) => text.includes(word));
  }
  

/**
 * Turn raw user text into a structured intent object.
 * This is the "brain" between natural language and UI.
 */
export function parseIntent(input: string): Intent {
  const text = input.toLowerCase().trim();

  if (!text) return { type: "UNKNOWN", reason: "empty" };

  // --- CV / resume intent ---
  if (hasAny(text, ["cv", "curriculum", "lebenslauf", "resume"])) {
    return { type: "SHOW_CV" };
  }

  // --- Go back intent (much more tolerant now) ---
  if (
    text === "back" ||
    text === "go back" ||
    hasAny(text, ["go back", "zurück"]) ||
    (hasAny(text, ["back", "zurück"]) && hasAny(text, ["screen", "view"])) ||
    hasAny(text, ["previous screen", "prev screen"])
  ) {
    return { type: "GO_BACK" };
  }

  // --- Try to detect tech filters ---
  let tech: string | undefined;

  if (hasAny(text, ["java"])) tech = "java";
  else if (hasAny(text, ["backend", "server", "api"])) tech = "backend";
  else if (hasAny(text, ["firebase", "fire base"])) tech = "firebase";

  const mentionsProjects = hasAny(text, [
    "project",
    "projects",
    "work",
    "examples",
  ]);
  const soundsLikeShow = hasAny(text, ["show", "see", "only", "filter"]);

  // --- Show projects intent ---
  if (mentionsProjects || (soundsLikeShow && tech)) {
    return { type: "SHOW_PROJECTS", tech };
  }

  // Fallback
  return { type: "UNKNOWN", reason: "no match" };
}
