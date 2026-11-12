"""Tests for bounded volatile backend diagnostics."""

import logging

import custom_components.watchzone.backend_log as backend_log_module
from custom_components.watchzone.backend_log import BackendDiagnosticLog


def test_disabled_log_allocates_no_record_buffer() -> None:
    """Disabled diagnostics retain no event history."""
    backend_log = BackendDiagnosticLog()

    backend_log.record(logging.INFO, "lifecycle", "ignored", "not retained")

    assert backend_log.snapshot() == {
        "enabled": False,
        "record_limit": 200,
        "estimated_byte_limit": 192 * 1024,
        "estimated_bytes": 0,
        "evicted_records": 0,
        "rate_limited_events": 0,
        "records": [],
    }


def test_capture_redacts_and_collapses_repeated_python_logs() -> None:
    """Captured backend records are sanitized and consecutive repeats collapse."""
    backend_log = BackendDiagnosticLog(enabled=True)
    logger = logging.getLogger("custom_components.watchzone.providers.frigate.live")
    try:
        logger.warning(
            "Request %s failed with token=%s and Bearer %s",
            "https://frigate.local/api?authSig=secret",
            "private-token",
            "eyJhbGciOiJIUzI1NiJ9.payload.signature",
        )
        logger.warning(
            "Request %s failed with token=%s and Bearer %s",
            "https://frigate.local/api?authSig=secret",
            "private-token",
            "eyJhbGciOiJIUzI1NiJ9.payload.signature",
        )

        records = backend_log.snapshot()["records"]
        assert isinstance(records, list)
        captured = records[-1]
        assert captured["category"] == "providers.frigate.live"
        assert captured["repeat_count"] == 2
        assert "frigate.local" not in captured["message"]
        assert "private-token" not in captured["message"]
        assert "eyJ" not in captured["message"]
        assert "[REDACTED_URL]" in captured["message"]
    finally:
        backend_log.close()


def test_limits_release_memory_and_detach_handler(monkeypatch) -> None:
    """Count, byte, rate, disable, and close paths remain strictly bounded."""
    monkeypatch.setattr(backend_log_module, "_MAX_EVENTS_PER_SECOND", 1000)
    backend_log = BackendDiagnosticLog(enabled=True)
    package_logger = logging.getLogger("custom_components.watchzone")

    for index in range(300):
        backend_log.record(
            logging.INFO,
            "stress",
            f"event_{index}",
            f"{index}:" + ("x" * 2000),
        )

    snapshot = backend_log.snapshot()
    records = snapshot["records"]
    assert isinstance(records, list)
    assert len(records) <= snapshot["record_limit"]
    assert snapshot["estimated_bytes"] <= snapshot["estimated_byte_limit"]
    assert snapshot["evicted_records"] > 0
    assert backend_log in package_logger.handlers

    backend_log.set_enabled(False)

    disabled = backend_log.snapshot()
    assert disabled["enabled"] is False
    assert disabled["estimated_bytes"] == 0
    assert disabled["records"] == []
    assert backend_log not in package_logger.handlers
    backend_log.close()


def test_rate_limit_skips_excess_events_before_retention() -> None:
    """A backend logging storm cannot create unbounded retained work."""
    backend_log = BackendDiagnosticLog(enabled=True)
    try:
        for index in range(150):
            backend_log.record(
                logging.INFO,
                "stress",
                f"event_{index}",
                "bounded",
            )

        snapshot = backend_log.snapshot()
        assert snapshot["rate_limited_events"] > 0
        records = snapshot["records"]
        assert isinstance(records, list)
        assert len(records) <= 100
    finally:
        backend_log.close()
