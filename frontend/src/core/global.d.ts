declare const __APP_VERSION__: string;
declare const __APP_BUILD__: string;

interface Window {
  wzc?: Readonly<{
    activeCardVersion: string | null;
    build: string;
    getLiveStartupTimings(): Array<{
      readonly hlsMode?: "low_latency" | "standard";
      readonly key: string;
      readonly phases: Readonly<
        Partial<
          Record<
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
            | "presentation_selected",
            number
          >
        >
      >;
      readonly signalingFallbackReason?: string;
      readonly signalingPath?: string;
      readonly startedAt: string;
    }>;
    loadedAt: string;
    version: string;
  }>;
  customCards?: Array<{
    type: string;
    name: string;
    description?: string;
    preview?: boolean;
    documentationURL?: string;
  }>;
}
