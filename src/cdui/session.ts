// src/cdui/session.ts
// Lightweight session memory stored locally (GDPR-friendly)

export type UILanguage = "en" | "de";

export interface SessionContext {
  visits: number;
  lastVisit: number;
  screensViewed: Record<string, number>;
  lastFocus: string | null;
  personaHints: string[];
  voiceEnabled: boolean;

  // NEW: language preference (only EN/DE)
  uiLanguage: UILanguage; // default "en"
  showLanguagePicker: boolean; // hidden until asked
}

export type PersonaPreference = "balanced" | "concise" | "detailed";

const KEY = "cdui_session";

function saveSession(ctx: SessionContext) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ctx));
  } catch {
    // ignore storage errors
  }
}

function freshSession(): SessionContext {
  return {
    visits: 1,
    lastVisit: Date.now(),
    screensViewed: {},
    lastFocus: null,
    personaHints: [],
    voiceEnabled: false,

    uiLanguage: "en",
    showLanguagePicker: false,
  };
}

/**
 * Load the session from localStorage and increment visits.
 */
export function loadSession(): SessionContext {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const initial = freshSession();
      saveSession(initial);
      return initial;
    }

    const stored = JSON.parse(raw) as Partial<SessionContext>;

    const normalized: SessionContext = {
      visits:
        typeof stored.visits === "number" && stored.visits >= 0
          ? stored.visits + 1
          : 1,
      lastVisit: Date.now(),
      screensViewed: stored.screensViewed ?? {},
      lastFocus: stored.lastFocus ?? null,
      personaHints: stored.personaHints ?? [],
      voiceEnabled: typeof stored.voiceEnabled === "boolean" ? stored.voiceEnabled : false,

      uiLanguage: stored.uiLanguage === "de" ? "de" : "en",
      showLanguagePicker: typeof stored.showLanguagePicker === "boolean" ? stored.showLanguagePicker : false,
    };

    saveSession(normalized);
    return normalized;
  } catch {
    const fallback = freshSession();
    saveSession(fallback);
    return fallback;
  }
}

export function markScreen(ctx: SessionContext, screenId: string): SessionContext {
  const count = ctx.screensViewed[screenId] ?? 0;

  const updated: SessionContext = {
    ...ctx,
    screensViewed: {
      ...ctx.screensViewed,
      [screenId]: count + 1,
    },
    lastFocus: screenId,
    lastVisit: Date.now(),
  };

  saveSession(updated);
  return updated;
}

export function getPersonaPreference(ctx: SessionContext): PersonaPreference {
  if (ctx.personaHints.includes("pref_concise")) return "concise";
  if (ctx.personaHints.includes("pref_detailed")) return "detailed";
  return "balanced";
}

export function setPersonaPreference(
  ctx: SessionContext,
  pref: PersonaPreference
): SessionContext {
  const baseHints = ctx.personaHints.filter((h) => !h.startsWith("pref_"));

  let newHints = baseHints;
  if (pref === "concise") newHints = [...baseHints, "pref_concise"];
  else if (pref === "detailed") newHints = [...baseHints, "pref_detailed"];

  const updated: SessionContext = {
    ...ctx,
    personaHints: newHints,
    lastVisit: Date.now(),
  };

  saveSession(updated);
  return updated;
}

// NEW: language controls
export function setUILanguage(ctx: SessionContext, lang: UILanguage): SessionContext {
  const updated: SessionContext = {
    ...ctx,
    uiLanguage: lang,
    lastVisit: Date.now(),
  };
  saveSession(updated);
  return updated;
}

export function showLanguageSelection(ctx: SessionContext, show: boolean): SessionContext {
  const updated: SessionContext = {
    ...ctx,
    showLanguagePicker: show,
    lastVisit: Date.now(),
  };
  saveSession(updated);
  return updated;
}
