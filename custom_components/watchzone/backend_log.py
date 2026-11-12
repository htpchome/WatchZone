"""Bounded, volatile backend diagnostics for WatchZone."""

from __future__ import annotations

import logging
import re
import time
from collections import deque
from dataclasses import dataclass
from datetime import UTC, datetime
from threading import Lock
from typing import Final, override

_LOGGER_NAMESPACE: Final = "custom_components.watchzone"
_MAX_RECORDS: Final = 200
_MAX_ESTIMATED_BYTES: Final = 192 * 1024
_MAX_MESSAGE_SOURCE_CHARS: Final = 4096
_MAX_MESSAGE_CHARS: Final = 768
_MAX_EVENTS_PER_SECOND: Final = 100
_RECORD_OVERHEAD_BYTES: Final = 256

_URL_PATTERN = re.compile(r"(?i)\b(?:https?|wss?)://[^\s<>'\"]+")
_BEARER_PATTERN = re.compile(r"(?i)\bbearer\s+[a-z0-9._~+/=-]+")
_SECRET_PATTERN = re.compile(
    r"(?i)\b(authsig|access_token|token|api_key|password|secret)"
    r"(\s*[:=]\s*)([^\s,;]+)"
)
_JWT_PATTERN = re.compile(
    r"\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}"
    r"(?:\.[a-zA-Z0-9_-]{8,})?\b"
)
_CONTROL_PATTERN = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_IDENTIFIER_PATTERN = re.compile(r"[^a-z0-9_.-]+")


@dataclass(slots=True)
class _BufferedRecord:
    """One sanitized diagnostic record."""

    sequence: int
    first_occurred: str
    last_occurred: str
    level: str
    category: str
    code: str
    message: str
    repeat_count: int = 1

    def as_dict(self) -> dict[str, str | int]:
        """Return an independent JSON-safe representation."""
        return {
            "sequence": self.sequence,
            "first_occurred": self.first_occurred,
            "last_occurred": self.last_occurred,
            "level": self.level,
            "category": self.category,
            "code": self.code,
            "message": self.message,
            "repeat_count": self.repeat_count,
        }


