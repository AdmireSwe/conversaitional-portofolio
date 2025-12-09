// src/App.tsx
import React, { useState } from "react";
import "./App.css";

import { ScreenRenderer } from "./cdui/components/ScreenRenderer";
import type { ScreenDescription, ScreenMutation } from "./cdui/types";
import { parseIntent, type Intent } from "./cdui/intent";
import { homeScreen } from "./cdui/screens";
import { decideFromText } from "./cdui/ai";
import { callBrain } from "./cdui/brainClient";
import { applyMutation } from "./cdui/mutate";

const IS_PROD = import.meta.env.PROD;

type Mode = "ui" | "chat";

function App() {
  const [history, setHistory] = useState<ScreenDescription[]>([homeScreen]);
  const currentScreen = history[history.length - 1];

  const [mode, setMode] = useState<Mode>("ui");
  const [chatInput, setChatInput] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(
    "You are not browsing pages. You are shaping the interface. What do you want to see?"
  );

  /**
   * Handle button clicks from the CDUI screen.
   * - "talk_to_interface" opens the chat dock.
   * - "download_cv" is still a mock for now.
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
   *
   * - GO_BACK is handled locally by manipulating history.
   * - In DEV: use the local rule-based engine (decideFromText).
   * - In PROD: call the OpenAI-powered /api/brain and apply mutations.
   */
  const handleCommand = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const intent: Intent = parseIntent(trimmed);

    // GO_BACK stays handled here because it manipulates history directly
    if (intent.type === "GO_BACK") {
      setHistory((prev) => {
        if (prev.length <= 1) return prev;
        const copy = [...prev];
        copy.pop();
        return copy;
      });
      setSystemPrompt("Went back to the previous view.");
      setChatInput("");
      setMode("ui");
      return;
    }

    const current = history[history.length - 1];

    // --- DEV / fallback path: local rule-based AI ---
    if (!IS_PROD) {
      const result = decideFromText(trimmed, history);

      if (result.kind === "push") {
        setHistory((prev) => [...prev, result.screen]);
        if (result.systemPrompt) setSystemPrompt(result.systemPrompt);
        setChatInput("");
        setMode("ui");
        return;
      }

      if (result.kind === "noop") {
        setSystemPrompt(result.systemPrompt);
        // stay in chat so user can refine
        return;
      }

      return;
    }

    // --- PROD path: call the OpenAI brain via /api/brain ---

    const brain = await callBrain(trimmed, current, history);

    // If brain failed or returned nothing useful, fall back to local rules
    if (!brain) {
      console.warn("Brain returned null, falling back to local AI.");
      const result = decideFromText(trimmed, history);

      if (result.kind === "push") {
        setHistory((prev) => [...prev, result.screen]);
        if (result.systemPrompt) setSystemPrompt(result.systemPrompt);
        setChatInput("");
        setMode("ui");
        return;
      }

      if (result.kind === "noop") {
        setSystemPrompt(result.systemPrompt);
        return;
      }

      return;
    }

    // Apply all mutations from the brain to the current screen
    const mutations = brain.mutations as ScreenMutation[];

    let nextScreen = current;
    for (const mutation of mutations) {
      nextScreen = applyMutation(nextScreen, mutation);
    }

    // Only push to history if something changed
    if (nextScreen !== current) {
      setHistory((prev) => [...prev, nextScreen]);
    }

    if (brain.systemPrompt) {
      setSystemPrompt(brain.systemPrompt);
    }

    setChatInput("");
    setMode("ui");
  };

  const handleChatSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    void handleCommand(chatInput);
  };

  return (
    <div className="app-shell">
      {/* Main UI area */}
      <div className="ui-region">
        <div className="ui-fullscreen">
          <ScreenRenderer screen={currentScreen} onAction={handleAction} />
        </div>
      </div>

      {/* Chat dock (only visible when mode === "chat") */}
      {mode === "chat" && (
        <div className="chat-dock fade-in">
          <div className="chat-box">
            <p className="chat-label">Interface</p>
            <p className="chat-system">{systemPrompt}</p>

            <form onSubmit={handleChatSubmit} className="chat-form">
              <input
                className="chat-input"
                placeholder="Describe how you want the interface to change..."
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
                  Close chat
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
