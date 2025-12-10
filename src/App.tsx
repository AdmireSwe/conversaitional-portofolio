// src/App.tsx
import React, { useState, useEffect } from "react";
import "./App.css";

import { ScreenRenderer } from "./cdui/components/ScreenRenderer";
import type {
  ScreenDescription,
  ScreenMutation,
  TimelineWidget,
} from "./cdui/types";
import { parseIntent, type Intent } from "./cdui/intent";
import { homeScreen, cvScreen } from "./cdui/screens";
import { decideFromText } from "./cdui/ai";
import { callBrain } from "./cdui/brainClient";
import { callAvatar } from "./cdui/avatarClient";
import { applyMutation } from "./cdui/mutate";

const IS_PROD = import.meta.env.PROD;

type LoopMode =
  | {
      kind: "timeline";
      ids: string[];
      index: number;
    }
  | null;

function App() {
  const [history, setHistory] = useState<ScreenDescription[]>([homeScreen]);
  const currentScreen = history[history.length - 1];

  const [chatInput, setChatInput] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(
    "You are not browsing pages. You are shaping the interface. What do you want to see?"
  );

  const [avatarNarration, setAvatarNarration] = useState<string | null>(null);
  const [avatarThinking, setAvatarThinking] = useState(false);
  const [showChat, setShowChat] = useState(false);

  // Which UI element/section is currently in focus (for highlighting/scrolling)
  const [focusTarget, setFocusTarget] = useState<string | null>(null);

  // Loop mode for automatic walkthroughs (e.g. timeline slideshow)
  const [loopMode, setLoopMode] = useState<LoopMode>(null);

  // Drive the loop: when loopMode is active, step through ids one by one
  // and have the avatar explain the current entry.
  useEffect(() => {
    if (!loopMode || loopMode.kind !== "timeline") return;

    const { ids, index } = loopMode;
    if (!ids.length) {
      setLoopMode(null);
      return;
    }

    if (index >= ids.length) {
      // Finished the loop
      setLoopMode(null);
      return;
    }

    const currentId = ids[index];
    setFocusTarget(currentId);

    let cancelled = false;

    // Let the avatar explain the currently focused timeline entry
    (async () => {
      // Find the timeline and this specific entry for a better prompt
      const timelineWidget = currentScreen.widgets.find(
        (w) => w.type === "timeline"
      ) as TimelineWidget | undefined;

      const entry = timelineWidget?.entries.find((e) => e.id === currentId);

      const userMessage = entry
        ? `Explain the CV timeline entry titled "${entry.title}" (${entry.period}) in 2–3 sentences for the visitor.`
        : `Explain the CV timeline entry with id "${currentId}" in 2–3 sentences for the visitor.`;

      setAvatarThinking(true);
      try {
        const avatar = await callAvatar(userMessage, currentScreen, history, {
          systemPrompt:
            "The UI is automatically looping through timeline entries; describe the currently highlighted one in 2–3 sentences.",
        });

        if (!cancelled && avatar?.narration) {
          setAvatarNarration(avatar.narration);
        }
      } finally {
        // Always stop the spinner for this step, even if cancelled
        setAvatarThinking(false);
      }
    })();

    // Go to the next entry after a delay
    const handle = window.setTimeout(() => {
      setLoopMode((prev) => {
        if (!prev || prev.kind !== "timeline") return prev;
        if (prev.index >= prev.ids.length - 1) {
          return null; // finished
        }
        return { ...prev, index: prev.index + 1 };
      });
    }, 8000); // ~8s per entry so there’s time to read

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [loopMode, currentScreen, history]);

  // --- button clicks from the CDUI screen (right column) ---
  const handleAction = (actionId: string) => {
    if (actionId === "download_cv") {
      alert("This will trigger a real CV download in a later version.");
      return;
    }

    console.log("Unhandled action:", actionId);
  };

  // --- main command handler for the chat input ---
  const handleCommand = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Any new command cancels an active loop
    setLoopMode(null);

    const intent: Intent = parseIntent(trimmed);
    const current = currentScreen;

    // GO BACK locally
    if (intent.type === "GO_BACK") {
      const prevHistory =
        history.length > 1 ? history.slice(0, history.length - 1) : history;

      setHistory(prevHistory);
      setSystemPrompt("Went back to the previous view.");
      setChatInput("");
      setFocusTarget(null);

      setAvatarThinking(true);
      try {
        const avatar = await callAvatar(trimmed, current, prevHistory, {
          systemPrompt: "User navigated back to previous view.",
        });
        if (avatar?.narration) {
          setAvatarNarration(avatar.narration);
        }
        if (avatar?.focusTarget) {
          setFocusTarget(avatar.focusTarget);
        }
      } finally {
        setAvatarThinking(false);
      }
      return;
    }

    // SHOW_CV should always push the dedicated CV screen (dev + prod)
    if (intent.type === "SHOW_CV") {
      const nextScreen = cvScreen;
      const newHistory = [...history, nextScreen];

      setHistory(newHistory);
      setSystemPrompt(
        "Showing CV overview. You can ask for details or another view."
      );
      setChatInput("");
      setFocusTarget(null);

      setAvatarThinking(true);
      try {
        const avatar = await callAvatar(trimmed, nextScreen, newHistory, {
          systemPrompt: "User requested the CV view.",
        });
        if (avatar?.narration) {
          setAvatarNarration(avatar.narration);
        }
        if (avatar?.focusTarget) {
          setFocusTarget(avatar.focusTarget);
        }
      } finally {
        setAvatarThinking(false);
      }
      return;
    }

    // SHOW_PROJECTS / SHOW_ANY_PROJECTS:
    // always handled by the local rule engine, even in prod
    if (intent.type === "SHOW_PROJECTS" || intent.type === "SHOW_ANY_PROJECTS") {
      setAvatarThinking(true);

      let nextScreen: ScreenDescription = current;
      let newHistory = history;
      let compilerSystemPrompt: string | undefined;

      const result = decideFromText(trimmed, history);

      if (result.kind === "push") {
        nextScreen = result.screen;
        newHistory = [...history, result.screen];
        setHistory(newHistory);
        compilerSystemPrompt = result.systemPrompt;
        if (result.systemPrompt) setSystemPrompt(result.systemPrompt);
      } else {
        compilerSystemPrompt = result.systemPrompt;
        if (result.systemPrompt) setSystemPrompt(result.systemPrompt);
      }

      setChatInput("");
      setFocusTarget(null);

      try {
        const avatar = await callAvatar(trimmed, nextScreen, newHistory, {
          systemPrompt: compilerSystemPrompt,
        });
        if (avatar?.narration) {
          setAvatarNarration(avatar.narration);
        }
        if (avatar?.focusTarget) {
          setFocusTarget(avatar.focusTarget);
        }
      } finally {
        setAvatarThinking(false);
      }

      return;
    }

    // LOOP_TIMELINE: automatic walkthrough of current timeline (no brain)
    if (intent.type === "LOOP_TIMELINE") {
      const timelineWidget = current.widgets.find(
        (w) => w.type === "timeline"
      ) as TimelineWidget | undefined;

      if (!timelineWidget || !timelineWidget.entries.length) {
        setSystemPrompt("There is no timeline on this view to loop through.");
        setChatInput("");
        setFocusTarget(null);

        setAvatarThinking(true);
        try {
          const avatar = await callAvatar(trimmed, current, history, {
            systemPrompt:
              "User requested a loop-through, but there is no timeline on this screen.",
          });
          if (avatar?.narration) {
            setAvatarNarration(avatar.narration);
          }
        } finally {
          setAvatarThinking(false);
        }
        return;
      }

      const ids = timelineWidget.entries.map((e) => e.id);
      setLoopMode({
        kind: "timeline",
        ids,
        index: 0,
      });
      setChatInput("");

      // Intro explanation: what the loop is doing (one-time)
      setAvatarThinking(true);
      try {
        const avatar = await callAvatar(
          "The user asked to go through the CV timeline entries one by one. Explain that the interface will highlight each entry in sequence and briefly describe them.",
          current,
          history,
          {
            systemPrompt:
              "User requested an automatic loop through the timeline. Explain that each entry will be highlighted and described in turn.",
          }
        );
        if (avatar?.narration) {
          setAvatarNarration(avatar.narration);
        }
      } finally {
        setAvatarThinking(false);
      }

      return;
    }

    // from here on: compiler + avatar (mutations on current screen)
    setAvatarThinking(true);

    let compilerSystemPrompt: string | undefined;
    let compilerMutations: ScreenMutation[] | undefined;
    let screenAfterCompiler: ScreenDescription = current;

    // --- compiler path ---
    if (!IS_PROD) {
      // local rule-based AI
      const result = decideFromText(trimmed, history);

      if (result.kind === "push") {
        compilerSystemPrompt = result.systemPrompt;
        screenAfterCompiler = result.screen;
        setHistory((prev) => [...prev, result.screen]);
        if (result.systemPrompt) setSystemPrompt(result.systemPrompt);
      } else {
        compilerSystemPrompt = result.systemPrompt;
        setSystemPrompt(result.systemPrompt);
      }
    } else {
      // OpenAI brain
      const brain = await callBrain(trimmed, current, history);

      if (!brain) {
        console.warn("Brain returned null, falling back to local AI.");
        const result = decideFromText(trimmed, history);

        if (result.kind === "push") {
          compilerSystemPrompt = result.systemPrompt;
          screenAfterCompiler = result.screen;
          setHistory((prev) => [...prev, result.screen]);
          if (result.systemPrompt) setSystemPrompt(result.systemPrompt);
        } else {
          compilerSystemPrompt = result.systemPrompt;
          setSystemPrompt(result.systemPrompt);
        }
      } else {
        compilerSystemPrompt = brain.systemPrompt;
        const mutations = (brain.mutations ?? []) as ScreenMutation[];
        compilerMutations = mutations;

        let nextScreen = current;
        for (const m of mutations) {
          nextScreen = applyMutation(nextScreen, m);
        }
        screenAfterCompiler = nextScreen;

        if (nextScreen !== current) {
          setHistory((prev) => [...prev, nextScreen]);
        }
        if (brain.systemPrompt) {
          setSystemPrompt(brain.systemPrompt);
        }
      }
    }

    setChatInput("");

    // --- avatar narration ---
    try {
      const avatar = await callAvatar(trimmed, screenAfterCompiler, history, {
        systemPrompt: compilerSystemPrompt,
        mutations: compilerMutations,
      });

      if (avatar?.narration) {
        setAvatarNarration(avatar.narration);
      }
      if (avatar?.focusTarget) {
        setFocusTarget(avatar.focusTarget);
      }
    } finally {
      setAvatarThinking(false);
    }
  };

  const handleChatSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    void handleCommand(chatInput);
  };

  return (
    <div className="app-shell">
      {/* Avatar + talk button pinned on the left */}
      <div className="avatar-column">
        <div className="avatar-panel">
          <div className="avatar-header">
            <span
              className="avatar-icon"
              role="img"
              aria-label="Interface avatar"
            >
              🤖
            </span>
            <div>
              <div className="avatar-title">Interface avatar</div>
              <div className="avatar-subtitle">
                {avatarThinking
                  ? "Thinking about how to reshape the interface..."
                  : "Ask me how to explore Admir’s work."}
              </div>
            </div>
          </div>

          <div className="avatar-body">
            {avatarNarration ?? (
              <span>
                I am the Conversationally-Driven UI (CDUI) avatar. Tell me what
                you want to see, and I’ll help this interface adapt.
              </span>
            )}
          </div>
        </div>

        {/* TALK BUTTON UNDER THE AVATAR CARD */}
        <div className="avatar-talk-wrapper">
          <button
            type="button"
            className="avatar-talk-button"
            onClick={() => setShowChat(true)}
          >
            Talk to the interface
          </button>
        </div>
      </div>

      {/* Main UI region (right side) */}
      <div className="ui-region">
        <div className="ui-fullscreen">
          <ScreenRenderer
            screen={currentScreen}
            onAction={handleAction}
            focusTarget={focusTarget}
          />
        </div>
      </div>

      {/* Chat dock at the bottom */}
      <div
        className={`chat-dock ${
          showChat ? "chat-dock-visible" : "chat-dock-hidden"
        }`}
      >
        <div className="chat-box">
          <p className="chat-label">Interface</p>
          <p className="chat-system">{systemPrompt}</p>

          <form onSubmit={handleChatSubmit} className="chat-form">
            <input
              className="chat-input"
              placeholder="Describe how you want the interface to change..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
            />
            <div className="chat-buttons">
              <button type="submit">Commit change</button>
              <button
                type="button"
                onClick={() => {
                  setShowChat(false);
                  setChatInput("");
                  setLoopMode(null);
                }}
              >
                Close chat
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default App;
