// src/App.tsx
import {
  loadSession,
  markScreen,
  getPersonaPreference,
  setPersonaPreference,
  setUILanguage,
  showLanguageSelection,
  type PersonaPreference,
} from "./cdui/session";

import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

import { ScreenRenderer } from "./cdui/components/ScreenRenderer";
import type { ScreenDescription, ScreenMutation, TimelineWidget } from "./cdui/types";
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
  | { kind: "timeline"; ids: string[]; index: number }
  | null;

type InteractionMode = "chooser" | "text" | "voice";

function App() {
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

  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const [loopMode, setLoopMode] = useState<LoopMode>(null);

  const [mode, setMode] = useState<InteractionMode>("chooser");
  const modeRef = useRef<InteractionMode>("chooser");
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const [hasActivatedUI, setHasActivatedUI] = useState(false);

  const personaPref: PersonaPreference = getPersonaPreference(session);

  const handlePersonaChange = (pref: PersonaPreference) => {
    setSession((prev) => setPersonaPreference(prev, pref));
  };

  const isIntro = !hasActivatedUI;

  const [voiceStatus, setVoiceStatus] = useState<RealtimeVoiceStatus>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const assistantSpeakingRef = useRef<boolean>(false);

  const voiceClientRef = useRef<RealtimeVoiceClient | null>(null);

  const handleCommandRef = useRef<((text: string) => Promise<string | null>) | null>(null);
  const lastVoiceCommandAtRef = useRef<number>(0);

  const speakFinalNarration = (text: string) => {
    if (modeRef.current !== "voice") return;
    if (!voiceClient.isConnected()) return;

    voiceClient.cancelResponse();
    assistantSpeakingRef.current = false;

    // We speak the final narration (already EN/DE), no extra prompting needed.
    voiceClient.sendEvent({
      type: "response.create",
      response: { instructions: text },
    });

    assistantSpeakingRef.current = true;
  };

  const extractFinalUserTranscript = (evt: any): string | null => {
    if (typeof evt?.transcript === "string" && evt.transcript.trim()) return evt.transcript.trim();
    const t = evt?.item?.content?.[0]?.transcript ?? evt?.item?.content?.transcript ?? null;
    if (typeof t === "string" && t.trim()) return t.trim();
    return null;
  };

  const voiceClient = useMemo(() => {
    const client = new RealtimeVoiceClient({
      onStatus: setVoiceStatus,
      onEvent: (evt) => {
        console.log("[realtime evt]", evt);
        const evtType = typeof evt?.type === "string" ? evt.type : "";

        if (
          evtType === "response.created" ||
          evtType === "response.output_audio.delta" ||
          evtType === "response.output_audio_transcript.delta"
        ) {
          assistantSpeakingRef.current = true;
        }
        if (
          evtType === "response.completed" ||
          evtType === "response.done" ||
          evtType === "response.cancelled" ||
          evtType === "response.failed" ||
          evtType.startsWith("error")
        ) {
          assistantSpeakingRef.current = false;
        }

        if (evtType === "response.output_audio_transcript.delta" && typeof evt.delta === "string") {
          setAvatarNarration((prev) => (prev ? prev + evt.delta : evt.delta));
        }
        if (evtType === "response.output_audio_transcript.done" && typeof evt.transcript === "string") {
          setAvatarNarration(evt.transcript);
        }

        const now = Date.now();
        const canTrigger =
          modeRef.current === "voice" &&
          !!handleCommandRef.current &&
          now - lastVoiceCommandAtRef.current > 900;

        const isFinalUserTranscriptEvent =
          evtType === "conversation.item.input_audio_transcription.completed" ||
          evtType === "input_audio_transcription.completed" ||
          evtType.endsWith(".input_audio_transcription.completed");

        if (!canTrigger || !isFinalUserTranscriptEvent) return;

        const candidateText = extractFinalUserTranscript(evt);
        if (!candidateText) return;

        lastVoiceCommandAtRef.current = now;
        setSystemPrompt(`Heard: "${candidateText}"`);

        void (async () => {
          const narration = await handleCommandRef.current?.(candidateText);
          if (typeof narration === "string" && narration.trim().length > 0) {
            speakFinalNarration(narration.trim());
          }
        })();
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
    if (voiceClient.isConnected() || voiceClient.isConnecting()) return;

    setVoiceError(null);
    setAvatarNarration(null);

    try {
      const r = await fetch("/api/realtimeToken", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await r.json();
      if (!r.ok || !data?.clientSecret) {
        throw new Error(`Failed to fetch realtime token: ${r.status} ${JSON.stringify(data)}`);
      }

      await voiceClient.connect(data.clientSecret);

      // greet in the current UI language
      const greet =
        session.uiLanguage === "de"
          ? "Hallo! Du kannst sagen: zeig den Lebenslauf, zeig Projekte, oder geh die Timeline durch."
          : "Hello! You can say: show the CV, show projects, or loop the timeline.";
      speakFinalNarration(greet);
    } catch (e: any) {
      setVoiceError(String(e?.message ?? e));
      setVoiceStatus("error");
    }
  }

  async function stopVoice() {
    setVoiceError(null);
    await voiceClient.disconnect();
    assistantSpeakingRef.current = false;
  }

  useEffect(() => {
    if (mode !== "voice") void stopVoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    setSession((prev) => markScreen(prev, currentScreen.screenId));
  }, [currentScreen.screenId]);

  useEffect(() => {
    if (!loopMode || loopMode.kind !== "timeline") return;

    const { ids, index } = loopMode;
    if (!ids.length || index >= ids.length) {
      setLoopMode(null);
      return;
    }

    const currentId = ids[index];
    setFocusTarget(currentId);

    let cancelled = false;

    (async () => {
      const timelineWidget = currentScreen.widgets.find((w) => w.type === "timeline") as
        | TimelineWidget
        | undefined;

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
          if (modeRef.current === "voice" && voiceClient.isConnected()) {
            speakFinalNarration(avatar.narration);
          }
        }
      } finally {
        setAvatarThinking(false);
      }
    })();

    const handle = window.setTimeout(() => {
      setLoopMode((prev) => {
        if (!prev || prev.kind !== "timeline") return prev;
        if (prev.index >= prev.ids.length - 1) return null;
        return { ...prev, index: prev.index + 1 };
      });
    }, 8000);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [loopMode, currentScreen, history, session, voiceClient]);

  const handleAction = (actionId: string) => {
    if (actionId === "download_cv") {
      alert("This will trigger a real CV download in a later version.");
      return;
    }
    console.log("Unhandled action:", actionId);
  };

  const isStopPhrase = (s: string) => {
    const t = s.trim().toLowerCase();
    return t === "stop" || t === "cancel" || t === "halt" || t === "be quiet" || t === "shut up" || t === "silence";
  };

  const cancelVoiceOutputIfNeeded = () => {
    if (modeRef.current !== "voice") return;
    if (!voiceClient.isConnected()) return;

    if (assistantSpeakingRef.current) {
      voiceClient.cancelResponse();
      assistantSpeakingRef.current = false;
    }
  };

  const handleCommand = async (text: string): Promise<string | null> => {
    const trimmed = text.trim();
    if (!trimmed) return null;

    let narrationToReturn: string | null = null;

    if (!hasActivatedUI) setHasActivatedUI(true);

    cancelVoiceOutputIfNeeded();

    if (isStopPhrase(trimmed)) {
      setLoopMode(null);
      setAvatarThinking(false);
      setAvatarNarration(null);
      setSystemPrompt("Stopped.");

      if (modeRef.current === "voice" && voiceClient.isConnected()) {
        voiceClient.cancelResponse();
        assistantSpeakingRef.current = false;
      }
      return null;
    }

    setLoopMode(null);

    const intent: Intent = parseIntent(trimmed);

    // ✅ Language picker (hidden until asked)
    if (intent.type === "SHOW_LANGUAGE_SELECTION") {
      setSession((prev) => showLanguageSelection(prev, true));
      const msg =
        session.uiLanguage === "de"
          ? "Sprachauswahl geöffnet. Wähle Deutsch oder English."
          : "Language selection opened. Choose English or Deutsch.";
      setSystemPrompt(msg);
      setAvatarNarration(msg);
      return msg;
    }

    if (intent.type === "SET_LANGUAGE_EN") {
      setSession((prev) => setUILanguage(showLanguageSelection(prev, false), "en"));
      const msg = "Language set to English.";
      setSystemPrompt(msg);
      setAvatarNarration(msg);
      return msg;
    }

    if (intent.type === "SET_LANGUAGE_DE") {
      setSession((prev) => setUILanguage(showLanguageSelection(prev, false), "de"));
      const msg = "Sprache auf Deutsch eingestellt.";
      setSystemPrompt(msg);
      setAvatarNarration(msg);
      return msg;
    }

    const current = currentScreen;

    if (intent.type === "GO_BACK") {
      const prevHistory = history.length > 1 ? history.slice(0, history.length - 1) : history;

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
        if (avatar?.narration) {
          narrationToReturn = avatar.narration;
          setAvatarNarration(avatar.narration);
        }
        if (avatar?.focusTarget) setFocusTarget(avatar.focusTarget);
      } finally {
        setAvatarThinking(false);
      }
      return narrationToReturn;
    }

    if (intent.type === "SHOW_CV") {
      const nextScreen = cvScreen;
      const newHistory = [...history, nextScreen];

      setHistory(newHistory);
      setSystemPrompt("Showing CV overview. You can ask for details.");
      setChatInput("");
      setFocusTarget(null);

      setAvatarThinking(true);
      try {
        const avatar = await callAvatar(trimmed, nextScreen, newHistory, {
          systemPrompt: "User requested the CV view.",
          session,
        });
        if (avatar?.narration) {
          narrationToReturn = avatar.narration;
          setAvatarNarration(avatar.narration);
        }
        if (avatar?.focusTarget) setFocusTarget(avatar.focusTarget);
      } finally {
        setAvatarThinking(false);
      }
      return narrationToReturn;
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
        if (avatar?.narration) {
          narrationToReturn = avatar.narration;
          setAvatarNarration(avatar.narration);
        }
        if (avatar?.focusTarget) setFocusTarget(avatar.focusTarget);
      } finally {
        setAvatarThinking(false);
      }

      return narrationToReturn;
    }

    if (intent.type === "LOOP_TIMELINE") {
      const timelineWidget = current.widgets.find((w) => w.type === "timeline") as TimelineWidget | undefined;

      if (!timelineWidget || !timelineWidget.entries.length) {
        setSystemPrompt("There is no timeline on this view to loop through.");
        setChatInput("");
        setFocusTarget(null);

        setAvatarThinking(true);
        try {
          const avatar = await callAvatar(trimmed, current, history, {
            systemPrompt: "User requested a loop-through, but there is no timeline on this screen.",
            session,
          });
          if (avatar?.narration) {
            narrationToReturn = avatar.narration;
            setAvatarNarration(avatar.narration);
          }
        } finally {
          setAvatarThinking(false);
        }
        return narrationToReturn;
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
        if (avatar?.narration) {
          narrationToReturn = avatar.narration;
          setAvatarNarration(avatar.narration);
        }
      } finally {
        setAvatarThinking(false);
      }

      return narrationToReturn;
    }

    // default path (brain/local + avatar)
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
        for (const m of mutations) nextScreen = applyMutation(nextScreen, m);
        screenAfterCompiler = nextScreen;

        if (nextScreen !== current) setHistory((prev) => [...prev, nextScreen]);
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

      if (avatar?.narration) {
        narrationToReturn = avatar.narration;
        setAvatarNarration(avatar.narration);
      }
      if (avatar?.focusTarget) setFocusTarget(avatar.focusTarget);
    } finally {
      setAvatarThinking(false);
    }

    return narrationToReturn;
  };

  useEffect(() => {
    handleCommandRef.current = handleCommand;
  }, [handleCommand]);

  const handleChatSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    void handleCommand(chatInput);
  };

  const handleSelectText = () => {
    setMode("text");
    setShowChat(true);
  };

  const handleSelectVoice = () => {
    setMode("voice");
    setShowChat(false);

    if (!hasActivatedUI) setHasActivatedUI(true);
    void startVoice();
  };

  return (
    <div className={`app-shell ${isIntro ? "app-intro" : "app-active"}`}>
      <div className="avatar-column">
        <div className="avatar-panel">
          <div className="avatar-header">
            <span className="avatar-icon" role="img" aria-label="Interface avatar">
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

          {/* ✅ Hidden language picker */}
          {session.showLanguagePicker && (
            <div style={{ marginTop: "0.65rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className="avatar-persona-button"
                onClick={() => {
                  setSession((prev) => setUILanguage(showLanguageSelection(prev, false), "en"));
                  setAvatarNarration("Language set to English.");
                  setSystemPrompt("Language set to English.");
                }}
              >
                English
              </button>
              <button
                type="button"
                className="avatar-persona-button"
                onClick={() => {
                  setSession((prev) => setUILanguage(showLanguageSelection(prev, false), "de"));
                  setAvatarNarration("Sprache auf Deutsch eingestellt.");
                  setSystemPrompt("Sprache auf Deutsch eingestellt.");
                }}
              >
                Deutsch
              </button>
            </div>
          )}

          <div className="avatar-body">
            {avatarNarration ?? (
              <span>
                I am the Conversationally-Driven UI (CDUI) avatar. Tell me what you want to see, and I’ll help this interface adapt.
              </span>
            )}
          </div>

          {!isIntro && mode === "voice" && (
            <div style={{ marginTop: "0.75rem", fontSize: "0.85rem", color: "#334155" }}>
              <div>
                <strong>Voice:</strong> {voiceStatus}
              </div>
              {voiceError && (
                <div style={{ marginTop: "0.35rem", color: "#b91c1c" }}>{voiceError}</div>
              )}
              {voiceStatus === "connected" && (
                <div style={{ marginTop: "0.35rem", color: "#64748b" }}>
                  Tip: say “stop” to interrupt voice output instantly.
                </div>
              )}
            </div>
          )}
        </div>

        {isIntro ? (
          <div className="avatar-mode-chooser">
            <button type="button" className="avatar-mode-button" onClick={handleSelectVoice}>
              🎙️ Talk to me
            </button>
            <button type="button" className="avatar-mode-button" onClick={handleSelectText}>
              ✍️ Write to me
            </button>
          </div>
        ) : (
          <>
            <div className="avatar-persona">
              <span className="avatar-persona-label">Avatar style</span>
              <div className="avatar-persona-buttons">
                <button
                  type="button"
                  className={`avatar-persona-button ${personaPref === "balanced" ? "is-active" : ""}`}
                  onClick={() => handlePersonaChange("balanced")}
                >
                  Balanced
                </button>
                <button
                  type="button"
                  className={`avatar-persona-button ${personaPref === "concise" ? "is-active" : ""}`}
                  onClick={() => handlePersonaChange("concise")}
                >
                  Concise
                </button>
                <button
                  type="button"
                  className={`avatar-persona-button ${personaPref === "detailed" ? "is-active" : ""}`}
                  onClick={() => handlePersonaChange("detailed")}
                >
                  Detailed
                </button>
              </div>
            </div>

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
                    if (!hasActivatedUI) setHasActivatedUI(true);
                    void startVoice();
                  }}
                >
                  Switch to talking instead
                </button>
              )}
            </div>

            {mode === "voice" && (
              <div className="avatar-talk-wrapper">
                {voiceStatus !== "connected" ? (
                  <button
                    type="button"
                    className="avatar-talk-button"
                    onClick={() => {
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
                    onClick={() => {
                      voiceClient.cancelResponse();
                      assistantSpeakingRef.current = false;
                      setSystemPrompt("Stopped voice output.");
                    }}
                  >
                    Stop speaking
                  </button>
                )}
              </div>
            )}

            {mode === "text" && (
              <div className="avatar-talk-wrapper">
                <button type="button" className="avatar-talk-button" onClick={() => setShowChat(true)}>
                  Talk to the interface
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {!isIntro && (
        <div className="ui-region">
          <div className="ui-fullscreen">
            <ScreenRenderer screen={currentScreen} onAction={handleAction} focusTarget={focusTarget} />
          </div>
        </div>
      )}

      <div className={`chat-dock ${showChat && mode === "text" ? "chat-dock-visible" : "chat-dock-hidden"}`}>
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
