// src/cdui/session.ts
// Lightweight session memory stored locally (GDPR-friendly)

export type PreferredLanguage = "en" | "de" | null;

export interface SessionContext {
  visits: number;
  lastVisit: number;
  screensViewed: Record<string, number>;
  lastFocus: string | null;
  personaHints: string[];
  voiceEnabled: boolean;

  // NEW: language preference for both text + voice outputs
  preferredLanguage: PreferredLanguage;
}

export type PersonaPreference = "balanced" | "concise" | "detailed";

const KEY = "cdui_session";

function saveSession(ctx: SessionContext) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ctx));
  } catch {
    // ignore storage errors (e.g. disabled storage)
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
    preferredLanguage: null,
  };
}

/**
 * Load the session from localStorage and
 * increment the visit counter on every load.
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
      voiceEnabled:
        typeof stored.voiceEnabled === "boolean" ? stored.voiceEnabled : false,
      preferredLanguage:
        stored.preferredLanguage === "en" || stored.preferredLanguage === "de"
          ? stored.preferredLanguage
          : null,
    };

    saveSession(normalized);
    return normalized;
  } catch {
    const fallback = freshSession();
    saveSession(fallback);
    return fallback;
  }
}

/**
 * Mark that a screen has been viewed. This updates:
 * - screensViewed[screenId]
 * - lastFocus
 * - lastVisit
 */
export function markScreen(
  ctx: SessionContext,
  screenId: string
): SessionContext {
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

/**
 * Map personaHints → a single preference flag for the UI.
 */
export function getPersonaPreference(ctx: SessionContext): PersonaPreference {
  if (ctx.personaHints.includes("pref_concise")) return "concise";
  if (ctx.personaHints.includes("pref_detailed")) return "detailed";
  return "balanced";
}

/**
 * Update personaHints based on a selected preference.
 * We keep other non-pref_* hints, but ensure only one pref_* entry exists.
 */
export function setPersonaPreference(
  ctx: SessionContext,
  pref: PersonaPreference
): SessionContext {
  const baseHints = ctx.personaHints.filter((h) => !h.startsWith("pref_"));

  let newHints = baseHints;

  if (pref === "concise") {
    newHints = [...baseHints, "pref_concise"];
  } else if (pref === "detailed") {
    newHints = [...baseHints, "pref_detailed"];
  }

  const updated: SessionContext = {
    ...ctx,
    personaHints: newHints,
    lastVisit: Date.now(),
  };

  saveSession(updated);
  return updated;
}

/** NEW: Preferred language helpers */
export function getPreferredLanguage(ctx: SessionContext): PreferredLanguage {
  return ctx.preferredLanguage ?? null;
}

export function setPreferredLanguage(
  ctx: SessionContext,
  lang: PreferredLanguage
): SessionContext {
  const updated: SessionContext = {
    ...ctx,
    preferredLanguage: lang,
    lastVisit: Date.now(),
  };
  saveSession(updated);
  return updated;
}
