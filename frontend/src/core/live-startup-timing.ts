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
  | "hls_engine_loaded"
  | "hls_manifest_loaded"
  | "first_frame_decoded";

export interface LiveStartupTimingSnapshot {
  readonly key: string;
  readonly phases: Readonly<Partial<Record<LiveStartupPhase, number>>>;
  readonly startedAt: string;
}

export class LiveStartupTiming {
  private readonly _origin = performance.now();
  private readonly _phases: Partial<Record<LiveStartupPhase, number>> = {};

  public constructor(public readonly key: string) {}

  public mark(phase: LiveStartupPhase): void {
    this._phases[phase] ??=
      Math.round((performance.now() - this._origin) * 10) / 10;
  }

  public snapshot(): LiveStartupTimingSnapshot {
    return {
      key: this.key,
      phases: { ...this._phases },
      startedAt: new Date(performance.timeOrigin + this._origin).toISOString(),
    };
  }
}

const latestTimings = new Map<string, LiveStartupTiming>();

export function beginLiveStartupTiming(key: string): LiveStartupTiming {
  const timing = new LiveStartupTiming(key);
  latestTimings.set(key, timing);
  return timing;
}

export function getLiveStartupTimings(): LiveStartupTimingSnapshot[] {
  return [...latestTimings.values()].map((timing) => timing.snapshot());
}
