// src/cdui/intent.ts
// CDUI Intent Model & Parser v1

export type Intent =
  | { type: "SHOW_PROJECTS"; tech?: string }
  | { type: "SHOW_CV" }
  | { type: "SHOW_ANY_PROJECTS" }
  | { type: "GO_BACK" }
  | { type: "LOOP_TIMELINE" }
  | { type: "SHOW_LANGUAGE_SELECTION" }
  | { type: "SET_LANGUAGE_EN" }
  | { type: "SET_LANGUAGE_DE" }
  | { type: "UNKNOWN"; reason?: string };

function hasAny(text: string, candidates: string[]): boolean {
  return candidates.some((word) => text.includes(word));
}

export function parseIntent(input: string): Intent {
  const text = input.toLowerCase().trim();
  if (!text) return { type: "UNKNOWN", reason: "empty" };

  // --- Language selection (hidden UI) ---
  if (
    hasAny(text, [
      "language",
      "language selection",
      "choose language",
      "select language",
      "sprache",
      "sprachwahl",
      "sprache auswählen",
      "sprache waehlen",
    ])
  ) {
    return { type: "SHOW_LANGUAGE_SELECTION" };
  }

  // explicit set language
  if (
    text === "english" ||
    text === "set english" ||
    text.includes("switch to english")
  ) {
    return { type: "SET_LANGUAGE_EN" };
  }

  if (
    text === "deutsch" ||
    text === "german" ||
    text === "auf deutsch" ||
    text.includes("switch to german") ||
    text.includes("auf deutsch umstellen")
  ) {
    return { type: "SET_LANGUAGE_DE" };
  }

  // --- CV intent ---
  if (hasAny(text, ["cv", "curriculum", "lebenslauf", "resume"])) {
    return { type: "SHOW_CV" };
  }

  // --- Loop timeline ---
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

  // --- Go back ---
  if (
    text === "back" ||
    text === "go back" ||
    hasAny(text, ["go back", "zurück"]) ||
    (hasAny(text, ["back", "zurück"]) && hasAny(text, ["screen", "view"])) ||
    hasAny(text, ["previous screen", "prev screen"])
  ) {
    return { type: "GO_BACK" };
  }

  // --- Tech filters ---
  let tech: string | undefined;
  if (hasAny(text, ["java"])) tech = "java";
  else if (hasAny(text, ["backend", "server", "api"])) tech = "backend";
  else if (hasAny(text, ["firebase", "fire base"])) tech = "firebase";

  const mentionsProjects = hasAny(text, ["project", "projects", "work", "examples"]);
  const soundsLikeShow = hasAny(text, ["show", "see", "only", "filter", "zeige", "nur", "filtern"]);

  if (mentionsProjects || (soundsLikeShow && tech)) {
    return { type: "SHOW_PROJECTS", tech };
  }

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
      "etwas anderes",
      "mehr projekte",
      "nächstes",
    ])
  ) {
    return { type: "SHOW_ANY_PROJECTS" };
  }

  return { type: "UNKNOWN", reason: "no match" };
}
