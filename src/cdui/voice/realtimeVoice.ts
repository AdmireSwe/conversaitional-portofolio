// src/cdui/voice/realtimeVoice.ts
// Minimal WebRTC client for OpenAI Realtime speech-to-speech in the browser.

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

  isConnected() {
    return this.status === "connected" && !!this.pc;
  }

  async connect(clientSecret: string) {
    if (this.pc) return;

    this.setStatus("connecting");

    // 1) Setup peer connection
    this.pc = new RTCPeerConnection();

    // Ensure audio negotiation is explicit
    try {
      this.pc.addTransceiver("audio", { direction: "sendrecv" });
    } catch {
      // ignore
    }

    // 2) Audio element for remote playback
    this.audioEl = document.createElement("audio");
    this.audioEl.autoplay = true;
    this.audioEl.setAttribute("playsinline", "true");
    this.audioEl.style.display = "none";
    document.body.appendChild(this.audioEl);

    // 3) Remote audio handling
    this.pc.ontrack = async (e) => {
      const [stream] = e.streams;
      if (stream && this.audioEl) {
        this.audioEl.srcObject = stream;
        try {
          await this.audioEl.play();
        } catch {
          // Autoplay may be blocked until user gesture
        }
      }
    };

    // 4) Data channel for events
    this.dc = this.pc.createDataChannel("oai-events");
    this.dc.onmessage = (m) => {
      try {
        const evt = JSON.parse(m.data);
        this.onEvent?.(evt);
      } catch {
        // ignore
      }
    };

    // 5) Microphone access
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    // 6) Send mic tracks
    for (const track of this.micStream.getTracks()) {
      this.pc.addTrack(track, this.micStream);
    }

    // 7) Offer / answer exchange
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

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
