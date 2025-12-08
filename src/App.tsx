import React, { useState } from "react";
import "./App.css";

import { ScreenRenderer } from "./cdui/components/ScreenRenderer";
import type { ScreenDescription } from "./cdui/types";
import { parseIntent, type Intent } from "./cdui/intent";
import { homeScreen } from "./cdui/screens";
import { decideFromText, type AIResult } from "./cdui/ai";

type Mode = "ui" | "chat";

// will be true in a Vercel build, false in `npm run dev`
const IS_PROD = import.meta.env.PROD;

/**
 * In dev:
 *   - return null → we fall back to local rule engine.
 *
 * In production (Vercel):
 *   - call `/api/brain` on the same origin.
 */
async function callBrain(
  text: string,
  currentScreen: ScreenDescription,
  history: ScreenDescription[]
): Promise<AIResult | null> {
  if (!IS_PROD) {
    // Local development: do NOTHING, let the rule engine handle it.
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

    if (!data || (data.kind !== "push" && data.kind !== "noop")) {
      console.warn("Brain returned invalid payload:", data);
      return null;
    }

    return data as AIResult;
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
   * - Otherwise: try remote brain first, fall back to local rule engine
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

    // 1) Try remote brain (only does anything in production)
    const remote = await callBrain(text, currentScreen, history);
    if (remote) {
      if (remote.kind === "push") {
        setHistory((prev) => [...prev, remote.screen]);
        if (remote.systemPrompt) setSystemPrompt(remote.systemPrompt);
        setMode("ui");
        setChatInput("");
        return;
      }

      if (remote.kind === "noop") {
        setSystemPrompt(remote.systemPrompt);
        setChatInput("");
        return;
      }
    }

    // 2) Fallback: local rule-based engine
    const result = decideFromText(text, history);

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
