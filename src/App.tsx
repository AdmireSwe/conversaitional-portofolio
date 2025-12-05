import React, { useState } from "react";
import "./App.css";

import { ScreenRenderer } from "./cdui/components/ScreenRenderer";
import type { ScreenDescription } from "./cdui/types";
import { parseIntent, type Intent } from "./cdui/intent";
import { homeScreen } from "./cdui/screens";
import { decideFromText } from "./cdui/ai";

type Mode = "ui" | "chat";

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
   * For now there's only one special button: "talk_to_interface".
   */
  const handleAction = (actionId: string) => {
    if (actionId === "talk_to_interface") {
      // Switch into full-screen chat mode
      setMode("chat");
      return;
    }

    if (actionId === "download_cv") {
      // Mock CV download
      alert("This will trigger a real CV download in a later version.");
      return;
    }

    // Later: other action IDs will be handled here.
    console.log("Unhandled action:", actionId);
  };

  /**
   * Decide which screen to show based on the user's text command.
   * GO_BACK manipulates history directly, everything else uses the AI adapter.
   */
  const handleCommand = (text: string) => {
    const intent: Intent = parseIntent(text);

    // GO_BACK stays handled here because it manipulates history directly
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

    // Everything else goes through the AI adapter
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
      // stay in chat mode so user can refine
      return;
    }
  };

  const handleChatSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    handleCommand(chatInput);
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
