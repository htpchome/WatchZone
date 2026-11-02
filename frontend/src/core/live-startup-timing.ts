export type LiveStartupPhase =
  | "adapter_import_started"
  | "adapter_imported"
  | "client_config_requested"
  | "client_config_received"
  | "peer_created"
  | "offer_created"
  | "local_description_set"
  | "first_local_candidate"
  | "signaling_started"
  | "session_received"
  | "answer_received"
  | "remote_description_set"
  | "first_remote_candidate"
  | "video_track_received"
  | "stream_url_requested"
  | "stream_url_received"
  | "hls_native_path_selected"
  | "hls_mse_path_selected"
  | "hls_engine_loaded"
  | "hls_manifest_loaded"
  | "first_frame_decoded"
  | "presentation_selected";

export interface LiveStartupTimingSnapshot {
  readonly hlsMode?: "low_latency" | "standard";
  readonly key: string;
  readonly phases: Readonly<Partial<Record<LiveStartupPhase, number>>>;
  readonly signalingFallbackReason?: string;
  readonly signalingPath?: string;
  readonly startedAt: string;
}

export class LiveStartupTiming {
  private readonly _origin = performance.now();
  private readonly _phases: Partial<Record<LiveStartupPhase, number>> = {};
  private _hlsMode?: "low_latency" | "standard";
  private _signalingFallbackReason?: string;
  private _signalingPath?: string;

  public constructor(public readonly key: string) {}

  public mark(phase: LiveStartupPhase): void {
    this._phases[phase] ??=
      Math.round((performance.now() - this._origin) * 10) / 10;
  }

  public setSignaling(
    path: string,
    fallbackReason: string | null = null,
  ): void {
    this._signalingPath ??= path;
    this._signalingFallbackReason ??= fallbackReason ?? undefined;
  }

  public setHlsMode(mode: "low_latency" | "standard"): void {
    this._hlsMode ??= mode;
  }

  public snapshot(): LiveStartupTimingSnapshot {
    return {
      hlsMode: this._hlsMode,
      key: this.key,
      phases: { ...this._phases },
      signalingFallbackReason: this._signalingFallbackReason,
      signalingPath: this._signalingPath,
      startedAt: new Date(performance.timeOrigin + this._origin).toISOString(),
    };
  }
}

const MAX_RECORDED_STARTUPS = 20;
const latestTimings = new Map<string, LiveStartupTiming>();

export function beginLiveStartupTiming(key: string): LiveStartupTiming {
  const timing = new LiveStartupTiming(key);
  if (!latestTimings.has(key) && latestTimings.size >= MAX_RECORDED_STARTUPS) {
    const oldestKey = latestTimings.keys().next().value;
    if (oldestKey !== undefined) latestTimings.delete(oldestKey);
  }
  latestTimings.delete(key);
  latestTimings.set(key, timing);
  return timing;
}

export function getLiveStartupTimings(): LiveStartupTimingSnapshot[] {
  return [...latestTimings.values()].map((timing) => timing.snapshot());
}
