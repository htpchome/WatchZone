"""Provider-neutral recorded-media playback contract."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

PlaybackTransport = Literal["file", "hls"]


@dataclass(frozen=True, slots=True)
class PlaybackSource:
    """One authenticated recorded-media playback candidate."""

    url: str
    content_type: str
    transport: PlaybackTransport
