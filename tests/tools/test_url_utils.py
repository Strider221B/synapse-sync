"""Unit tests for the UrlUtils YouTube URL parsing helper."""

from __future__ import annotations

from typing import ClassVar

import pytest

from tools.youtube_cli.url_utils import UrlUtils


class TestUrlUtils:
    """Test suite validating URL parsing, validation, and ID extraction."""

    _SAMPLE_VIDEO_ID: ClassVar[str] = "dQw4w9WgXcQ"
    _SAMPLE_PLAYLIST_ID: ClassVar[str] = "PLoROMvodv4rMiGQp3WXShtMGgzqpfVfbU"
    _STANDARD_WATCH_URL: ClassVar[str] = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    _SHORT_URL: ClassVar[str] = "https://youtu.be/dQw4w9WgXcQ"
    _EMBED_URL: ClassVar[str] = "https://www.youtube.com/embed/dQw4w9WgXcQ"
    _SHORTS_URL: ClassVar[str] = "https://www.youtube.com/shorts/dQw4w9WgXcQ"
    _PLAYLIST_URL: ClassVar[str] = (
        "https://www.youtube.com/playlist?list=PLoROMvodv4rMiGQp3WXShtMGgzqpfVfbU"
    )

    def test_is_video_url_returns_true_for_valid_video_formats(self) -> None:
        """Verify is_video_url recognizes watch, short, embed, and bare video identifiers."""
        utils = UrlUtils()
        assert utils.is_video_url(self._STANDARD_WATCH_URL) is True
        assert utils.is_video_url(self._SHORT_URL) is True
        assert utils.is_video_url(self._EMBED_URL) is True
        assert utils.is_video_url(self._SHORTS_URL) is True
        assert utils.is_video_url(self._SAMPLE_VIDEO_ID) is True

    def test_is_video_url_returns_false_for_invalid_and_playlist_only_urls(self) -> None:
        """Verify is_video_url returns False for non-video URLs and playlist-only URLs."""
        utils = UrlUtils()
        assert utils.is_video_url(self._PLAYLIST_URL) is False
        assert utils.is_video_url("https://example.com/something") is False
        assert utils.is_video_url("") is False

    def test_is_playlist_url_detects_playlist_query_parameter(self) -> None:
        """Verify is_playlist_url identifies URLs containing a playlist parameter."""
        utils = UrlUtils()
        assert utils.is_playlist_url(self._PLAYLIST_URL) is True
        combo_url = f"{self._STANDARD_WATCH_URL}&list={self._SAMPLE_PLAYLIST_ID}"
        assert utils.is_playlist_url(combo_url) is True
        assert utils.is_playlist_url(self._STANDARD_WATCH_URL) is False
        assert utils.is_playlist_url("") is False

    def test_extract_video_id_extracts_from_various_formats(self) -> None:
        """Verify extract_video_id correctly resolves the 11-char ID from all patterns."""
        utils = UrlUtils()
        assert utils.extract_video_id(self._STANDARD_WATCH_URL) == self._SAMPLE_VIDEO_ID
        assert utils.extract_video_id(self._SHORT_URL) == self._SAMPLE_VIDEO_ID
        assert utils.extract_video_id(self._EMBED_URL) == self._SAMPLE_VIDEO_ID
        assert utils.extract_video_id(self._SHORTS_URL) == self._SAMPLE_VIDEO_ID
        assert utils.extract_video_id(self._SAMPLE_VIDEO_ID) == self._SAMPLE_VIDEO_ID

    def test_extract_video_id_returns_none_for_invalid_inputs(self) -> None:
        """Verify extract_video_id returns None for malformed URLs or non-strings."""
        utils = UrlUtils()
        assert utils.extract_video_id("invalid-id") is None
        assert utils.extract_video_id("https://google.com") is None
        assert utils.extract_video_id("") is None

    def test_extract_playlist_id_returns_id_or_none(self) -> None:
        """Verify extract_playlist_id captures list parameter or returns None."""
        utils = UrlUtils()
        assert utils.extract_playlist_id(self._PLAYLIST_URL) == self._SAMPLE_PLAYLIST_ID
        assert utils.extract_playlist_id(self._STANDARD_WATCH_URL) is None
        assert utils.extract_playlist_id("") is None

    def test_build_video_url_creates_canonical_watch_url(self) -> None:
        """Verify build_video_url constructs valid canonical YouTube link."""
        utils = UrlUtils()
        canonical = utils.build_video_url(self._SAMPLE_VIDEO_ID)
        assert canonical == self._STANDARD_WATCH_URL

    def test_build_video_url_raises_value_error_on_invalid_id(self) -> None:
        """Verify build_video_url raises ValueError when given an invalid ID length or format."""
        utils = UrlUtils()
        with pytest.raises(ValueError, match="Invalid YouTube video ID format"):
            utils.build_video_url("short")
