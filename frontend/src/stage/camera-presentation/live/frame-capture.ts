const SNAPSHOT_MIME_TYPE = "image/jpeg";
const SNAPSHOT_QUALITY = 0.92;
const OBJECT_URL_REVOKE_DELAY_MS = 1_000;

export async function captureVideoFrame(
  video: HTMLVideoElement,
): Promise<Blob> {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    throw new Error("The live frame is not ready yet.");
  }
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (width <= 0 || height <= 0) {
    throw new Error("The live frame has no image data.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Snapshot capture is not supported in this browser.");
  }
  context.drawImage(video, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The live frame could not be encoded."));
      },
      SNAPSHOT_MIME_TYPE,
      SNAPSHOT_QUALITY,
    );
  });
}

export function downloadSnapshot(blob: Blob, cameraId?: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = snapshotFilename(cameraId);
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(
      () => URL.revokeObjectURL(objectUrl),
      OBJECT_URL_REVOKE_DELAY_MS,
    );
  }
}

export function snapshotFilename(
  cameraId = "camera",
  capturedAt = new Date(),
): string {
  const camera =
    cameraId
      .trim()
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "camera";
  const timestamp = capturedAt
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/:/g, "-");
  return `${camera}_${timestamp}.jpg`;
}
