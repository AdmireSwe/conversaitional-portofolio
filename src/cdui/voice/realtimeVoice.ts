// src/cdui/voice/realtimeVoice.ts
// Minimal WebRTC client for OpenAI Realtime speech-to-speech in the browser.

export type RealtimeVoiceStatus = "idle" | "connecting" | "connected" | "error";
export type RealtimeEventHandler = (event: any) => void;

export class RealtimeVoiceClient {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private micStream: MediaStream | null = null;

  private audioEl: HTMLAudioElement | null = null;

  private dcOpenPromise: Promise<void> | null = null;
  private dcOpenResolve: (() => void) | null = null;

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

  isConnecting() {
    return this.status === "connecting";
  }

  private ensureDcOpenPromise() {
    if (this.dcOpenPromise) return this.dcOpenPromise;
    this.dcOpenPromise = new Promise<void>((resolve) => {
      this.dcOpenResolve = resolve;
    });
    return this.dcOpenPromise;
  }

  async connect(clientSecret: string) {
    // prevent overlapping sessions
    if (this.pc) return;

    this.setStatus("connecting");

    // 1) Setup peer connection
    this.pc = new RTCPeerConnection();

    this.pc.oniceconnectionstatechange = () => {
      console.log("[webrtc] iceConnectionState:", this.pc?.iceConnectionState);
    };
    this.pc.onconnectionstatechange = () => {
      console.log("[webrtc] connectionState:", this.pc?.connectionState);
    };

    // Ensure we negotiate receiving audio reliably
    try {
      this.pc.addTransceiver("audio", { direction: "sendrecv" });
    } catch {
      // ignore
    }

    // 2) Create audio element for remote playback
    this.audioEl = document.createElement("audio");
    this.audioEl.autoplay = true;
    this.audioEl.muted = false;
    this.audioEl.volume = 1;
    this.audioEl.setAttribute("playsinline", "true");
    this.audioEl.style.display = "none";
    document.body.appendChild(this.audioEl);

    // 3) When remote audio arrives, play it
    this.pc.ontrack = async (e) => {
      const [stream] = e.streams;
      console.log("[webrtc] ontrack: audio streams:", e.streams?.length ?? 0);

      if (stream && this.audioEl) {
        this.audioEl.srcObject = stream;

        try {
          await this.audioEl.play();
          console.log("[webrtc] audioEl.play() ok");
        } catch (err) {
          console.warn("[webrtc] audioEl.play() blocked:", err);
        }
      }
    };

    // 4) Data channel for events
    this.ensureDcOpenPromise();
    this.dc = this.pc.createDataChannel("oai-events");

    this.dc.onopen = () => {
      console.log("[webrtc] datachannel open");
      this.dcOpenResolve?.();
      this.dcOpenResolve = null;
    };

    this.dc.onclose = () => {
      console.log("[webrtc] datachannel closed");
    };

    this.dc.onerror = (err) => {
      console.error("[webrtc] datachannel error:", err);
    };

    this.dc.onmessage = (m) => {
      try {
        const evt = JSON.parse(m.data);
        this.onEvent?.(evt);
      } catch {
        // ignore non-json
      }
    };

    // 5) Microphone
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

    // 7) Offer/LocalDescription
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    // 8) Exchange SDP with OpenAI Realtime
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

    // Wait for data channel open before reporting connected
    await this.dcOpenPromise;

    this.setStatus("connected");
  }

  sendEvent(evt: any): boolean {
    if (!this.dc || this.dc.readyState !== "open") {
      console.warn("[realtime] sendEvent dropped (dc not open):", evt?.type);
      return false;
    }
    try {
      this.dc.send(JSON.stringify(evt));
      return true;
    } catch (err) {
      console.warn("[realtime] sendEvent failed:", err);
      return false;
    }
  }

  /**
   * Hard-interrupt whatever the assistant is currently saying.
   * Keeps the connection alive.
   */
  cancelResponse(): boolean {
    return this.sendEvent({ type: "response.cancel" });
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

    this.dcOpenPromise = null;
    this.dcOpenResolve = null;

    this.setStatus("idle");
  }
}
