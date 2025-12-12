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

  // Realtime session config (WebRTC)
  // Important bits:
  // - output_modalities enables audio responses
  // - audio.input.transcription enables user speech -> transcript events
  // - audio.input.turn_detection controls server-side VAD + auto response
  const sessionConfig = {
    session: {
      type: "realtime",
      model: "gpt-realtime",

      // THIS is critical: without output_modalities including "audio",
      // you can end up with a connected call but no spoken output.
      output_modalities: ["audio", "text"],

      instructions:
        "You are the Conversationally-Driven UI (CDUI) avatar for Admir’s portfolio. " +
        "Speak naturally and conversationally. Ask short clarifying questions when needed. " +
        "If the user asks to see something (CV, projects, timeline), respond briefly and clearly.",

      audio: {
        output: {
          voice: "marin",
        },
        input: {
          // Enable speech-to-text events so the UI can react to "show me your CV"
          transcription: {
            // Pick one of the supported realtime transcription models
            // (this one is fast/cheap and good enough for commands)
            model: "gpt-4o-mini-transcribe",
            language: "en",
          },

          // Server-side voice activity detection (VAD)
          // This makes turns “commit” automatically.
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,

            // IMPORTANT: tells the server to automatically create a response
            // when a user turn is detected.
            create_response: true,
          },

          // Optional; helps noisy mics
          noise_reduction: { type: "near_field" },
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
