// src/App.tsx
import {
  loadSession,
  markScreen,
  getPersonaPreference,
  setPersonaPreference,
  type PersonaPreference,
} from "./cdui/session";

import React, { useEffect, useMemo, useRef, useState } from "react";
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

import {
  RealtimeVoiceClient,
  type RealtimeVoiceStatus,
} from "./cdui/voice/realtimeVoice";

const IS_PROD = import.meta.env.PROD;

type LoopMode =
  | {
      kind: "timeline";
      ids: string[];
      index: number;
    }
  | null;

type InteractionMode = "chooser" | "text" | "voice";

function App() {
  // --- session context (per visitor) ---
  const [session, setSession] = useState(() => loadSession());

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

  // Interaction mode: before first choice we’re in "chooser"
  const [mode, setMode] = useState<InteractionMode>("chooser");

  // Has the UI "woken up" and slid left / rendered main screen?
  const [hasActivatedUI, setHasActivatedUI] = useState(false);

  // Current persona preference derived from the session
  const personaPref: PersonaPreference = getPersonaPreference(session);

  const handlePersonaChange = (pref: PersonaPreference) => {
    setSession((prev) => setPersonaPreference(prev, pref));
  };

  const isIntro = !hasActivatedUI;

  // --- voice (realtime) state ---
  const [voiceStatus, setVoiceStatus] = useState<RealtimeVoiceStatus>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const voiceClientRef = useRef<RealtimeVoiceClient | null>(null);

  const voiceClient = useMemo(() => {
    // Create once per App lifecycle
    const client = new RealtimeVoiceClient({
      onStatus: setVoiceStatus,
      onEvent: (evt) => {
        // Optional: surface transcripts / state as “narration”
        // Realtime GA uses response.output_audio_transcript.delta events for transcript deltas
        if (
          evt?.type === "response.output_audio_transcript.delta" &&
          typeof evt.delta === "string"
        ) {
          setAvatarNarration((prev) => (prev ? prev + evt.delta : evt.delta));
        }
        // You can also listen for: response.output_audio_transcript.done, etc.
      },
    });
    return client;
  }, []);

  useEffect(() => {
    voiceClientRef.current = voiceClient;
    return () => {
      void voiceClient.disconnect();
      voiceClientRef.current = null;
    };
  }, [voiceClient]);

  async function startVoice() {
    setVoiceError(null);
    setAvatarNarration(null);

    try {
      // Get client secret from your server (keeps OPENAI_API_KEY off the client)
      const r = await fetch("/api/realtimeToken", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await r.json();
      if (!r.ok || !data?.clientSecret) {
        throw new Error(
          `Failed to fetch realtime token: ${r.status} ${JSON.stringify(data)}`
        );
      }

      await voiceClient.connect(data.clientSecret);

      // Optional: set default behavior (turn-taking / style) after connect
      // voiceClient.sendEvent({
      //   type: "session.update",
      //   session: {
      //     type: "realtime",
      //     instructions: "Speak naturally. Ask short clarifying questions.",
      //   },
      // });
    } catch (e: any) {
      setVoiceError(String(e?.message ?? e));
      setVoiceStatus("error");
    }
  }

  async function stopVoice() {
    setVoiceError(null);
    await voiceClient.disconnect();
  }

  // ✅ SAFETY: if we leave voice mode, ensure we disconnect
  useEffect(() => {
    if (mode !== "voice") {
      void stopVoice();
    }
    // intentionally only depends on mode
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Mark every visited screen in the session
  useEffect(() => {
    setSession((prev) => markScreen(prev, currentScreen.screenId));
  }, [currentScreen.screenId]);

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
      setLoopMode(null);
      return;
    }

    const currentId = ids[index];
    setFocusTarget(currentId);

    let cancelled = false;

    (async () => {
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
          session,
        });

        if (!cancelled && avatar?.narration) {
          setAvatarNarration(avatar.narration);
        }
      } finally {
        setAvatarThinking(false);
      }
    })();

    const handle = window.setTimeout(() => {
      setLoopMode((prev) => {
        if (!prev || prev.kind !== "timeline") return prev;
        if (prev.index >= prev.ids.length - 1) {
          return null;
        }
        return { ...prev, index: prev.index + 1 };
      });
    }, 8000);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [loopMode, currentScreen, history, session]);

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

    setLoopMode(null);

    // First real command: wake up the UI and slide avatar left
    if (!hasActivatedUI) {
      setHasActivatedUI(true);
    }

    const intent: Intent = parseIntent(trimmed);
    const current = currentScreen;

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
          session,
        });
        if (avatar?.narration) setAvatarNarration(avatar.narration);
        if (avatar?.focusTarget) setFocusTarget(avatar.focusTarget);
      } finally {
        setAvatarThinking(false);
      }
      return;
    }

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
          session,
        });
        if (avatar?.narration) setAvatarNarration(avatar.narration);
        if (avatar?.focusTarget) setFocusTarget(avatar.focusTarget);
      } finally {
        setAvatarThinking(false);
      }
      return;
    }

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
          session,
        });
        if (avatar?.narration) setAvatarNarration(avatar.narration);
        if (avatar?.focusTarget) setFocusTarget(avatar.focusTarget);
      } finally {
        setAvatarThinking(false);
      }

      return;
    }

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
            session,
          });
          if (avatar?.narration) setAvatarNarration(avatar.narration);
        } finally {
          setAvatarThinking(false);
        }
        return;
      }

      const ids = timelineWidget.entries.map((e) => e.id);
      setLoopMode({ kind: "timeline", ids, index: 0 });
      setChatInput("");

      setAvatarThinking(true);
      try {
        const avatar = await callAvatar(
          "The user asked to go through the CV timeline entries one by one. Explain that the interface will highlight each entry in sequence and briefly describe them.",
          current,
          history,
          {
            systemPrompt:
              "User requested an automatic loop through the timeline. Explain that each entry will be highlighted and described in turn.",
            session,
          }
        );
        if (avatar?.narration) setAvatarNarration(avatar.narration);
      } finally {
        setAvatarThinking(false);
      }

      return;
    }

    setAvatarThinking(true);

    let compilerSystemPrompt: string | undefined;
    let compilerMutations: ScreenMutation[] | undefined;
    let screenAfterCompiler: ScreenDescription = current;

    if (!IS_PROD) {
      const result = decideFromText(trimmed, history);

      if (result.kind === "push") {
        compilerSystemPrompt = result.systemPrompt;
        screenAfterCompiler = result.screen;
        setHistory((prev) => [...prev, screenAfterCompiler]);
        if (result.systemPrompt) setSystemPrompt(result.systemPrompt);
      } else {
        compilerSystemPrompt = result.systemPrompt;
        setSystemPrompt(result.systemPrompt);
      }
    } else {
      const brain = await callBrain(trimmed, current, history);

      if (!brain) {
        console.warn("Brain returned null, falling back to local AI.");
        const result = decideFromText(trimmed, history);

        if (result.kind === "push") {
          compilerSystemPrompt = result.systemPrompt;
          screenAfterCompiler = result.screen;
          setHistory((prev) => [...prev, screenAfterCompiler]);
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
        if (brain.systemPrompt) setSystemPrompt(brain.systemPrompt);
      }
    }

    setChatInput("");

    try {
      const avatar = await callAvatar(trimmed, screenAfterCompiler, history, {
        systemPrompt: compilerSystemPrompt,
        mutations: compilerMutations,
        session,
      });

      if (avatar?.narration) setAvatarNarration(avatar.narration);
      if (avatar?.focusTarget) setFocusTarget(avatar.focusTarget);
    } finally {
      setAvatarThinking(false);
    }
  };

  const handleChatSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    void handleCommand(chatInput);
  };

  // --- handlers for the initial mode choice ---
  const handleSelectText = () => {
    setMode("text");
    setShowChat(true);
  };

  // ✅ FIX: selecting voice should start voice immediately
  const handleSelectVoice = () => {
    setMode("voice");
    setShowChat(false);

    if (!hasActivatedUI) setHasActivatedUI(true);
    void startVoice();
  };

  return (
    <div className={`app-shell ${isIntro ? "app-intro" : "app-active"}`}>
      {/* Avatar + controls column */}
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

          {/* Voice status (only when in voice mode, to avoid clutter) */}
          {!isIntro && mode === "voice" && (
            <div
              style={{
                marginTop: "0.75rem",
                fontSize: "0.85rem",
                color: "#334155",
              }}
            >
              <div>
                <strong>Voice:</strong> {voiceStatus}
              </div>
              {voiceError && (
                <div style={{ marginTop: "0.35rem", color: "#b91c1c" }}>
                  {voiceError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* INTRO chooser */}
        {isIntro ? (
          <div className="avatar-mode-chooser">
            <button
              type="button"
              className="avatar-mode-button"
              onClick={handleSelectVoice}
            >
              🎙️ Talk to me
            </button>
            <button
              type="button"
              className="avatar-mode-button"
              onClick={handleSelectText}
            >
              ✍️ Write to me
            </button>
          </div>
        ) : (
          <>
            {/* Persona style toggle */}
            <div className="avatar-persona">
              <span className="avatar-persona-label">Avatar style</span>
              <div className="avatar-persona-buttons">
                <button
                  type="button"
                  className={`avatar-persona-button ${
                    personaPref === "balanced" ? "is-active" : ""
                  }`}
                  onClick={() => handlePersonaChange("balanced")}
                >
                  Balanced
                </button>
                <button
                  type="button"
                  className={`avatar-persona-button ${
                    personaPref === "concise" ? "is-active" : ""
                  }`}
                  onClick={() => handlePersonaChange("concise")}
                >
                  Concise
                </button>
                <button
                  type="button"
                  className={`avatar-persona-button ${
                    personaPref === "detailed" ? "is-active" : ""
                  }`}
                  onClick={() => handlePersonaChange("detailed")}
                >
                  Detailed
                </button>
              </div>
            </div>

            {/* Mode switcher: show opposite */}
            <div className="avatar-mode-switcher">
              {mode === "voice" ? (
                <button
                  type="button"
                  className="avatar-mode-switcher-button"
                  onClick={() => {
                    setMode("text");
                    setShowChat(true);
                    void stopVoice();
                  }}
                >
                  Switch to typing instead
                </button>
              ) : (
                <button
                  type="button"
                  className="avatar-mode-switcher-button"
                  onClick={() => {
                    setMode("voice");
                    setShowChat(false);

                    // ✅ FIX: switching to voice should start voice immediately
                    if (!hasActivatedUI) setHasActivatedUI(true);
                    void startVoice();
                  }}
                >
                  Switch to talking instead
                </button>
              )}
            </div>

            {/* Voice controls (real conversation) */}
            {mode === "voice" && (
              <div className="avatar-talk-wrapper">
                {voiceStatus !== "connected" ? (
                  <button
                    type="button"
                    className="avatar-talk-button"
                    onClick={() => {
                      // Starting voice counts as “activation” because the user is now interacting
                      if (!hasActivatedUI) setHasActivatedUI(true);
                      void startVoice();
                    }}
                  >
                    Start voice conversation
                  </button>
                ) : (
                  <button
                    type="button"
                    className="avatar-talk-button"
                    onClick={() => void stopVoice()}
                  >
                    Stop voice conversation
                  </button>
                )}
              </div>
            )}

            {/* Text talk button only in text mode */}
            {mode === "text" && (
              <div className="avatar-talk-wrapper">
                <button
                  type="button"
                  className="avatar-talk-button"
                  onClick={() => setShowChat(true)}
                >
                  Talk to the interface
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Main UI region (right side) – only after first real interaction */}
      {hasActivatedUI && (
        <div className="ui-region">
          <div className="ui-fullscreen">
            <ScreenRenderer
              screen={currentScreen}
              onAction={handleAction}
              focusTarget={focusTarget}
            />
          </div>
        </div>
      )}

      {/* Chat dock (text mode only) */}
      <div
        className={`chat-dock ${
          showChat && mode === "text" ? "chat-dock-visible" : "chat-dock-hidden"
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
