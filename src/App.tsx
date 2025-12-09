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

function App() {
  const [history, setHistory] = useState<ScreenDescription[]>([homeScreen]);
  const currentScreen = history[history.length - 1];

  const [chatInput, setChatInput] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(
    "You are not browsing pages. You are shaping the interface. What do you want to see?"
  );

  const [isChatOpen, setIsChatOpen] = useState(false);

  /**
   * Handle button clicks from the CDUI screen.
   */
  const handleAction = (actionId: string) => {
    if (actionId === "talk_to_interface") {
      setIsChatOpen(true);
      // optional: scroll to bottom where the chat dock lives
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      return;
    }

    if (actionId === "download_cv") {
      alert("This will trigger a real CV download in a later version.");
      return;
    }

    console.log("Unhandled action:", actionId);
  };

  /**
   * Decide what to do with a text command.
   *
   * - Navigation intents (SHOW_*) and GO_BACK are handled LOCALLY in all envs.
   * - In DEV: all other commands go through the local rule-based engine.
   * - In PROD: other commands call the OpenAI brain for mutations,
   *   with a fallback to the local rule-based engine on error.
   */
  const handleCommand = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const intent: Intent = parseIntent(trimmed);
    const current = history[history.length - 1];

    // --- GO_BACK: manipulate history directly, always local -----------------
    if (intent.type === "GO_BACK") {
      setHistory((prev) => {
        if (prev.length <= 1) return prev;
        const copy = [...prev];
        copy.pop();
        return copy;
      });
      setSystemPrompt("Went back to the previous view.");
      setChatInput("");
      return;
    }

    // --- Navigation intents: ALWAYS handled via local decideFromText --------
    if (
      intent.type === "SHOW_CV" ||
      intent.type === "SHOW_PROJECTS" ||
      intent.type === "SHOW_ANY_PROJECTS"
    ) {
      const result = decideFromText(trimmed, history);

      if (result.kind === "push") {
        setHistory((prev) => [...prev, result.screen]);
        if (result.systemPrompt) setSystemPrompt(result.systemPrompt);
        setChatInput("");
        return;
      }

      if (result.kind === "noop") {
        setSystemPrompt(result.systemPrompt);
        setChatInput("");
        return;
      }
    }

    // From here on, we treat it as a "refinement" command (no navigation).

    // --- DEV / fallback path: local rule-based AI ---------------------------
    if (!IS_PROD) {
      const result = decideFromText(trimmed, history);

      if (result.kind === "push") {
        setHistory((prev) => [...prev, result.screen]);
        if (result.systemPrompt) setSystemPrompt(result.systemPrompt);
        setChatInput("");
        return;
      }

      if (result.kind === "noop") {
        setSystemPrompt(result.systemPrompt);
        setChatInput("");
        return;
      }

      return;
    }

    // --- PROD path: call the OpenAI brain for mutations ---------------------

    const brain = await callBrain(trimmed, current, history);

    // If brain failed or returned nothing useful, fall back to local rules
    if (!brain) {
      console.warn("Brain returned null, falling back to local AI.");
      const result = decideFromText(trimmed, history);

      if (result.kind === "push") {
        setHistory((prev) => [...prev, result.screen]);
        if (result.systemPrompt) setSystemPrompt(result.systemPrompt);
        setChatInput("");
        return;
      }

      if (result.kind === "noop") {
        setSystemPrompt(result.systemPrompt);
        setChatInput("");
        return;
      }

      return;
    }

    const mutations = brain.mutations as ScreenMutation[];

    let nextScreen = current;
    for (const mutation of mutations) {
      nextScreen = applyMutation(nextScreen, mutation);
    }

    if (nextScreen !== current) {
      setHistory((prev) => [...prev, nextScreen]);
    }

    if (brain.systemPrompt) {
      setSystemPrompt(brain.systemPrompt);
    }

    setChatInput("");
  };

  const handleChatSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    void handleCommand(chatInput);
  };

  return (
    <div className="app-shell">
      <div className="ui-region">
        <div className="ui-fullscreen">
          <ScreenRenderer screen={currentScreen} onAction={handleAction} />
        </div>
      </div>

      {isChatOpen && (
        <div className="chat-dock">
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
                    setIsChatOpen(false);
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
