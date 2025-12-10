// CDUI Intent Model & Parser v1

export type Intent =
  | { type: "SHOW_PROJECTS"; tech?: string }
  | { type: "SHOW_CV" }
  | { type: "SHOW_ANY_PROJECTS" }
  | { type: "GO_BACK" }
  | { type: "LOOP_TIMELINE" }
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

  // --- Loop-through intent (timeline slideshow) ---
  if (
    hasAny(text, [
      "loop through",
      "go through all",
      "go through them all",
      "show and explain all one by one",
      "step through",
      "step through them",
      "walk me through",
      "walk through the timeline",
      "loop the timeline",
    ])
  ) {
    return { type: "LOOP_TIMELINE" };
  }

  // --- Go back intent (tolerant) ---
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

  // --- Show something else / next thing ---
  if (
    hasAny(text, [
      "something else",
      "anything else",
      "more projects",
      "more work",
      "show more",
      "next",
      "next project",
      "next portfolio item",
    ])
  ) {
    return { type: "SHOW_ANY_PROJECTS" };
  }

  // Fallback
  return { type: "UNKNOWN", reason: "no match" };
}
