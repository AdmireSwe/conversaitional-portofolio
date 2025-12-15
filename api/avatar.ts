// api/avatar.ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT_BASE = `
You are the CDUI avatar for Admir's conversational portfolio.

==============================
LANGUAGE RULE (CRITICAL)
==============================
Allowed languages: ONLY English or German.

You will receive sessionContext.uiLanguage ("en" or "de").
- If sessionContext.uiLanguage is present, ALWAYS respond in that language.
- Otherwise, pick English unless the user clearly speaks German.

Never respond in any other language.

==============================
CRITICAL VOICE / POV RULE
==============================
- You are speaking to a VISITOR of the portfolio site.
- Refer to Admir in THIRD PERSON ("Admir", "he", "his work").
- NEVER address the visitor as "Admir".
- NEVER claim you (the avatar) have a CV, projects, education, jobs, or personal history.
- Always describe what is ON SCREEN / in factsText:
  "This CV view shows..." / "On this screen, you can see..." / "Admir's timeline includes..."

==============================
ROLE & OUTPUT CONTRACT
==============================
You do NOT change the UI.
You ONLY narrate and explain what is happening, based on the context the frontend sends you.

Return ONLY a JSON object:

{
  "narration": "<1-4 short sentences>",
  "intentSummary": "<short technical summary>",
  "focusTarget": "<id or null>",
  "tone": "neutral | curious | excited | warning"
}

Persona rules:
- pref_concise: 1–2 sentences
- pref_detailed: 3–5 sentences
- otherwise: 2–3 sentences

Scope:
Portfolio topics only. Refuse anything else.

Fallback:
If unclear, ask what portfolio section to open (CV/projects/timeline/skills).
`;

function buildFactsOnlyBlock() {
  return `
-----------------------------
FACTS-ONLY MODE (STRICT)
-----------------------------
factsText is the ONLY allowed source of factual claims.

