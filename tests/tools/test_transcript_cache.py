"""Unit tests for the TranscriptCache filesystem caching layer."""

from __future__ import annotations

from pathlib import Path
from typing import ClassVar

import pytest

from tools.youtube_cli.transcript_cache import TranscriptCache


class TestTranscriptCache:
    """Test suite verifying transcript caching, existence checks, and retrieval."""

    _VIDEO_ID: ClassVar[str] = "dQw4w9WgXcQ"
    _TRANSCRIPT_TEXT: ClassVar[str] = "Never gonna give you up never gonna let you down"
    _METADATA: ClassVar[dict[str, str]] = {"title": "Rick Astley Song"}

    def test_has_returns_false_when_item_not_cached(self, tmp_path: Path) -> None:
        """Verify has returns False when video ID is not present in cache directory."""
        cache = TranscriptCache(cache_dir=str(tmp_path))
        assert cache.has(self._VIDEO_ID) is False
        assert cache.has("") is False

    def test_put_stores_transcript_and_has_returns_true(self, tmp_path: Path) -> None:
        """Verify put persists JSON file and subsequent has call returns True."""
        cache = TranscriptCache(cache_dir=str(tmp_path))
        cache.put(self._VIDEO_ID, self._TRANSCRIPT_TEXT, self._METADATA)

        assert cache.has(self._VIDEO_ID) is True
        expected_file = tmp_path / f"{self._VIDEO_ID}.json"
        assert expected_file.is_file()

    def test_get_retrieves_cached_transcript_and_metadata(self, tmp_path: Path) -> None:
        """Verify get returns exact dictionary persisted with put."""
        cache = TranscriptCache(cache_dir=str(tmp_path))
        cache.put(self._VIDEO_ID, self._TRANSCRIPT_TEXT, self._METADATA)

        result = cache.get(self._VIDEO_ID)
        assert result is not None
        assert result["transcript"] == self._TRANSCRIPT_TEXT
        assert result["metadata"]["title"] == "Rick Astley Song"

    def test_get_returns_none_for_missing_or_corrupt_files(self, tmp_path: Path) -> None:
        """Verify get safely returns None for absent or malformed JSON files."""
        cache = TranscriptCache(cache_dir=str(tmp_path))
        assert cache.get("missing_id") is None

        corrupt_file = tmp_path / "corrupt_id.json"
        corrupt_file.write_text("invalid json content", encoding="utf-8")
        assert cache.get("corrupt_id") is None

    def test_put_raises_value_error_on_empty_video_id(self, tmp_path: Path) -> None:
        """Verify put rejects empty video ID with ValueError."""
        cache = TranscriptCache(cache_dir=str(tmp_path))
        with pytest.raises(ValueError, match="video_id cannot be empty"):
            cache.put("", self._TRANSCRIPT_TEXT)
