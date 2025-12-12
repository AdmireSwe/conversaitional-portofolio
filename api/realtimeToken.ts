// api/realtimeToken.ts
// Creates a client-safe ephemeral token for OpenAI Realtime (speech-to-speech)

import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = {
  runtime: "nodejs",
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY env var" });
  }

  // Ephemeral key session config (GA)
  const sessionConfig = {
    session: {
      type: "realtime",
      model: "gpt-realtime",
      audio: {
        output: { voice: "marin" },
      },
      instructions:
        "You are the Conversationally-Driven UI (CDUI) avatar for Admir’s portfolio. Speak naturally and conversationally. Ask short clarifying questions when needed. You help the visitor navigate and reshape the interface.",
    },
  };

  try {
    const r = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sessionConfig),
    });

    const data = (await r.json().catch(() => null)) as any;

    if (!r.ok) {
      return res.status(r.status).json({
        error: "Failed to create client secret",
        details: data ?? null,
      });
    }

    // GA docs show the ephemeral key in `data.value` 
    const clientSecret = data?.value;
    if (!clientSecret || typeof clientSecret !== "string") {
      return res.status(500).json({
        error: "Unexpected response shape from OpenAI",
        details: data ?? null,
      });
    }

    return res.status(200).json({ clientSecret });
  } catch (err: any) {
    return res
      .status(500)
      .json({ error: "Unexpected error", details: String(err) });
  }
}
