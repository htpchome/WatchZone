"""Tests for normalized Frigate recording ranges."""

from datetime import UTC, datetime
from types import SimpleNamespace

from custom_components.watchzone.providers.frigate.recordings import (
    _recording_days,
    _recording_hours,
)
from custom_components.watchzone.providers.recordings import RecordingQuery


def test_recording_segments_are_grouped_into_hour_ranges() -> None:
    """One row represents one hour while retaining actual recorded duration."""
    source = SimpleNamespace(
        camera_name="front",
        frigate_instance_id="frigate-main",
    )
    start = datetime(2026, 11, 9, 22, tzinfo=UTC).timestamp()
    query = RecordingQuery(
        after=start - 86400,
        before=start + 86400,
        selected_date="2026-11-09",
        timezone="UTC",
    )

    hours = _recording_hours(
        source,
        [
            {"start_time": start, "end_time": start + 20},
            {"start_time": start + 40, "end_time": start + 100},
            {"start_time": start + 3600, "end_time": start + 3660},
        ],
        query,
    )

    assert len(hours) == 2
    assert hours[0].start_time == start + 3600
    assert hours[1].start_time == start
    assert hours[1].end_time == start + 100
    assert hours[1].duration == 80
    assert hours[1].preferred_transport == "hls"
    assert [source.transport for source in hours[1].playback_sources] == [
        "file",
        "hls",
    ]
    assert "/api/frigate/frigate-main/recording/front/start/" in hours[1].download_url


def test_recording_days_are_bounded_by_the_requested_history() -> None:
    """Provider summaries do not expose dates outside the card's history window."""
    start = datetime(2026, 11, 8, tzinfo=UTC).timestamp()
    query = RecordingQuery(
        after=start,
        before=start + 2 * 86400,
        selected_date="2026-11-09",
        timezone="UTC",
    )

    expected = ("2026-11-10", "2026-11-09")
    assert _recording_days(
        [
            {"day": "2026-11-10"},
            {"day": "2026-11-09"},
            {"day": "2026-11-07"},
        ],
        query,
    ) == expected
    assert _recording_days(
        {"2026-11-10": True, "2026-11-09": True, "2026-11-07": True},
        query,
    ) == expected