class BackendDiagnosticLog(logging.Handler):
    """Capture a bounded sanitized history without persistent storage."""

    def __init__(self, *, enabled: bool = False) -> None:
        """Initialize an empty disabled diagnostic log."""
        super().__init__(level=logging.WARNING)
        self._state_lock = Lock()
        self._records: deque[tuple[_BufferedRecord, int]] | None = None
        self._enabled = False
        self._estimated_bytes = 0
        self._sequence = 0
        self._evicted_records = 0
        self._rate_limited_events = 0
        self._window_started = 0.0
        self._window_events = 0
        if enabled:
            self.set_enabled(True)

    @property
    def enabled(self) -> bool:
        """Return whether volatile diagnostic capture is active."""
        with self._state_lock:
            return self._enabled

    def set_enabled(self, enabled: bool) -> None:
        """Enable capture or release all retained diagnostic memory."""
        package_logger = logging.getLogger(_LOGGER_NAMESPACE)
        with self._state_lock:
            if enabled == self._enabled:
                return
            if enabled:
                self._records = deque()
                self._enabled = True
                self._estimated_bytes = 0
                self._sequence = 0
                self._evicted_records = 0
                self._rate_limited_events = 0
                self._window_started = time.monotonic()
                self._window_events = 0

        if enabled:
            package_logger.addHandler(self)
            self.record(
                logging.INFO,
                "lifecycle",
                "diagnostic_logging_enabled",
                "Volatile diagnostic logging enabled",
            )
            return

        package_logger.removeHandler(self)
        with self._state_lock:
            self._enabled = False
            if self._records is not None:
                self._records.clear()
            self._records = None
            self._estimated_bytes = 0
            self._sequence = 0
            self._evicted_records = 0
            self._rate_limited_events = 0
            self._window_started = 0.0
            self._window_events = 0

    @override
    def emit(self, record: logging.LogRecord) -> None:
        """Capture WatchZone warnings and errors emitted through Python logging."""
        if not (
            record.name == _LOGGER_NAMESPACE
            or record.name.startswith(f"{_LOGGER_NAMESPACE}.")
        ):
            return
        try:
            message = record.getMessage()
        except Exception:  # pragma: no cover - logging must never raise
            message = "Unable to format backend log message"
        category = record.name.removeprefix(f"{_LOGGER_NAMESPACE}.")
        if category == _LOGGER_NAMESPACE:
            category = "integration"
        self._capture(record.levelno, category, "python_log", message)

    def record(self, level: int, category: str, code: str, message: str) -> None:
        """Record one structured event when diagnostics are enabled."""
        self._capture(level, category, code, message)

    def snapshot(self) -> dict[str, object]:
        """Return a detached snapshot safe for Home Assistant diagnostics."""
        with self._state_lock:
            records = self._records
            return {
                "enabled": self._enabled,
                "record_limit": _MAX_RECORDS,
                "estimated_byte_limit": _MAX_ESTIMATED_BYTES,
                "estimated_bytes": self._estimated_bytes,
                "evicted_records": self._evicted_records,
                "rate_limited_events": self._rate_limited_events,
                "records": (
                    []
                    if records is None
                    else [record.as_dict() for record, _size in records]
                ),
            }

    @override
    def close(self) -> None:
        """Detach the handler and release every retained record."""
        self.set_enabled(False)
        super().close()

    def _capture(self, level: int, category: str, code: str, message: str) -> None:
        """Sanitize and append one event within fixed resource limits."""
        now_monotonic = time.monotonic()
        with self._state_lock:
            if not self._enabled or self._records is None:
                return
            if now_monotonic - self._window_started >= 1.0:
                self._window_started = now_monotonic
                self._window_events = 0
            if self._window_events >= _MAX_EVENTS_PER_SECOND:
                self._rate_limited_events += 1
                return
            self._window_events += 1

        sanitized_category = _sanitize_identifier(category, "integration")
        sanitized_code = _sanitize_identifier(code, "event")
        sanitized_message = _sanitize_message(message)
        occurred = datetime.now(UTC).isoformat(timespec="milliseconds")
        level_name = logging.getLevelName(level)
        if not isinstance(level_name, str):
            level_name = "INFO"

        with self._state_lock:
            records = self._records
            if not self._enabled or records is None:
                return
            if records:
                previous, _previous_size = records[-1]
                if (
                    previous.level == level_name
                    and previous.category == sanitized_category
                    and previous.code == sanitized_code
                    and previous.message == sanitized_message
                ):
                    previous.last_occurred = occurred
                    previous.repeat_count += 1
                    return

            self._sequence += 1
            buffered = _BufferedRecord(
                sequence=self._sequence,
                first_occurred=occurred,
                last_occurred=occurred,
                level=level_name,
                category=sanitized_category,
                code=sanitized_code,
                message=sanitized_message,
            )
            estimated_size = _estimate_size(buffered)
            while records and (
                len(records) >= _MAX_RECORDS
                or self._estimated_bytes + estimated_size > _MAX_ESTIMATED_BYTES
            ):
                _discarded, discarded_size = records.popleft()
                self._estimated_bytes -= discarded_size
                self._evicted_records += 1
            records.append((buffered, estimated_size))
            self._estimated_bytes += estimated_size


def _sanitize_identifier(value: str, fallback: str) -> str:
    """Normalize a bounded category or event code."""
    normalized = _IDENTIFIER_PATTERN.sub("_", value.lower()).strip("_.-")
    return (normalized or fallback)[:80]


def _sanitize_message(value: str) -> str:
    """Remove URLs, common credentials, tokens, and control characters."""
    sanitized = _CONTROL_PATTERN.sub("", str(value)[:_MAX_MESSAGE_SOURCE_CHARS])
    sanitized = _URL_PATTERN.sub("[REDACTED_URL]", sanitized)
    sanitized = _BEARER_PATTERN.sub("Bearer [REDACTED]", sanitized)
    sanitized = _JWT_PATTERN.sub("[REDACTED_TOKEN]", sanitized)
    sanitized = _SECRET_PATTERN.sub(r"\1\2[REDACTED]", sanitized)
    if len(sanitized) > _MAX_MESSAGE_CHARS:
        return f"{sanitized[: _MAX_MESSAGE_CHARS - 1]}…"
    return sanitized


def _estimate_size(record: _BufferedRecord) -> int:
    """Estimate retained payload plus fixed Python-object overhead."""
    text_size = sum(
        len(value.encode("utf-8"))
        for value in (
            record.first_occurred,
            record.last_occurred,
            record.level,
            record.category,
            record.code,
            record.message,
        )
    )
    return _RECORD_OVERHEAD_BYTES + text_size
