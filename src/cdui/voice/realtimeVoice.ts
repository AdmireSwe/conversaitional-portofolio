// src/cdui/voice/realtimeVoice.ts
// Minimal WebRTC client for OpenAI Realtime speech-to-speech in the browser.

export type RealtimeVoiceStatus = "idle" | "connecting" | "connected" | "error";
export type RealtimeEventHandler = (event: any) => void;

export class RealtimeVoiceClient {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private micStream: MediaStream | null = null;
  private audioEl: HTMLAudioElement | null = null;

  // 🔑 Queue events until data channel is open
  private pendingEvents: any[] = [];
  private dcReadyResolver: (() => void) | null = null;
  private dcReady = new Promise<void>((resolve) => {
    this.dcReadyResolver = resolve;
  });

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

    this.pc = new RTCPeerConnection();

    // Ensure we can receive audio
    try {
      this.pc.addTransceiver("audio", { direction: "sendrecv" });
    } catch {}

    // Audio element
    this.audioEl = document.createElement("audio");
    this.audioEl.autoplay = true;
    this.audioEl.muted = false;
    this.audioEl.setAttribute("playsinline", "true");
    this.audioEl.style.display = "none";
    document.body.appendChild(this.audioEl);

    this.pc.ontrack = async (e) => {
      const [stream] = e.streams;
      if (stream && this.audioEl) {
        this.audioEl.srcObject = stream;
        try {
          await this.audioEl.play();
        } catch {
          // autoplay policy fallback handled in UI
        }
      }
    };

    // Data channel
    this.dc = this.pc.createDataChannel("oai-events");

    this.dc.onopen = () => {
      // ✅ Data channel ready
      this.dcReadyResolver?.();
      this.dcReadyResolver = null;

      // Flush queued events
      for (const evt of this.pendingEvents) {
        this.dc!.send(JSON.stringify(evt));
      }
      this.pendingEvents = [];
    };

    this.dc.onmessage = (m) => {
      try {
        const evt = JSON.parse(m.data);
        this.onEvent?.(evt);
      } catch {}
    };

    // Mic
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    for (const track of this.micStream.getTracks()) {
      this.pc.addTrack(track, this.micStream);
    }

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
      throw new Error(`SDP exchange failed`);
    }

    const answerSdp = await sdpResp.text();
    await this.pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

    this.setStatus("connected");
  }

  // ✅ SAFE: will wait until data channel is open
  async sendEvent(evt: any) {
    if (!this.dc) return;

    if (this.dc.readyState === "open") {
      this.dc.send(JSON.stringify(evt));
    } else {
      this.pendingEvents.push(evt);
      await this.dcReady;
    }
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

    this.pendingEvents = [];
    this.setStatus("idle");
  }
}
