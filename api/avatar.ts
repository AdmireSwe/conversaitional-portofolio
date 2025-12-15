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
You may ONLY respond in:
- English
- German

If the user's message is not clearly English or German, default to English.
If sessionContext.preferredLanguage is "de", respond in German.
If sessionContext.preferredLanguage is "en", respond in English.

Never use Swedish or any other language.
Do NOT explain which language you chose.
Do NOT translate unless the user explicitly asks.

==============================
CRITICAL VOICE / POV RULE
==============================
- You are speaking to a VISITOR of the portfolio site.
- Refer to Admir in THIRD PERSON ("Admir", "he", "his work").
- NEVER address the visitor as "Admir".
- NEVER talk about "my CV" / "my projects" as if YOU own them.
- NEVER say things like "I don't have a CV because I'm an AI/virtual assistant".
  That is forbidden. The CV is Admir's and is shown on the UI.
- Prefer: "This CV view shows..." / "On this screen, you can see..." / "Admir's timeline includes..."

ROLE:
- You do NOT change the UI.
- You ONLY narrate and explain what is happening, based on the context the frontend sends.

OUTPUT CONTRACT:
Return ONLY a JSON object:
{
  "narration": "<1-4 short sentences of natural language>",
  "intentSummary": "<short technical summary>",
  "focusTarget": "<id or null>",
  "tone": "neutral | curious | excited | warning"
}

PERSONA:
- pref_concise: 1–2 sentences
- pref_detailed: 3–5 sentences
- otherwise: 2–3 sentences

SCOPE:
Portfolio topics only (Admir, CV, projects, skills). Otherwise refuse politely.
FALLBACK:
If unclear, ask for clarification and suggest valid portfolio commands.
`;

function buildFactsOnlyBlock() {
  return `
-----------------------------
FACTS-ONLY MODE (STRICT)
-----------------------------
You are operating in STRICT FACTS-ONLY MODE.

You will receive a string named "factsText".
That factsText is the ONLY allowed source of factual claims.

Rules:
- Do NOT invent, assume, or guess any facts.
- If a detail is not present in factsText, say you don't have that information in the portfolio data.
- Do NOT claim YOU (the avatar) have a CV, education, jobs, or projects.
- Always describe what is ON SCREEN / in factsText.
- If factsText is empty, ask the visitor to open CV/projects so you can describe what is shown.
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
      if (Array.isArray(e?.items)) {
        for (const ee of e.items) pushIfString(ee?.id);
      }
    }
  }

  return Array.from(new Set(ids));
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }

  const {
    text,
    currentScreen,
    history,
    compilerContext,
    portfolioContext,
    factsPack,
    strictFactsOnly,
  } = req.body ?? {};

  const userMessage = normalizeText(text);

  if (!userMessage || !currentScreen) {
    res.status(400).json({
      error: "Missing 'text' or 'currentScreen' in request body.",
    });
    return;
  }

  if (isStopIntent(userMessage)) {
    res.status(200).json({
      narration: "Okay — stopping.",
      intentSummary: "stop_requested",
      focusTarget: null,
      tone: "neutral",
    });
    return;
  }

  const historySummary = Array.isArray(history)
    ? history.map((s: any) => s?.screenId ?? "unknown")
    : [];

  const sessionContext = compilerContext?.session ?? null;
  const allowedFocusTargets = collectAllowedFocusTargets(currentScreen);

  const factsText = normalizeText(factsPack?.factsText);

  const strict =
    typeof strictFactsOnly === "boolean"
      ? strictFactsOnly
      : factsText.length > 0;

  const systemPrompt =
    SYSTEM_PROMPT_BASE + (strict ? buildFactsOnlyBlock() : "");

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
      mutationsCount: Array.isArray(compilerContext?.mutations)
        ? compilerContext.mutations.length
        : 0,
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

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }

    const narration =
      typeof parsed.narration === "string" ? parsed.narration : "";

    const intentSummary =
      typeof parsed.intentSummary === "string"
        ? parsed.intentSummary
        : "unspecified";

    let focusTarget: string | null = null;
    if (typeof parsed.focusTarget === "string") {
      const ft = parsed.focusTarget.trim();
      focusTarget = allowedFocusTargets.includes(ft) ? ft : null;
    } else if (parsed.focusTarget === null) {
      focusTarget = null;
    }

    const allowedTones = ["neutral", "curious", "excited", "warning"] as const;
    const tone: (typeof allowedTones)[number] =
      typeof parsed.tone === "string" &&
      (allowedTones as readonly string[]).includes(parsed.tone)
        ? parsed.tone
        : "neutral";

    if (strict && !factsText) {
      res.status(200).json({
        narration:
          "I don’t have the portfolio data loaded for this view yet. Say “show the CV” or “show projects”, and I’ll describe what’s on screen.",
        intentSummary: "missing_factsText",
        focusTarget: null,
        tone: "warning",
      });
      return;
    }

    res.status(200).json({
      narration,
      intentSummary,
      focusTarget,
      tone,
    });
  } catch (err: any) {
    console.error("Avatar error:", err);
    res.status(500).json({
      error: "Avatar failed",
      details: err?.message ?? "unknown",
    });
  }
}
