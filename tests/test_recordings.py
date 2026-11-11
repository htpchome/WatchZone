"""Tests for normalized Frigate recording ranges."""

from datetime import UTC, datetime
from types import SimpleNamespace

from custom_components.watchzone.providers.frigate.recordings import (
    FrigateRecordingsProvider,
    _recording_days,
    _recording_hours,
)
from custom_components.watchzone.providers.recordings import (
    RecordingQuery,
    RecordingSegmentRequest,
)


def test_recording_segments_are_grouped_into_hour_ranges() -> None:
    """One row represents one hour while retaining actual recorded duration."""
    source = SimpleNamespace(
        camera_name="front",
        frigate_instance_id="frigate-main",
    )
    start = datetime(2026, 11, 9, 22, tzinfo=UTC).timestamp()
    query = RecordingQuery(
        selected_date="2026-11-09",
        timezone="UTC",
    )

    hours = _recording_hours(
        source,
        [
            {"start_time": start, "end_time": start + 20},
            {"start_time": start, "end_time": start + 20},
            {"start_time": start + 40, "end_time": start + 100},
            {"start_time": start + 3600, "end_time": start + 3660},
        ],
        query,
        [
            {
                "id": "review-1",
                "severity": "detection",
                "start_time": start + 45,
                "end_time": start + 75,
            }
        ],
    )

    assert len(hours) == 2
    assert hours[0].start_time == start + 3600
    assert hours[1].start_time == start
    assert hours[1].end_time == start + 100
    assert hours[1].duration == 80
    assert hours[1].timeline_start_time == start
    assert hours[1].timeline_end_time == start + 3600
    assert [
        (span.start_time, span.end_time, span.media_offset)
        for span in hours[1].spans
    ] == [
        (start, start + 20, 0),
        (start + 40, start + 100, 20),
    ]
    assert len(hours[1].markers) == 1
    assert hours[1].markers[0].classification == "detection"
    assert hours[1].markers[0].start_time == start + 45
    assert hours[1].markers[0].end_time == start + 75
    assert "/notifications/review-1/front/review_thumbnail.webp" in (
        hours[1].markers[0].thumbnail_url
    )
    assert hours[1].preferred_transport == "hls"
    assert [source.transport for source in hours[1].playback_sources] == [
        "file",
        "hls",
    ]
    assert hours[1].playback_sources[1].url.endswith(
        f"/index.m3u8?v={hours[1].revision}"
    )
    assert "/api/frigate/frigate-main/recording/front/start/" in hours[1].download_url


def test_recording_days_include_the_provider_retention_window() -> None:
    """Recording dates are not truncated by the event-history preference."""
    expected = ("2026-11-10", "2026-11-09", "2026-11-07")
    assert _recording_days(
        [
            {"day": "2026-11-10"},
            {"day": "2026-11-09"},
            {"day": "2026-11-07"},
        ],
        "UTC",
    ) == expected
    assert _recording_days(
        {"2026-11-10": True, "2026-11-09": True, "2026-11-07": True},
        "UTC",
    ) == expected


def test_recording_segments_are_clipped_across_clock_hour_boundaries() -> None:
    """A provider segment crossing the hour remains playable in both rows."""
    source = SimpleNamespace(
        camera_name="front",
        frigate_instance_id="frigate-main",
    )
    hour = datetime(2026, 11, 9, 22, tzinfo=UTC).timestamp()
    hours = _recording_hours(
        source,
        [{"start_time": hour + 3590, "end_time": hour + 3610}],
        RecordingQuery(selected_date="2026-11-09", timezone="UTC"),
    )

    assert len(hours) == 2
    assert (hours[0].spans[0].start_time, hours[0].spans[0].end_time) == (
        hour + 3600,
        hour + 3610,
    )
    assert (hours[1].spans[0].start_time, hours[1].spans[0].end_time) == (
        hour + 3590,
        hour + 3600,
    )


async def test_segment_download_is_resolved_by_the_frigate_provider(
    monkeypatch,
) -> None:
    """The shared API receives a normalized path rather than Frigate routing."""
    source = SimpleNamespace(
        camera_name="front door",
        frigate_instance_id="frigate/main",
    )

    async def resolve_source(_hass, _entity_id):
        return source

    monkeypatch.setattr(
        "custom_components.watchzone.providers.frigate.recordings.async_resolve_source",
        resolve_source,
    )

    download = await FrigateRecordingsProvider().async_resolve_segment(
        SimpleNamespace(),
        "camera.front",
        RecordingSegmentRequest(start_time=1_700_000_000, end_time=1_700_000_061),
    )

    assert download.path == (
        "/api/frigate/frigate%2Fmain/recording/front%20door/"
        "start/1700000000/end/1700000061?download=true"
    )
    assert download.filename == "front door-1700000000-1700000061.mp4"
    assert [source.transport for source in download.playback_sources] == [
        "file",
        "hls",
    ]
    assert download.preferred_transport == "hls"
