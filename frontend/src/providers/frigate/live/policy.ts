import {
  CLIENT_PROFILE,
  type ClientProfile,
} from "../../../core/client-profile";
import type { FrigateFallbackTransport } from "../../../core/config";

export interface FrigateLiveTransportPolicy {
  readonly fallback: FrigateFallbackTransport;
  readonly hlsOnly: boolean;
}

/** Resolves host-application transport constraints before any session starts. */
export function resolveFrigateLiveTransportPolicy(
  configuredFallback: FrigateFallbackTransport,
  profile: Pick<ClientProfile, "isCatalyst"> = CLIENT_PROFILE,
): FrigateLiveTransportPolicy {
  return profile.isCatalyst
    ? { fallback: "hls", hlsOnly: true }
    : { fallback: configuredFallback, hlsOnly: false };
}
