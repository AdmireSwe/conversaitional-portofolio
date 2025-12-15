// src/cdui/ai.ts
import { parseIntent, type Intent } from "./intent";
import { homeScreen, javaScreen, backendScreen, cvScreen } from "./screens";
import type { ScreenDescription } from "./types";
import { applyMutation } from "./mutate";

/**
 * Result of "thinking" about a user command.
 *
 * - "push": show a new screen on top of history
 * - "noop": no navigation, just update the system message
 */
export type AIResult =
  | { kind: "push"; screen: ScreenDescription; systemPrompt?: string }
  | { kind: "noop"; systemPrompt: string };

// --- Small helpers -------------------------------------------------

function currentScreen(history: ScreenDescription[]): ScreenDescription {
  return history[history.length - 1];
}

/**
 * EN/DE detection (ONLY).
 * If it's not clearly German, default to English.
 */
function detectEnDe(input: string): "en" | "de" {
  const t = input.trim();
  const s = t.toLowerCase();

  const hasUmlaut = /[äöüß]/i.test(t);
  const hasGermanWords =
    /\b(und|oder|bitte|zeige|sprache|lebenslauf|zurück|projekt|projekte|ich|nicht|wähle|auswahl)\b/i.test(
      s
    );

  return hasUmlaut || hasGermanWords ? "de" : "en";
}

function screenLabel(screen: ScreenDescription, lang: "en" | "de"): string {
  if (lang === "de") {
    switch (screen.screenId) {
      case "home":
        return "der Hauptübersicht des Portfolios";
      case "java_projects":
        return "der Java-Projekte-Ansicht";
      case "backend_projects":
        return "der Backend-Projekte-Ansicht";
      case "cv_download":
        return "der CV-Ansicht";
      default:
        return "dieser Ansicht";
    }
  }

  // English
  switch (screen.screenId) {
    case "home":
      return "the main portfolio overview";
    case "java_projects":
      return "the Java-focused projects view";
    case "backend_projects":
      return "the backend-oriented projects view";
    case "cv_download":
      return "the CV view";
    default:
      return "this view";
  }
}

function nextActionsHint(screen: ScreenDescription, lang: "en" | "de"): string {
  if (lang === "de") {
    const base =
      'Du kannst z.B. sagen: "Java Projekte", "Backend Projekte", "Firebase Projekte", "Lebenslauf", "Zurück" oder "etwas anderes".';

    switch (screen.screenId) {
      case "home":
        return (
          "Du siehst die wichtigsten Projekte. " +
          "Du kannst nach Java oder Backend filtern oder direkt den Lebenslauf öffnen. " +
          base
        );
      case "java_projects":
        return (
          "Du siehst gerade nur Java-Projekte. " +
          "Du kannst zu Backend-Projekten wechseln, alles anzeigen oder den Lebenslauf öffnen. " +
          base
        );
      case "backend_projects":
        return (
          "Du siehst gerade Backend-orientierte Arbeit (CLI, Fullstack, Firebase). " +
          "Du kannst zu Java-Projekten wechseln, alles anzeigen oder den Lebenslauf öffnen. " +
          base
        );
      case "cv_download":
        return (
          "Du bist in der Lebenslauf-Ansicht. " +
          "Du kannst Java-Projekte, Backend-Projekte ansehen oder zur Hauptübersicht zurückgehen. " +
          base
        );
      default:
        return base;
    }
  }

  // English
  const base =
    'You can ask for "java projects", "backend projects", "firebase projects", "cv", say "go back", or ask for "something else".';

  switch (screen.screenId) {
    case "home":
      return (
        "You are seeing all highlighted projects. " +
        "You can narrow it down to Java or backend work, or jump to the CV. " +
        base
      );
    case "java_projects":
      return (
        "You are currently seeing only Java work. " +
        "You can switch to backend projects, show the full list again, or open the CV. " +
        base
      );
    case "backend_projects":
      return (
        "You are currently seeing backend-oriented work (CLI, fullstack, Firebase). " +
        "You can switch to Java projects, show everything, or open the CV. " +
        base
      );
    case "cv_download":
      return (
        "You are on the CV view. " +
        "You can ask to see Java projects, backend projects, or return to the main overview. " +
        base
      );
    default:
      return base;
  }
}

