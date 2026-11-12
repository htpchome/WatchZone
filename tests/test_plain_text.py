"""Tests for shared user-authored plain-text normalization."""

from custom_components.watchzone.plain_text import normalize_plain_text


def test_plain_text_preserves_unicode_and_removes_controls() -> None:
    """Display punctuation remains while controls and excess spacing do not."""
    assert (
        normalize_plain_text("  Café\x00\n —   driveway  ", max_length=64)
        == "Café — driveway"
    )


def test_plain_text_limits_unicode_code_points() -> None:
    """Length limits do not split a multi-code-unit character."""
    assert normalize_plain_text("🚀" * 4, max_length=3) == "🚀" * 3
