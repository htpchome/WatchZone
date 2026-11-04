"""Translation catalog contract tests."""

import json
from pathlib import Path
from typing import Any

TRANSLATIONS = Path("custom_components/watchzone/translations")
SUPPORTED_LOCALES = {
    "ca",
    "de",
    "el",
    "en",
    "en-GB",
    "es",
    "es-419",
    "fr",
    "it",
    "pl",
    "pt",
    "pt-BR",
}


def _leaf_paths(value: dict[str, Any], prefix: str = "") -> set[str]:
    """Return every translated leaf path in a catalog."""
    paths: set[str] = set()
    for key, child in value.items():
        path = f"{prefix}.{key}" if prefix else key
        if isinstance(child, dict):
            paths.update(_leaf_paths(child, path))
        else:
            assert isinstance(child, str) and child.strip(), path
            paths.add(path)
    return paths


def test_backend_translation_catalogs_match_english_contract() -> None:
    """Every supported HA locale exposes the complete backend vocabulary."""
    files = {path.stem for path in TRANSLATIONS.glob("*.json")}
    assert files == SUPPORTED_LOCALES
    english = json.loads((TRANSLATIONS / "en.json").read_text(encoding="utf-8"))
    expected = _leaf_paths(english)
    for locale in sorted(SUPPORTED_LOCALES):
        catalog = json.loads(
            (TRANSLATIONS / f"{locale}.json").read_text(encoding="utf-8")
        )
        assert _leaf_paths(catalog) == expected, locale
