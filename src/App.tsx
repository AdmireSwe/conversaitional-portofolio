import React, { useState } from "react";
import "./App.css";

import { ScreenRenderer } from "./cdui/components/ScreenRenderer";
import type { ScreenDescription } from "./cdui/types";
import { parseIntent, type Intent } from "./cdui/intent";
import { homeScreen } from "./cdui/screens";
import { decideFromText } from "./cdui/ai";

// 👇 NEW IMPORT: once backend exists, we replace the stub inside this file
// import { callBrain } from "./cdui/brain";

type Mode = "ui" | "chat";

// 👇 NEW TYPE — remote brain response shape
interface BrainResponse {
  mutations: any[]; // we'll strongly type later
  systemPrompt?: string;
}

// 👇 NEW FUNCTION — remote brain stub
// Later this will call /api/brain on Vercel
async function callBrain(
  text: string,
  currentScreen: ScreenDescription,
  history: ScreenDescription[]
): Promise<BrainResponse | null> {
  // For now, always return null → triggers fallback rule engine
  return null;
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
   * Decide which screen to show based on user's text command.
   * NOW supports remote AI first, local rule engine second.
   */
  const handleCommand = async (text: string) => {
    const intent: Intent = parseIntent(text);

    // GO_BACK stays local (does not involve backend)
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

    // 👇 NEW — FIRST try remote brain
    const remote = await callBrain(text, currentScreen, history);
    if (remote && Array.isArray(remote.mutations)) {
      // For now, simple behavior: if remote returns empty array, ignore
      if (remote.mutations.length > 0) {
        // Later: apply mutations here
        // TODO: apply remote mutations to screen
        setSystemPrompt(remote.systemPrompt ?? "Updated view via AI backend.");
        setMode("ui");
        setChatInput("");
        return;
      }
    }

    // 👇 FALLBACK — LOCAL RULE ENGINE
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

  const handleChatSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    await handleCommand(chatInput); // 👈 ensure async
  };

  // MODE: CHAT
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

  // MODE: UI
  return (
    <div className="ui-fullscreen">
      <ScreenRenderer screen={currentScreen} onAction={handleAction} />
    </div>
  );
}

export default App;
