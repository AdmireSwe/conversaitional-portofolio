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

    // Helpful debug signals
    this.pc.oniceconnectionstatechange = () => {
      // eslint-disable-next-line no-console
      console.log("[webrtc] iceConnectionState:", this.pc?.iceConnectionState);
    };
    this.pc.onconnectionstatechange = () => {
      // eslint-disable-next-line no-console
      console.log("[webrtc] connectionState:", this.pc?.connectionState);
    };

    // Ensure we negotiate receiving audio reliably
    try {
      this.pc.addTransceiver("audio", { direction: "sendrecv" });
    } catch {
      // ignore (older browsers)
    }

    // 2) Create a dedicated audio element for remote playback
    this.audioEl = document.createElement("audio");
    this.audioEl.autoplay = true;
    this.audioEl.muted = false;
    this.audioEl.volume = 1;

    // "playsinline" avoids weird iOS behavior; harmless elsewhere
    this.audioEl.setAttribute("playsinline", "true");

    // Ensure it exists in DOM (some browsers behave better)
    this.audioEl.style.display = "none";
    document.body.appendChild(this.audioEl);

    // 3) When remote audio arrives, play it
    this.pc.ontrack = async (e) => {
      const [stream] = e.streams;
      // eslint-disable-next-line no-console
      console.log("[webrtc] ontrack:", e.track?.kind, "streams:", e.streams?.length);

      if (stream && this.audioEl) {
        this.audioEl.srcObject = stream;

        // Autoplay can be blocked; attempt play() after track
        try {
          await this.audioEl.play();
          // eslint-disable-next-line no-console
          console.log("[webrtc] audioEl.play() ok");
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("[webrtc] audioEl.play() blocked:", err);
        }
      }
    };

    // 4) Data channel for events (transcripts, state, etc.)
    this.dc = this.pc.createDataChannel("oai-events");
    this.dc.onopen = () => {
      // eslint-disable-next-line no-console
      console.log("[webrtc] datachannel open");
    };
    this.dc.onerror = (e) => {
      // eslint-disable-next-line no-console
      console.warn("[webrtc] datachannel error", e);
    };
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

    // 8) Exchange SDP with OpenAI Realtime (WebRTC)
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
