"""Unit tests for the TranscriptFetcher class."""

from __future__ import annotations

from typing import Any, ClassVar
from unittest.mock import MagicMock

import pytest
from youtube_transcript_api import (
    CouldNotRetrieveTranscript,
    InvalidVideoId,
    NoTranscriptFound,
    TranscriptsDisabled,
    VideoUnavailable,
)

from tools.youtube_cli.transcript_fetcher import TranscriptFetcher
from tools.youtube_cli.transcripts_disabled_error import TranscriptsDisabledError
from tools.youtube_cli.url_utils import UrlUtils
from tools.youtube_cli.video_unavailable_error import VideoUnavailableError


class TestTranscriptFetcher:
    """Test suite validating transcript retrieval and exception normalization."""

    _VIDEO_ID: ClassVar[str] = "jGwO_UgTS7I"
    _VIDEO_URL: ClassVar[str] = "https://www.youtube.com/watch?v=jGwO_UgTS7I"
    _SNIPPET_1: ClassVar[dict[str, Any]] = {
        "text": "Welcome to CS229.",
        "start": 0.0,
        "duration": 2.5,
    }
    _SNIPPET_2: ClassVar[dict[str, Any]] = {
        "text": "Today we discuss ML.",
        "start": 2.5,
        "duration": 3.0,
    }

    def test_fetch_success_with_valid_snippets(self) -> None:
        """Verify fetch returns joined text and accurate word and segment counts."""
        mock_api = MagicMock()
        mock_api.fetch.return_value = [self._SNIPPET_1, self._SNIPPET_2]

        fetcher = TranscriptFetcher(api_client=mock_api, url_utils=UrlUtils())
        result = fetcher.fetch(self._VIDEO_URL)

        assert result["video_id"] == self._VIDEO_ID
        assert result["transcript"] == "Welcome to CS229. Today we discuss ML."
        assert result["word_count"] == 7
        assert result["segment_count"] == 2

    def test_fetch_success_with_object_snippets(self) -> None:
        """Verify fetch handles snippet items represented as objects with a text attribute."""
        class MockSnippet:
            def __init__(self, text: str) -> None:
                self.text = text

        mock_api = MagicMock()
        mock_api.fetch.return_value = [MockSnippet("Object text one"), MockSnippet("two")]

        fetcher = TranscriptFetcher(api_client=mock_api)
        result = fetcher.fetch(self._VIDEO_ID)

        assert result["transcript"] == "Object text one two"
        assert result["segment_count"] == 2

    def test_fetch_raises_value_error_on_invalid_url(self) -> None:
        """Verify fetch raises ValueError when URL or ID is invalid."""
        fetcher = TranscriptFetcher(api_client=MagicMock())
        with pytest.raises(ValueError, match="Invalid YouTube video URL"):
            fetcher.fetch("not-a-valid-url")

    def test_fetch_maps_transcripts_disabled_to_custom_exception(self) -> None:
        """Verify TranscriptsDisabled exception is converted to TranscriptsDisabledError."""
        mock_api = MagicMock()
        mock_api.fetch.side_effect = TranscriptsDisabled(self._VIDEO_ID)

        fetcher = TranscriptFetcher(api_client=mock_api)
        with pytest.raises(TranscriptsDisabledError, match="No transcripts available"):
            fetcher.fetch(self._VIDEO_URL)

    def test_fetch_maps_no_transcript_found_to_custom_exception(self) -> None:
        """Verify NoTranscriptFound is converted to TranscriptsDisabledError."""
        mock_api = MagicMock()
        mock_api.fetch.side_effect = NoTranscriptFound(self._VIDEO_ID, ["en"], None)

        fetcher = TranscriptFetcher(api_client=mock_api)
        with pytest.raises(TranscriptsDisabledError, match="No transcripts available"):
            fetcher.fetch(self._VIDEO_URL)

    def test_fetch_maps_video_unavailable_to_custom_exception(self) -> None:
        """Verify VideoUnavailable is mapped to VideoUnavailableError."""
        mock_api = MagicMock()
        mock_api.fetch.side_effect = VideoUnavailable(self._VIDEO_ID)

        fetcher = TranscriptFetcher(api_client=mock_api)
        with pytest.raises(VideoUnavailableError, match="is unavailable"):
            fetcher.fetch(self._VIDEO_URL)

    def test_fetch_maps_invalid_video_id_to_custom_exception(self) -> None:
        """Verify InvalidVideoId is mapped to VideoUnavailableError."""
        mock_api = MagicMock()
        mock_api.fetch.side_effect = InvalidVideoId(self._VIDEO_ID)

        fetcher = TranscriptFetcher(api_client=mock_api)
        with pytest.raises(VideoUnavailableError, match="is unavailable"):
            fetcher.fetch(self._VIDEO_URL)

    def test_fetch_maps_network_error_to_connection_error(self) -> None:
        """Verify network retrieval failures raise ConnectionError with retry hint."""
        mock_api = MagicMock()
        mock_api.fetch.side_effect = CouldNotRetrieveTranscript(self._VIDEO_ID)

        fetcher = TranscriptFetcher(api_client=mock_api)
        with pytest.raises(ConnectionError, match="Network failure"):
            fetcher.fetch(self._VIDEO_URL)
