// api/avatar.ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Base system prompt: defines output contract + session/persona behavior.
 */
const SYSTEM_PROMPT_BASE = `
You are the CDUI avatar for Admir's conversational portfolio.

==============================
LANGUAGE RULE (CRITICAL)
==============================
You MUST respond in the SAME LANGUAGE as the user's input text.

Examples:
- If the user speaks English → respond in English
- If the user speaks German → respond in German
- If the user speaks Swedish → respond in Swedish
- If the user mixes languages → respond in the dominant one

This applies to:
- "narration"
- any quoted phrases inside narration

DO NOT explain which language you chose.
DO NOT translate unless the user explicitly asks for translation.

==============================
VOICE / POINT OF VIEW RULE
==============================
- You are speaking to a VISITOR of the portfolio site.
- Refer to Admir in THIRD PERSON ("Admir", "he", "his work").
- NEVER address the visitor as "Admir".
- Avoid first-person ownership like "my CV" or "my projects"
  unless clearly quoting the visitor.

==============================
ROLE & OUTPUT CONTRACT
==============================
You do NOT change the UI.
You ONLY narrate and explain what is happening.

You ALWAYS respond with a JSON object of this shape:

{
  "narration": "<1–4 short sentences>",
  "intentSummary": "<short technical summary>",
  "focusTarget": "<id or null>",
  "tone": "neutral | curious | excited | warning"
}

-----------------------------
PERSONA PREFERENCES
-----------------------------
If personaHints include:
- "pref_concise"  → 1–2 sentences
- "pref_detailed" → 3–5 sentences
- otherwise       → 2–3 sentences

-----------------------------
SCOPE LIMITATIONS
-----------------------------
Portfolio topics only (Admir, CV, projects, skills).
Politely refuse anything else.

-----------------------------
FALLBACK
-----------------------------
If unclear, ask for clarification and suggest valid commands.
`;

/**
 * Strong hallucination guard when strictFactsOnly is true.
 */
function buildFactsOnlyBlock() {
  return `
-----------------------------
FACTS-ONLY MODE (STRICT)
-----------------------------
- Use ONLY factsText for factual claims.
- Do NOT invent education, companies, dates, or projects.
- If info is missing, say so and suggest opening a section.
`;
}

function normalizeText(s: unknown) {
  return typeof s === "string" ? s.trim() : "";
}

function isStopIntent(userMessage: string) {
  const t = userMessage.toLowerCase();
  return (
    t === "stop" ||
    t === "cancel" ||
    t === "pause" ||
    t === "silence" ||
    t === "shut up" ||
    t === "be quiet"
  );
}

function collectAllowedFocusTargets(currentScreen: any): string[] {
  const ids: string[] = [];
  const push = (v: any) => typeof v === "string" && v && ids.push(v);

  push(currentScreen?.screenId);
  push(currentScreen?.id);

  for (const w of currentScreen?.widgets ?? []) {
    push(w?.id);
    for (const e of w?.entries ?? w?.projects ?? []) push(e?.id);
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
    factsPack,
    strictFactsOnly,
  } = req.body ?? {};

  const userMessage = normalizeText(text);

  if (!userMessage || !currentScreen) {
    res.status(400).json({ error: "Missing text or screen" });
    return;
  }

  if (isStopIntent(userMessage)) {
    res.status(200).json({
      narration: "Okay — stopping. You can continue anytime.",
      intentSummary: "stop_requested",
      focusTarget: null,
      tone: "neutral",
    });
    return;
  }

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
      screenId: currentScreen?.screenId,
      title: currentScreen?.title,
    },
    historySummary: (history ?? []).map((s: any) => s?.screenId),
    sessionContext: compilerContext?.session ?? null,
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
      max_tokens: 220,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch {}

    const focusTarget =
      typeof parsed.focusTarget === "string" &&
      allowedFocusTargets.includes(parsed.focusTarget)
        ? parsed.focusTarget
        : null;

    res.status(200).json({
      narration: parsed.narration ?? "",
      intentSummary: parsed.intentSummary ?? "unspecified",
      focusTarget,
      tone:
        ["neutral", "curious", "excited", "warning"].includes(parsed.tone)
          ? parsed.tone
          : "neutral",
    });
  } catch (err: any) {
    console.error("Avatar error:", err);
    res.status(500).json({ error: "Avatar failed" });
  }
}
