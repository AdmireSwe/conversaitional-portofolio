import { parseIntent, type Intent } from "./intent";
import {
  homeScreen,
  javaScreen,
  backendScreen,
  cvScreen,
} from "./screens";
import type { ScreenDescription } from "./types";
import { applyMutation } from "./mutate";
import type { ScreenMutation } from "./types";


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

function screenLabel(screen: ScreenDescription): string {
  switch (screen.screenId) {
    case "home":
      return "the main portfolio overview";
    case "java_projects":
      return "the Java-focused projects view";
    case "backend_projects":
      return "the backend-oriented projects view";
    case "cv_download":
      return "the CV download page";
    default:
      return "this view";
  }
}

function nextActionsHint(screen: ScreenDescription): string {
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
        "You are on the CV download page. " +
        "You can ask to see Java projects, backend projects, or return to the main overview. " +
        base
      );
    default:
      return base;
  }
}

// --- Main decision function ----------------------------------------

/**
 * Decide what to do with a text command.
 * For now this is rule-based; later you can swap internals to call a real LLM.
 */
export function decideFromText(
  text: string,
  history: ScreenDescription[]
): AIResult {
  const intent: Intent = parseIntent(text);
  const current = currentScreen(history);

  switch (intent.type) {
    case "SHOW_CV": {
      return {
        kind: "push",
        screen: cvScreen,
        systemPrompt:
          "Opening the CV section. Here you will later get a real PDF on demand. " +
          nextActionsHint(cvScreen),
      };
    }

    case "SHOW_PROJECTS": {
      let nextScreen: ScreenDescription = homeScreen;
      let label = "all highlighted projects";

      if (intent.tech === "java") {
        nextScreen = javaScreen;
        label = "Java-focused projects";
      } else if (
        intent.tech === "backend" ||
        intent.tech === "firebase"
      ) {
        nextScreen = backendScreen;
        label = "backend-oriented projects";
      }

      return {
        kind: "push",
        screen: nextScreen,
        systemPrompt:
          `Showing ${label}. ` +
          nextActionsHint(nextScreen),
      };
    }

    case "SHOW_ANY_PROJECTS": {
      // Simple cycle: home → backend → java → home ...
      let nextScreen: ScreenDescription;

      if (current.screenId === "home") {
        nextScreen = backendScreen;
      } else if (current.screenId === "backend_projects") {
        nextScreen = javaScreen;
      } else {
        nextScreen = homeScreen;
      }

      return {
        kind: "push",
        screen: nextScreen,
        systemPrompt:
          "Showing another perspective on the portfolio. " +
          nextActionsHint(nextScreen),
      };
    }

    case "UNKNOWN":
        default: {
          const rawText = text.trim();
    
          // -------- TAG REFINEMENT COMMANDS --------
          // Examples:
          //  "add AWS"
          //  "add AWS tag"
          //  "remove React"
          //  "remove React tag"
    
          const addMatch = rawText.match(/^add (.+?)(?: tag)?$/i);
          if (addMatch) {
            const tag = addMatch[1].trim();
            const mutated = applyMutation(current, {
              kind: "ADD_TAG",
              tag,
            });
            return {
              kind: "push",
              screen: mutated,
              systemPrompt: `Added tag "${tag}" to this view.`,
            };
          }
    
          const removeMatch = rawText.match(/^remove (.+?)(?: tag)?$/i);
          if (removeMatch) {
            const tag = removeMatch[1].trim();
            const mutated = applyMutation(current, {
              kind: "REMOVE_TAG",
              tag,
            });
            return {
              kind: "push",
              screen: mutated,
              systemPrompt: `Removed tag "${tag}" from this view.`,
            };
          }
    
          // -------- FALLBACK --------
          return {
            kind: "noop",
            systemPrompt:
              `I didn't fully understand that. Right now you are on ${screenLabel(
                current
              )}. ` + nextActionsHint(current),
          };
        }
    
  }
}
