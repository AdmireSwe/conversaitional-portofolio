import type { ScreenDescription } from "./types";
import { parseIntent, type Intent } from "./intent";

// We need access to the predefined screens:
import {
    homeScreen,
    javaScreen,
    backendScreen,
    cvScreen,
  } from "./screens";
  

/**
 * Result of "thinking" about a user command.
 *
 * - "push": show a new screen on top of history
 * - "noop": no navigation, just update the system message
 * - "pop": handled in App for GO_BACK (we keep that logic there)
 */
export type AIResult =
  | { kind: "push"; screen: ScreenDescription; systemPrompt?: string }
  | { kind: "noop"; systemPrompt: string };

/**
 * Decide what to do with a text command.
 * For now this is rule-based; later you can swap internals to call a real LLM.
 */
export function decideFromText(
  text: string,
  history: ScreenDescription[]
): AIResult {
  const intent: Intent = parseIntent(text);

  switch (intent.type) {
    case "SHOW_CV": {
      return {
        kind: "push",
        screen: cvScreen,
        systemPrompt: "CV section opened. You can request other views anytime.",
      };
    }

    case "SHOW_PROJECTS": {
      let nextScreen: ScreenDescription = homeScreen;

      if (intent.tech === "java") {
        nextScreen = javaScreen;
      } else if (
        intent.tech === "backend" ||
        intent.tech === "firebase"
      ) {
        nextScreen = backendScreen;
      }

      return {
        kind: "push",
        screen: nextScreen,
        systemPrompt: "View updated. You can refine it again.",
      };
    }

    case "SHOW_ANY_PROJECTS": {
      // For now, "something else" just pushes the backend screen.
      return {
        kind: "push",
        screen: backendScreen,
        systemPrompt: "Here is another example from the portfolio.",
      };
    }

    case "UNKNOWN":
    default: {
      return {
        kind: "noop",
        systemPrompt:
          "I'm not sure what you mean. Try phrases like 'java projects', 'backend projects', 'firebase projects', 'cv', or 'go back'.",
      };
    }
  }
}
