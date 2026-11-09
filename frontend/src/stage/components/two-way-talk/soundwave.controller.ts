const FRAME_INTERVAL_MS = 1000 / 30;

interface AudioContextConstructor {
  new (): AudioContext;
}

/** Draws bounded incoming/outgoing audio levels without Lit render churn. */
export class TalkSoundwaveController {
  private _animation?: number;
  private _audioContext?: AudioContext;
  private _canvas?: HTMLCanvasElement;
  private _incoming?: AnalyserNode;
  private _outgoing?: AnalyserNode;
  private _lastFrame = 0;
  private _incomingStream?: MediaStream;
  private _outgoingStream?: MediaStream;
  private readonly _sources: MediaStreamAudioSourceNode[] = [];

  public attach(
    canvas: HTMLCanvasElement | undefined,
    outgoing: MediaStream | undefined,
    incoming: MediaStream | undefined,
  ): void {
    if (
      canvas === this._canvas &&
      outgoing === this._outgoingStream &&
      incoming === this._incomingStream
    )
      return;
    this.dispose();
    this._canvas = canvas;
    this._outgoingStream = outgoing;
    this._incomingStream = incoming;
    if (!canvas || !outgoing) return;
    const AudioContextClass =
      (
        window as typeof window & {
          webkitAudioContext?: AudioContextConstructor;
        }
      ).AudioContext ??
      (
        window as typeof window & {
          webkitAudioContext?: AudioContextConstructor;
        }
      ).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    this._audioContext = context;
    this._outgoing = this._connect(context, outgoing);
    this._incoming = incoming ? this._connect(context, incoming) : undefined;
    void context.resume().catch(() => undefined);
    this._animation = requestAnimationFrame(this._draw);
  }

  public dispose(): void {
    if (this._animation !== undefined) cancelAnimationFrame(this._animation);
    this._animation = undefined;
    for (const source of this._sources.splice(0)) source.disconnect();
    void this._audioContext?.close().catch(() => undefined);
    this._audioContext = undefined;
    this._incoming = undefined;
    this._outgoing = undefined;
    this._canvas = undefined;
    this._incomingStream = undefined;
    this._outgoingStream = undefined;
  }

  private _connect(context: AudioContext, stream: MediaStream): AnalyserNode {
    const analyser = context.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.72;
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    this._sources.push(source);
    return analyser;
  }

  private readonly _draw = (now: number): void => {
    this._animation = requestAnimationFrame(this._draw);
    if (
      document.visibilityState !== "visible" ||
      now - this._lastFrame < FRAME_INTERVAL_MS
    )
      return;
    this._lastFrame = now;
    const canvas = this._canvas;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.clearRect(0, 0, width, height);
    const styles = getComputedStyle(canvas);
    this._wave(
      context,
      this._incoming,
      0,
      width / 2,
      height,
      styles.getPropertyValue("--wzc-talk-wave-incoming-color").trim(),
    );
    this._wave(
      context,
      this._outgoing,
      width / 2,
      width,
      height,
      styles.getPropertyValue("--wzc-talk-wave-outgoing-color").trim(),
    );
  };

  private _wave(
    context: CanvasRenderingContext2D,
    analyser: AnalyserNode | undefined,
    start: number,
    end: number,
    height: number,
    color: string,
  ): void {
    const data = new Uint8Array(analyser?.frequencyBinCount ?? 16);
    analyser?.getByteFrequencyData(data);
    const middle = height / 2;
    context.beginPath();
    context.strokeStyle = color || "currentColor";
    context.lineWidth = Math.max(1, height * 0.035);
    for (let index = 0; index < data.length; index += 1) {
      const x = start + ((end - start) * index) / Math.max(1, data.length - 1);
      const amplitude = ((data[index] ?? 0) / 255) * height * 0.38;
      const y = middle + Math.sin(index * 1.15) * amplitude;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }
}
