// src/cdui/avatarClient.ts
import type { ScreenDescription, ScreenMutation } from "./types";

export interface AvatarResponse {
  narration: string;
  intentSummary: string;
  focusTarget: string | null;
  tone: "neutral" | "curious" | "excited" | "warning";
}

interface CompilerContext {
  systemPrompt?: string;
  mutations?: ScreenMutation[];
}

export async function callAvatar(
  text: string,
  currentScreen: ScreenDescription,
  history: ScreenDescription[],
  compilerContext?: CompilerContext
): Promise<AvatarResponse | null> {
  try {
    const res = await fetch("/api/avatar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        currentScreen,
        history,
        compilerContext,
        // simple portfolio context stub for now;
        // we can expand this later with more profile data if we want.
        portfolioContext: {
          ownerName: "Admir Sabanovic",
          headline: "Conversationally-Driven Portfolio (CDUI demo)",
        },
      }),
    });

    if (!res.ok) {
      console.warn("Avatar API error:", res.status);
      return null;
    }

    const data = (await res.json()) as AvatarResponse;
    return data;
  } catch (err) {
    console.warn("Avatar call failed:", err);
    return null;
  }
}
