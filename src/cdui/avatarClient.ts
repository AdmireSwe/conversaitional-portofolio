// src/cdui/avatarClient.ts
import type { ScreenDescription, ScreenMutation } from "./types";
import type { SessionContext } from "./session";

export interface AvatarResponse {
  narration: string;
  intentSummary: string;
  focusTarget: string | null;
  tone: "neutral" | "curious" | "excited" | "warning";
}

// What the frontend passes to the avatar route as “compiler context”
interface CompilerContext {
  systemPrompt?: string;
  mutations?: ScreenMutation[];
  session?: SessionContext; // 👈 NEW: per-visitor session info
}

interface AvatarRequestBody {
  text: string;
  currentScreen: ScreenDescription;
  history: ScreenDescription[];
  compilerContext?: CompilerContext;
  // You can extend this later with more structured portfolio info
  portfolioContext?: {
    ownerName: string;
    headline: string;
  };
}

/**
 * Call the /api/avatar endpoint.
 * Returns an AvatarResponse or null on error.
 */
export async function callAvatar(
  text: string,
  currentScreen: ScreenDescription,
  history: ScreenDescription[],
  compilerContext?: CompilerContext
): Promise<AvatarResponse | null> {
  const body: AvatarRequestBody = {
    text,
    currentScreen,
    history,
    compilerContext,
    portfolioContext: {
      ownerName: "Admir Sabanovic",
      headline: "Conversationally-Driven Portfolio (CDUI demo)",
    },
  };

  try {
    const res = await fetch("/api/avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn("Avatar API returned non-OK status:", res.status);
      return null;
    }

    const data = (await res.json()) as AvatarResponse;

    // Normalise a bit in case backend missed fields
    return {
      narration: data.narration ?? "",
      intentSummary: data.intentSummary ?? "",
      focusTarget: data.focusTarget ?? null,
      tone: data.tone ?? "neutral",
    };
  } catch (err) {
    console.error("Error calling avatar API:", err);
    return null;
  }
}
