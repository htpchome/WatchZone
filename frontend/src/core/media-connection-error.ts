export type MediaConnectionErrorCode =
  | "cancelled"
  | "capacity_exceeded"
  | "configuration_timeout"
  | "connection_timeout"
  | "peer_failed"
  | "signaling_failed"
  | "track_ended"
  | "unsupported"
  | "unknown";

export class MediaConnectionError extends Error {
  public constructor(
    public readonly code: MediaConnectionErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "MediaConnectionError";
  }
}

export function mediaConnectionErrorCode(
  error: unknown,
): MediaConnectionErrorCode {
  if (error instanceof MediaConnectionError) return error.code;
  if (error instanceof DOMException && error.name === "AbortError") {
    return "cancelled";
  }
  return "unknown";
}

export function normalizeMediaConnectionError(
  error: unknown,
  code: MediaConnectionErrorCode,
  fallbackMessage: string,
): Error {
  if (error instanceof MediaConnectionError) {
    return error;
  }
  if (error instanceof DOMException && error.name === "AbortError")
    return error;
  if (error instanceof Error) {
    return new MediaConnectionError(code, error.message, { cause: error });
  }
  return new MediaConnectionError(code, fallbackMessage, { cause: error });
}