Rules:
- Do NOT invent or guess any facts.
- If a detail is missing, say you don't have it in the portfolio data.
- Do NOT talk about yourself (no "as an AI", no "I don't have a CV").
- Describe Admir's portfolio UI only.
`;
}

function normalizeText(s: unknown) {
  return typeof s === "string" ? s.trim() : "";
}

function isStopIntent(userMessage: string) {
  const t = userMessage.trim().toLowerCase();
  return (
    t === "stop" ||
    t === "stopp" ||
    t === "cancel" ||
    t === "pause" ||
    t === "silence" ||
    t === "shut up" ||
    t === "be quiet" ||
    t.includes("stop talking") ||
    t.includes("cancel that") ||
    t.includes("pause that")
  );
}

function collectAllowedFocusTargets(currentScreen: any): string[] {
  const ids: string[] = [];
  const pushIfString = (v: any) => {
    if (typeof v === "string" && v.trim()) ids.push(v.trim());
  };

  pushIfString(currentScreen?.screenId);
  pushIfString(currentScreen?.id);

  const widgets = Array.isArray(currentScreen?.widgets) ? currentScreen.widgets : [];
  for (const w of widgets) {
    pushIfString(w?.id);

    const entries =
      (Array.isArray(w?.entries) && w.entries) ||
      (Array.isArray(w?.items) && w.items) ||
      (Array.isArray(w?.projects) && w.projects) ||
      (Array.isArray(w?.cards) && w.cards) ||
      (Array.isArray(w?.sections) && w.sections) ||
      [];

    for (const e of entries) {
      pushIfString(e?.id);
      if (Array.isArray(e?.items)) for (const ee of e.items) pushIfString(ee?.id);
    }
  }

  return Array.from(new Set(ids));
}

/**
 * Deterministic safety net:
 * If the model slips into "I don't have a CV / I'm an AI assistant",
 * overwrite narration with a correct portfolio-centric phrasing.
 */
function sanitizeNarration(narration: string, uiLanguage: "en" | "de"): string {
  const n = narration.trim();
  if (!n) return n;

  const badPatterns: RegExp[] = [
    /\bas an ai\b/i,
    /\bi am an ai\b/i,
    /\bi[' ]?m (a )?(virtual )?assistant\b/i,
    /\bi (do not|don't) have (a|my) (cv|resume)\b/i,
    /\bno cv\b/i,
    /\bmy cv\b/i,
    /\bmy projects\b/i,
  ];

  const hit = badPatterns.some((rx) => rx.test(n));
  if (!hit) return n;

  return uiLanguage === "de"
    ? "Diese Ansicht zeigt Admirs Lebenslauf bzw. seine Timeline. Du kannst eine Timeline-Station anklicken oder sagen: „Geh die Timeline durch“."
    : "This view shows Admir’s CV and timeline. You can click a timeline entry, or say: “loop the timeline” to get a guided walkthrough.";
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }

  const { text, currentScreen, history, compilerContext, portfolioContext, factsPack, strictFactsOnly } =
    req.body ?? {};

  const userMessage = normalizeText(text);

  if (!userMessage || !currentScreen) {
    res.status(400).json({ error: "Missing 'text' or 'currentScreen' in request body." });
    return;
  }

  // deterministic stop
  if (isStopIntent(userMessage)) {
    // localize using session language if present
    const uiLang = compilerContext?.session?.uiLanguage === "de" ? "de" : "en";
    res.status(200).json({
      narration: uiLang === "de" ? "Okay — ich stoppe." : "Okay — stopping.",
      intentSummary: "stop_requested",
      focusTarget: null,
      tone: "neutral",
    });
    return;
  }

  const historySummary = Array.isArray(history) ? history.map((s: any) => s?.screenId ?? "unknown") : [];
  const sessionContext = compilerContext?.session ?? null;

  const allowedFocusTargets = collectAllowedFocusTargets(currentScreen);
  const factsText = normalizeText(factsPack?.factsText);

  const strict =
    typeof strictFactsOnly === "boolean" ? strictFactsOnly : factsText.length > 0;

  const systemPrompt = SYSTEM_PROMPT_BASE + (strict ? buildFactsOnlyBlock() : "");

  const payload = {
    userMessage,
    currentScreenMeta: {
      screenId: currentScreen?.screenId ?? null,
      title: currentScreen?.title ?? null,
    },
    historySummary,
    portfolioContext: portfolioContext ?? null,
    lastCompilerResult: {
      systemPrompt: compilerContext?.systemPrompt ?? null,
      mutationsCount: Array.isArray(compilerContext?.mutations) ? compilerContext.mutations.length : 0,
    },
    sessionContext,
    strictFactsOnly: strict,
    factsText: factsText || null,
    allowedFocusTargets,
  };

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: strict ? 0.2 : 0.5,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(payload) },
      ],
      max_tokens: 240,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";

    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch {}

    const uiLang: "en" | "de" = sessionContext?.uiLanguage === "de" ? "de" : "en";

    let narration = typeof parsed.narration === "string" ? parsed.narration : "";
    narration = sanitizeNarration(narration, uiLang);

    const intentSummary = typeof parsed.intentSummary === "string" ? parsed.intentSummary : "unspecified";

    let focusTarget: string | null = null;
    if (typeof parsed.focusTarget === "string") {
      const ft = parsed.focusTarget.trim();
      focusTarget = allowedFocusTargets.includes(ft) ? ft : null;
    } else if (parsed.focusTarget === null) {
      focusTarget = null;
    }

    const allowedTones = ["neutral", "curious", "excited", "warning"] as const;
    const tone: (typeof allowedTones)[number] =
      typeof parsed.tone === "string" && (allowedTones as readonly string[]).includes(parsed.tone)
        ? parsed.tone
        : "neutral";

    if (strict && !factsText) {
      res.status(200).json({
        narration:
          uiLang === "de"
            ? "Ich habe für diese Ansicht noch keine Portfolio-Daten. Sag „Zeig den Lebenslauf“ oder „Zeig Projekte“, dann beschreibe ich den Screen."
            : "I don’t have the portfolio data loaded for this view yet. Say “show the CV” or “show projects”, and I’ll describe what’s on screen.",
        intentSummary: "missing_factsText",
        focusTarget: null,
        tone: "warning",
      });
      return;
    }

    res.status(200).json({ narration, intentSummary, focusTarget, tone });
  } catch (err: any) {
    console.error("Avatar error:", err);
    res.status(500).json({ error: "Avatar failed", details: err?.message ?? "unknown" });
  }
}
