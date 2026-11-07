export interface HlsJsLiveEdgeConfig {
  readonly liveMaxLatencyDuration: number;
  readonly liveSyncDuration: number;
}

export interface HlsLiveEdgePolicy {
  readonly hlsJsConfig: HlsJsLiveEdgeConfig;
  readonly maxLatencySeconds: number;
  readonly targetLatencySeconds: number;
}

const DEFAULT_TARGET_DURATION_SECONDS = 6;
const LIVE_SYNC_SEGMENT_COUNT = 3;
const LIVE_MAX_LATENCY_SEGMENT_COUNT = 5;
const NATIVE_CATCH_UP_RATE = 1.05;
const NATIVE_CATCH_UP_THRESHOLD_SECONDS = 0.5;

function tagNumber(manifest: string, tag: string): number | undefined {
  const match = manifest.match(new RegExp(`(?:^|\\n)#${tag}:([0-9.]+)`));
  const value = match ? Number(match[1]) : Number.NaN;
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function tagAttributeNumber(
  manifest: string,
  tag: string,
  attribute: string,
): number | undefined {
  const line = manifest
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith(`#${tag}:`));
  const match = line?.match(
    new RegExp(`(?:[:,])${attribute}=([0-9.]+)(?:,|$)`),
  );
  const value = match ? Number(match[1]) : Number.NaN;
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Derives one transport-neutral target and correction bound from a media playlist. */
export function hlsLiveEdgePolicy(
  manifest: string,
  lowLatency: boolean,
): HlsLiveEdgePolicy {
  const targetDuration =
    tagNumber(manifest, "EXT-X-TARGETDURATION") ??
    DEFAULT_TARGET_DURATION_SECONDS;
  const partTarget = tagAttributeNumber(
    manifest,
    "EXT-X-PART-INF",
    "PART-TARGET",
  );
  const holdBack = tagAttributeNumber(
    manifest,
    "EXT-X-SERVER-CONTROL",
    "HOLD-BACK",
  );
  const partHoldBack = tagAttributeNumber(
    manifest,
    "EXT-X-SERVER-CONTROL",
    "PART-HOLD-BACK",
  );
  const targetLatencySeconds = lowLatency
    ? (partHoldBack ?? holdBack ?? Math.max((partTarget ?? 1) * 3, 2))
    : (holdBack ?? targetDuration * LIVE_SYNC_SEGMENT_COUNT);
  const maxLatencySeconds = lowLatency
    ? targetLatencySeconds + Math.max(targetDuration, (partTarget ?? 0) * 3, 2)
    : Math.max(
        targetDuration * LIVE_MAX_LATENCY_SEGMENT_COUNT,
        targetLatencySeconds + targetDuration * 2,
      );

  return {
    hlsJsConfig: {
      liveMaxLatencyDuration: maxLatencySeconds,
      liveSyncDuration: targetLatencySeconds,
    },
    maxLatencySeconds,
    targetLatencySeconds,
  };
}

/**
 * Keeps engines without active playback-rate correction close to the live edge.
 * The returned cleanup owns every listener and restores normal playback speed.
 */
export function monitorHlsLiveEdge(
  video: HTMLVideoElement,
  policy: HlsLiveEdgePolicy,
): () => void {
  let closed = false;
  const synchronize = (): void => {
    if (closed || video.seekable.length === 0) return;
    const range = video.seekable.length - 1;
    const start = video.seekable.start(range);
    const end = video.seekable.end(range);
    const latency = end - video.currentTime;
    if (!Number.isFinite(latency) || latency < 0) return;

    if (latency > policy.maxLatencySeconds) {
      video.playbackRate = 1;
      video.currentTime = Math.max(start, end - policy.targetLatencySeconds);
      return;
    }

    const shouldCatchUp =
      !video.paused &&
      !video.ended &&
      video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA &&
      latency > policy.targetLatencySeconds + NATIVE_CATCH_UP_THRESHOLD_SECONDS;
    video.playbackRate = shouldCatchUp ? NATIVE_CATCH_UP_RATE : 1;
  };
  const events = [
    "loadedmetadata",
    "playing",
    "progress",
    "timeupdate",
    "waiting",
  ] as const;
  for (const event of events) video.addEventListener(event, synchronize);

  return () => {
    if (closed) return;
    closed = true;
    for (const event of events) video.removeEventListener(event, synchronize);
    video.playbackRate = 1;
  };
}
