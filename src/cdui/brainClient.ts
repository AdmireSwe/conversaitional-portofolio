// src/cdui/brainClient.ts

import type {
    ScreenDescription,
    ScreenMutation,
  } from "./types";
  
  export interface BrainResponse {
    mutations: ScreenMutation[];
    systemPrompt: string;
  }
  
  const IS_PROD = import.meta.env.PROD;
  
  /**
   * Calls the Vercel /api/brain endpoint.
   *
   * In DEV (npm run dev), this returns null so the app
   * falls back to the local rule-based engine.
   */
  export async function callBrain(
    text: string,
    currentScreen: ScreenDescription,
    history: ScreenDescription[]
  ): Promise<BrainResponse | null> {
    if (!IS_PROD) {
      // In local dev we don't hit the OpenAI backend.
      return null;
    }
  
    try {
      const res = await fetch("/api/brain", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text, currentScreen, history }),
      });
  
      if (!res.ok) {
        console.error("Brain HTTP error:", res.status, res.statusText);
        return null;
      }
  
      const json = await res.json();
  
      if (!Array.isArray(json.mutations)) {
        json.mutations = [];
      }
      if (typeof json.systemPrompt !== "string") {
        json.systemPrompt = "Interface updated by AI.";
      }
  
      return json as BrainResponse;
    } catch (err) {
      console.error("Brain network error:", err);
      return null;
    }
  }
  