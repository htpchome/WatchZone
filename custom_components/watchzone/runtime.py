"""Runtime state for a configured WatchZone entry."""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class IntegrationRuntime:
    """Runtime state owned by one WatchZone config entry."""

    entry_id: str
