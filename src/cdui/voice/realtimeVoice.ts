// src/cdui/voice/realtimeVoice.ts
// Minimal WebRTC client for OpenAI Realtime speech-to-speech in the browser.
//
// What it does:
// - gets mic audio
// - establishes WebRTC connection to OpenAI Realtime
// - plays remote audio back to the user
// - exposes a data channel for events (optional UI/debug)

export type RealtimeVoiceStatus = "idle" | "connecting" | "connected" | "error";
export type RealtimeEventHandler = (event: any) => void;

export class RealtimeVoiceClient {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private micStream: MediaStream | null = null;

  private audioEl: HTMLAudioElement | null = null;

  status: RealtimeVoiceStatus = "idle";
  onStatus?: (s: RealtimeVoiceStatus) => void;
  onEvent?: RealtimeEventHandler;

  constructor(opts?: {
    onStatus?: (s: RealtimeVoiceStatus) => void;
    onEvent?: RealtimeEventHandler;
  }) {
    this.onStatus = opts?.onStatus;
    this.onEvent = opts?.onEvent;
  }

  private setStatus(s: RealtimeVoiceStatus) {
    this.status = s;
    this.onStatus?.(s);
  }

  async connect(clientSecret: string) {
    if (this.pc) return;

    this.setStatus("connecting");

    // 1) Setup peer connection
    this.pc = new RTCPeerConnection();

    // 2) Create a dedicated audio element for remote playback
    this.audioEl = document.createElement("audio");
    this.audioEl.autoplay = true;

    // "playsinline" is mostly a video thing, but setting the attribute is harmless
    // and avoids TS errors for HTMLAudioElement.playsInline.
    this.audioEl.setAttribute("playsinline", "true");

    // Make sure it exists in the DOM (some browsers behave better)
    this.audioEl.style.display = "none";
    document.body.appendChild(this.audioEl);

    // 3) When remote audio arrives, play it
    this.pc.ontrack = (e) => {
      const [stream] = e.streams;
      if (stream && this.audioEl) {
        this.audioEl.srcObject = stream;
      }
    };

    // 4) Data channel for events (transcripts, state, etc.)
    this.dc = this.pc.createDataChannel("oai-events");
    this.dc.onmessage = (m) => {
      try {
        const evt = JSON.parse(m.data);
        this.onEvent?.(evt);
      } catch {
        // ignore non-json
      }
    };

    // 5) Get microphone
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    // 6) Send mic track(s) to the peer connection
    for (const track of this.micStream.getTracks()) {
      this.pc.addTrack(track, this.micStream);
    }

    // 7) Create offer SDP
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    // 8) Exchange SDP with OpenAI Realtime (GA WebRTC)
    // Docs: POST https://api.openai.com/v1/realtime/calls with Content-Type application/sdp
    const sdpResp = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clientSecret}`,
        "Content-Type": "application/sdp",
      },
      body: offer.sdp ?? "",
    });

    if (!sdpResp.ok) {
      this.setStatus("error");
      const text = await sdpResp.text().catch(() => "");
      throw new Error(`Realtime SDP exchange failed: ${sdpResp.status} ${text}`);
    }

    const answerSdp = await sdpResp.text();
    await this.pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

    this.setStatus("connected");
  }

  // Optional: send a “session.update” after connect if you want to tweak behavior live
  sendEvent(evt: any) {
    if (!this.dc || this.dc.readyState !== "open") return;
    this.dc.send(JSON.stringify(evt));
  }

  async disconnect() {
    try {
      this.dc?.close();
    } catch {}
    this.dc = null;

    try {
      this.pc?.close();
    } catch {}
    this.pc = null;

    if (this.micStream) {
      for (const t of this.micStream.getTracks()) t.stop();
      this.micStream = null;
    }

    if (this.audioEl) {
      try {
        this.audioEl.pause();
      } catch {}
      this.audioEl.srcObject = null;
      this.audioEl.remove();
      this.audioEl = null;
    }

    this.setStatus("idle");
  }
}
