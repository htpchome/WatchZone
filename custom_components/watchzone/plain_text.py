"""Shared normalization for user-authored single-line text."""

from __future__ import annotations

import unicodedata


def normalize_plain_text(value: str, *, max_length: int) -> str:
    """Normalize safe display text while preserving valid Unicode punctuation."""
    characters: list[str] = []
    previous_was_space = False
    for source_character in unicodedata.normalize("NFKC", value):
        character = " " if source_character.isspace() else source_character
        if unicodedata.category(character).startswith("C"):
            continue
        if character == " ":
            if not characters or previous_was_space:
                continue
            previous_was_space = True
        else:
            previous_was_space = False
        characters.append(character)
        if len(characters) >= max_length:
            break
    return "".join(characters).rstrip()
