"""Provider contract for live WebRTC signaling."""

from collections.abc import Callable
from typing import Protocol

from webrtc_models import RTCIceCandidateInit

type LiveSignalingEvent = dict[str, object]
type SendLiveSignalingEvent = Callable[[LiveSignalingEvent], None]


class LiveSignalingSession(Protocol):
    """One provider-backed WebRTC signaling session."""

    @property
    def signaling_path(self) -> str:
        """Return a non-secret diagnostics identifier for this path."""

    async def async_start(self, offer: str) -> None:
        """Start negotiation for a browser offer."""

    async def async_add_candidate(self, candidate: RTCIceCandidateInit) -> None:
        """Forward a browser ICE candidate."""

    async def async_close(self) -> None:
        """Close signaling and provider resources idempotently."""
