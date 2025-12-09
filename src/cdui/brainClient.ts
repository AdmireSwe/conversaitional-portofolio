// src/cdui/brainClient.ts
import type { ScreenDescription, ScreenMutation } from "./types";

export type AvatarMood = "neutral" | "curious" | "excited" | "skeptical";
export type AvatarAnimation =
  | "idle"
  | "thinking"
  | "searching"
  | "presenting"
  | "celebrating";

export interface BrainAvatarState {
  mood: AvatarMood;
  animation: AvatarAnimation;
}

export interface BrainResponse {
  mutations: ScreenMutation[];
  systemPrompt: string;
  avatarNarration: string;
  avatarState: BrainAvatarState;
}

export async function callBrain(
  text: string,
  currentScreen: ScreenDescription,
  history: ScreenDescription[]
): Promise<BrainResponse | null> {
  try {
    const res = await fetch("/api/brain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, currentScreen, history }),
    });

    if (!res.ok) {
      console.error("Brain HTTP error", res.status);
      return null;
    }

    const data = (await res.json()) as BrainResponse;
    return data;
  } catch (err) {
    console.error("Brain fetch failed:", err);
    return null;
  }
}