// maps "backend", "backend skills", "fullstack", etc. to the matrix row names
function normalizeAreaName(input: string): string | null {
  const s = input.toLowerCase();

  if (s.includes("front")) return "Frontend";
  if (s.includes("back") || s.includes("fullstack")) return "Backend / Fullstack";
  if (s.includes("program") || s.includes("language")) return "Programming languages";
  if (s.includes("tool")) return "Tooling";

  // German synonyms (small set)
  if (s.includes("werkzeug")) return "Tooling";
  if (s.includes("sprache") || s.includes("programmiersprache")) return "Programming languages";
  if (s.includes("backend") || s.includes("server") || s.includes("voll")) return "Backend / Fullstack";
  if (s.includes("frontend")) return "Frontend";

  return null;
}

// --- Main decision function ----------------------------------------

/**
 * Decide what to do with a text command.
 * Rule-based, restrained, EN/DE only.
 */
export function decideFromText(text: string, history: ScreenDescription[]): AIResult {
  const lang = detectEnDe(text);
  const intent: Intent = parseIntent(text);
  const current = currentScreen(history);

  switch (intent.type) {
    case "SHOW_CV": {
      return {
        kind: "push",
        screen: cvScreen,
        systemPrompt:
          (lang === "de"
            ? "Öffne die Lebenslauf-Ansicht. "
            : "Opening the CV view. ") + nextActionsHint(cvScreen, lang),
      };
    }

    case "SHOW_PROJECTS": {
      let nextScreen: ScreenDescription = homeScreen;
      let label = lang === "de" ? "alle hervorgehobenen Projekte" : "all highlighted projects";

      if (intent.tech === "java") {
        nextScreen = javaScreen;
        label = lang === "de" ? "Java-Projekte" : "Java-focused projects";
      } else if (intent.tech === "backend" || intent.tech === "firebase") {
        nextScreen = backendScreen;
        label = lang === "de" ? "Backend-Projekte" : "backend-oriented projects";
      }

      return {
        kind: "push",
        screen: nextScreen,
        systemPrompt:
          (lang === "de" ? `Zeige ${label}. ` : `Showing ${label}. `) +
          nextActionsHint(nextScreen, lang),
      };
    }

    case "SHOW_ANY_PROJECTS": {
      // Simple cycle: home → backend → java → home ...
      let nextScreen: ScreenDescription;

      if (current.screenId === "home") nextScreen = backendScreen;
      else if (current.screenId === "backend_projects") nextScreen = javaScreen;
      else nextScreen = homeScreen;

      return {
        kind: "push",
        screen: nextScreen,
        systemPrompt:
          (lang === "de"
            ? "Zeige eine weitere Perspektive auf das Portfolio. "
            : "Showing another perspective on the portfolio. ") +
          nextActionsHint(nextScreen, lang),
      };
    }

    // NEW: language intents should NOT mutate screens here.
    // App.tsx handles showing the picker and setting the session preference.
    case "SHOW_LANGUAGE_SELECTION": {
      return {
        kind: "noop",
        systemPrompt:
          lang === "de"
            ? 'Sprachauswahl: Sage "Deutsch" oder "English".'
            : 'Language selection: say "German/Deutsch" or "English".',
      };
    }

    case "SET_LANGUAGE_EN": {
      return {
        kind: "noop",
        systemPrompt: "Language set to English.",
      };
    }

    case "SET_LANGUAGE_DE": {
      return {
        kind: "noop",
        systemPrompt: "Sprache auf Deutsch eingestellt.",
      };
    }

    case "GO_BACK":
    case "LOOP_TIMELINE":
      // App.tsx handles these explicitly. Keep ai.ts restrained.
      return {
        kind: "noop",
        systemPrompt:
          lang === "de"
            ? `Okay. Du bist gerade auf ${screenLabel(current, lang)}. ` + nextActionsHint(current, lang)
            : `Okay. You are currently on ${screenLabel(current, lang)}. ` + nextActionsHint(current, lang),
      };

    case "UNKNOWN":
    default: {
      const rawText = text.trim();

      // ----------------------------------------------------------------
      // NOTE: These "mutation commands" are powerful and can feel weird.
      // Keep them, but make them strict + explicit, and EN/DE only.
      // ----------------------------------------------------------------

      // -------- SKILL MATRIX REFINEMENT --------
      const addSkillMatch = rawText.match(/^add (.+?) to (.+)$/i);
      if (addSkillMatch) {
        const skill = addSkillMatch[1].trim();
        const areaRaw = addSkillMatch[2].trim();
        const area = normalizeAreaName(areaRaw);

        if (area) {
          const mutated = applyMutation(current, { kind: "ADD_SKILL", area, skill });
          return {
            kind: "push",
            screen: mutated,
            systemPrompt:
              lang === "de"
                ? `Skill "${skill}" wurde in "${area}" ergänzt.`
                : `Added "${skill}" to "${area}" in the skill matrix.`,
          };
        }
      }

      const levelMatch = rawText.match(/^(change|set) (.+?) level to (.+)$/i);
      if (levelMatch) {
        const areaRaw = levelMatch[2].trim();
        const level = levelMatch[3].trim();
        const area = normalizeAreaName(areaRaw);

        if (area) {
          const mutated = applyMutation(current, { kind: "CHANGE_LEVEL", area, level });
          return {
            kind: "push",
            screen: mutated,
            systemPrompt:
              lang === "de"
                ? `Level für "${area}" auf "${level}" gesetzt.`
                : `Updated level for "${area}" to "${level}".`,
          };
        }
      }

      // -------- TIMELINE REFINEMENT --------
      // Example: "add X to timeline"
      const timelineMatch = rawText.match(/^add (.+?) to timeline$/i);
      if (timelineMatch) {
        const title = timelineMatch[1].trim();

        const entry = {
          id: `custom-${Date.now()}`,
          title,
          period: lang === "de" ? "noch offen" : "to be decided",
          description:
            lang === "de" ? "Über Befehl hinzugefügt." : "Added via conversational command.",
        };

        const mutated = applyMutation(current, { kind: "ADD_TIMELINE_ENTRY", entry });

        return {
          kind: "push",
          screen: mutated,
          systemPrompt:
            lang === "de"
              ? `"${title}" wurde als Timeline-Eintrag hinzugefügt.`
              : `Added "${title}" as a new timeline entry.`,
        };
      }

      // -------- PROJECT FILTERING --------
      const projectMatch = rawText.match(
        /(?:show|filter|only).*?(?:projects?)?.*?(?:using|with|by)\s+(.+)$/i
      );
      if (projectMatch) {
        const tech = projectMatch[1].trim();
        const mutated = applyMutation(current, { kind: "FILTER_PROJECTS", tech });
        return {
          kind: "push",
          screen: mutated,
          systemPrompt:
            lang === "de"
              ? `Projekte gefiltert nach "${tech}".`
              : `Filtered projects by "${tech}".`,
        };
      }

      // -------- TAG REFINEMENT COMMANDS --------
      const addTagMatch = rawText.match(/^add (.+?)(?: tag)?$/i);
      if (addTagMatch) {
        const tag = addTagMatch[1].trim();
        const mutated = applyMutation(current, { kind: "ADD_TAG", tag });
        return {
          kind: "push",
          screen: mutated,
          systemPrompt:
            lang === "de"
              ? `Tag "${tag}" wurde hinzugefügt.`
              : `Added tag "${tag}" to this view.`,
        };
      }

      const removeMatch = rawText.match(/^remove (.+?)(?: tag)?$/i);
      if (removeMatch) {
        const tag = removeMatch[1].trim();
        const mutated = applyMutation(current, { kind: "REMOVE_TAG", tag });
        return {
          kind: "push",
          screen: mutated,
          systemPrompt:
            lang === "de"
              ? `Tag "${tag}" wurde entfernt.`
              : `Removed tag "${tag}" from this view.`,
        };
      }

      // -------- FALLBACK --------
      return {
        kind: "noop",
        systemPrompt:
          (lang === "de"
            ? `Ich habe das nicht ganz verstanden. Du bist gerade auf ${screenLabel(current, lang)}. `
            : `I didn’t fully understand that. Right now you are on ${screenLabel(current, lang)}. `) +
          nextActionsHint(current, lang),
      };
    }
  }
}
