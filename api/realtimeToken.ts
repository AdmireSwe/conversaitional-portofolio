// api/realtimeToken.ts
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

  /**
   * IMPORTANT:
   * - Realtime GA supports ONE modality per session
   * - We choose AUDIO ONLY
   * - Text is handled locally via transcript events
   */
  const sessionConfig = {
    session: {
      type: "realtime",
      model: "gpt-realtime",
      instructions:
        "You are the CDUI avatar. Speak naturally. Keep responses short.",
      audio: {
        output: { voice: "marin" },
      },
      turn_detection: {
        type: "server_vad",
        threshold: 0.5,
        silence_duration_ms: 400,
        create_response: true,
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

    const data = await r.json();

    if (!r.ok) {
      return res.status(r.status).json({
        error: "Failed to create client secret",
        details: data,
      });
    }

    return res.status(200).json({ clientSecret: data.value });
  } catch (err: any) {
    return res.status(500).json({
      error: "Unexpected error",
      details: String(err),
    });
  }
}
