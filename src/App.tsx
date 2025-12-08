import React, { useState } from "react";
import "./App.css";

import { ScreenRenderer } from "./cdui/components/ScreenRenderer";
import type { ScreenDescription, ScreenMutation } from "./cdui/types";
import { applyMutation } from "./cdui/mutate";
import { parseIntent, type Intent } from "./cdui/intent";
import { homeScreen } from "./cdui/screens";
import { decideFromText, type AIResult } from "./cdui/ai";

type Mode = "ui" | "chat";

const IS_PROD = import.meta.env.PROD;

interface BrainResponse {
  mutations: ScreenMutation[];
  systemPrompt?: string;
}

/**
 * In production on Vercel:
 *   - calls /api/brain, which uses OpenAI and returns mutations.
 *
 * In local dev:
 *   - returns null so we fall back to the local rule engine.
 */
async function callBrain(
  text: string,
  currentScreen: ScreenDescription,
  history: ScreenDescription[]
): Promise<BrainResponse | null> {
  if (!IS_PROD) {
    // Local development: don't call remote AI, keep things cheap & simple.
    return null;
  }

  try {
    const response = await fetch("/api/brain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        currentScreen,
        history: history.map((h) => h.screenId),
      }),
    });

    if (!response.ok) {
      console.warn("Brain responded with non-OK status:", response.status);
      return null;
    }

    const data = await response.json();

    if (!data || !Array.isArray(data.mutations)) {
      console.warn("Brain returned invalid payload:", data);
      return null;
    }

    return data as BrainResponse;
  } catch (err) {
    console.error("callBrain failed:", err);
    return null;
  }
}

function App() {
  const [mode, setMode] = useState<Mode>("ui");
  const [history, setHistory] = useState<ScreenDescription[]>([homeScreen]);
  const currentScreen = history[history.length - 1];

  const [chatInput, setChatInput] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(
    "You are not browsing pages. You are shaping the interface. What do you want to see?"
  );

  /**
   * Handle button clicks from the CDUI screen.
   */
  const handleAction = (actionId: string) => {
    if (actionId === "talk_to_interface") {
      setMode("chat");
      return;
    }

    if (actionId === "download_cv") {
      alert("This will trigger a real CV download in a later version.");
      return;
    }

    console.log("Unhandled action:", actionId);
  };

  /**
   * Decide which screen to show based on the user's text command.
   * - GO_BACK stays local
   * - Otherwise: try remote brain first (in prod), fall back to local rule engine
   */
  const handleCommand = async (text: string) => {
    const intent: Intent = parseIntent(text);

    // GO_BACK handled locally (no backend)
    if (intent.type === "GO_BACK") {
      setHistory((prev) => {
        if (prev.length <= 1) return prev;
        const copy = [...prev];
        copy.pop();
        return copy;
      });
      setSystemPrompt("Went back to the previous view.");
      setMode("ui");
      setChatInput("");
      return;
    }

    // 1) Try remote brain (AI) — only does anything in production
    const remote = await callBrain(text, currentScreen, history);
    if (remote) {
      const { mutations, systemPrompt } = remote;

      if (mutations.length > 0) {
        // Apply all mutations sequentially to the current screen
        const updatedScreen = mutations.reduce<ScreenDescription>(
          (screen, mutation) => applyMutation(screen, mutation),
          currentScreen
        );

        setHistory((prev) => [...prev, updatedScreen]);
        if (systemPrompt) setSystemPrompt(systemPrompt);
        setMode("ui");
        setChatInput("");
        return;
      }

      // No mutations but systemPrompt present → treat like a NOOP with message
      if (systemPrompt) {
        setSystemPrompt(systemPrompt);
        setChatInput("");
        // stay in chat mode so user can refine
        return;
      }
    }

    // 2) Fallback: local rule-based engine
    const result: AIResult = decideFromText(text, history);

    if (result.kind === "push") {
      setHistory((prev) => [...prev, result.screen]);
      if (result.systemPrompt) setSystemPrompt(result.systemPrompt);
      setMode("ui");
      setChatInput("");
      return;
    }

    if (result.kind === "noop") {
      setSystemPrompt(result.systemPrompt);
      return;
    }
  };

  const handleChatSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    await handleCommand(chatInput);
  };

  // MODE: CHAT (full-screen)
  if (mode === "chat") {
    return (
      <div className="chat-fullscreen">
        <div className="chat-box">
          <p className="chat-label">Interface</p>
          <p className="chat-system">{systemPrompt}</p>

          <form onSubmit={handleChatSubmit} className="chat-form">
            <input
              className="chat-input"
              placeholder="Type what you want the interface to become..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              autoFocus
            />
            <div className="chat-buttons">
              <button type="submit">Commit change</button>
              <button
                type="button"
                onClick={() => {
                  setChatInput("");
                  setMode("ui");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // MODE: UI (full-screen CDUI screen)
  return (
    <div className="ui-fullscreen">
      <ScreenRenderer screen={currentScreen} onAction={handleAction} />
    </div>
  );
}

export default App;
