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

  // IMPORTANT:
  // Realtime currently supports output_modalities as either ["audio"] OR ["text"] (not both).
  // Your earlier 400 confirms this.
  const model =
    process.env.OPENAI_REALTIME_MODEL?.trim() || "gpt-realtime-2025-08-28";

  const sessionConfig = {
    session: {
      type: "realtime",
      model,
      output_modalities: ["audio"],
      instructions:
        "You are the Conversationally-Driven UI (CDUI) avatar for Admir’s portfolio. Speak naturally and conversationally. Keep responses short. If the user asks to see something (CV, projects, timeline), respond briefly and clearly.",
      audio: {
        output: { voice: "marin" },
        input: {
          // server VAD will detect turns and create responses automatically
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 350,
            create_response: true,
            interrupt_response: true,
          },
        },
      },
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
