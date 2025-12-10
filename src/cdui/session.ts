// Lightweight session memory stored locally (GDPR-friendly)

export interface SessionContext {
  visits: number;
  lastVisit: number;
  screensViewed: Record<string, number>;
  lastFocus: string | null;
  personaHints: string[];
}

const KEY = "cdui_session";

export function loadSession(): SessionContext {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initSession();
    return JSON.parse(raw);
  } catch {
    return initSession();
  }
}

export function saveSession(ctx: SessionContext) {
  localStorage.setItem(KEY, JSON.stringify(ctx));
}

function initSession(): SessionContext {
  const base: SessionContext = {
    visits: 1,
    lastVisit: Date.now(),
    screensViewed: {},
    lastFocus: null,
    personaHints: [],
  };
  saveSession(base);
  return base;
}

export function markScreen(ctx: SessionContext, screenId: string): SessionContext {
  const count = ctx.screensViewed[screenId] ?? 0;
  const updated = {
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
