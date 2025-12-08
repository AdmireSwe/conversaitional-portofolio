// api/brain.ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// This prompt tells the model to only output JSON with mutations.
const SYSTEM_PROMPT = `
You are the CDUI (Conversationally-Driven UI) compiler.

Your job is NOT to chat with the user.
Your job is to decide how the UI should change.

You ALWAYS return a JSON object with:
- "mutations": an array of mutation objects
- optional "systemPrompt": a short string explaining what you did

Valid mutations:

1) Add a tag to the current view:
{ "kind": "ADD_TAG", "tag": "<string>" }

2) Remove a tag from the current view:
{ "kind": "REMOVE_TAG", "tag": "<string>" }

3) Filter projects by technology:
{ "kind": "FILTER_PROJECTS", "tech": "<string>" }

4) Add a skill to the skill matrix:
{ "kind": "ADD_SKILL", "area": "<string>", "skill": "<string>" }

5) Change the level of a skill area:
{ "kind": "CHANGE_LEVEL", "area": "<string>", "level": "<string>" }

6) Add a timeline entry:
{
  "kind": "ADD_TIMELINE_ENTRY",
  "entry": {
    "id": "<string>",
    "title": "<string>",
    "period": "<string>",
    "description": "<string>"
  }
}

You MUST NOT invent any new mutation kinds.
You MUST NOT return HTML or JSX.
You MUST ONLY use the mutation formats listed above.

If you are not sure what to do, answer with:
{
  "mutations": [],
  "systemPrompt": "I need more details to decide how to change the interface."
}
`;

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }

  const { text, currentScreen, history } = req.body ?? {};

  if (!text || !currentScreen) {
    res.status(400).json({
      error: "Missing 'text' or 'currentScreen' in request body.",
    });
    return;
  }

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            request: text,
            screen: currentScreen,
            history,
          }),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? "{}";

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {};
    }

    if (!Array.isArray(parsed.mutations)) {
      parsed.mutations = [];
    }
    if (typeof parsed.systemPrompt !== "string") {
      parsed.systemPrompt =
        "AI backend responded but did not specify a systemPrompt.";
    }

    res.status(200).json(parsed);
  } catch (err: any) {
    console.error("Brain error:", err);
    res.status(500).json({
      error: "Brain failed",
      details: err?.message ?? "unknown",
    });
  }
}
