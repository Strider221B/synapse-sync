"""Unit tests for the PlaylistResolver class."""

from __future__ import annotations

import json
from typing import Any, ClassVar
from unittest.mock import MagicMock

import pytest
import requests

from tools.youtube_cli.playlist_resolver import PlaylistResolver
from tools.youtube_cli.url_utils import UrlUtils


class TestPlaylistResolver:
    """Test suite validating playlist page parsing and error handling."""

    _PLAYLIST_URL: ClassVar[str] = (
        "https://www.youtube.com/playlist?list=PLoROMvodv4rMiGQp3WXShtMGgzqpfVfbU"
    )

    def _create_mock_data(self, title: str, video_ids: list[str]) -> dict[str, Any]:
        """Construct a sample ytInitialData dictionary."""
        renderers = [
            {
                "playlistVideoRenderer": {
                    "videoId": vid,
                    "title": {"simpleText": f"Lecture for {vid}"},
                }
            }
            for vid in video_ids
        ]
        return {
            "metadata": {"playlistMetadataRenderer": {"title": title}},
            "contents": {
                "twoColumnBrowseResultsRenderer": {
                    "tabs": [
                        {
                            "tabRenderer": {
                                "content": {
                                    "sectionListRenderer": {
                                        "contents": [
                                            {
                                                "itemSectionRenderer": {
                                                    "contents": [
                                                        {
                                                            "playlistVideoListRenderer": {
                                                                "contents": renderers
                                                            }
                                                        }
                                                    ]
                                                }
                                            }
                                        ]
                                    }
                                }
                            }
                        }
                    ]
                }
            },
        }

    def test_resolve_parses_playlist_html_successfully(self) -> None:
        """Verify resolve extracts title, video count, and individual video items."""
        mock_data = self._create_mock_data("Stanford CS229", ["12345678901", "12345678902"])
        json_data = json.dumps(mock_data)
        html = f"<html><body><script>var ytInitialData = {json_data};</script></body></html>"

        mock_session = MagicMock()
        mock_response = MagicMock(status_code=200, text=html)
        mock_session.get.return_value = mock_response

        resolver = PlaylistResolver(url_utils=UrlUtils(), session=mock_session)
        result = resolver.resolve(self._PLAYLIST_URL)

        assert result["playlist_title"] == "Stanford CS229"
        assert result["video_count"] == 2
        assert len(result["videos"]) == 2
        assert result["videos"][0]["video_id"] == "12345678901"
        assert result["videos"][0]["title"] == "Lecture for 12345678901"
        assert result["videos"][0]["index"] == 1

    def test_resolve_raises_value_error_on_invalid_playlist_url(self) -> None:
        """Verify resolve rejects URL lacking playlist identifier."""
        resolver = PlaylistResolver(url_utils=UrlUtils())
        with pytest.raises(ValueError, match="Invalid YouTube playlist URL"):
            resolver.resolve("https://youtube.com/watch?v=12345678901")

    def test_resolve_raises_value_error_on_404_response(self) -> None:
        """Verify resolve raises ValueError when playlist returns 404."""
        mock_session = MagicMock()
        mock_response = MagicMock(status_code=404)
        mock_session.get.return_value = mock_response

        resolver = PlaylistResolver(session=mock_session)
        with pytest.raises(ValueError, match="Playlist not found or is private"):
            resolver.resolve(self._PLAYLIST_URL)

    def test_resolve_raises_connection_error_on_network_failure(self) -> None:
        """Verify resolve converts RequestException to ConnectionError."""
        mock_session = MagicMock()
        mock_session.get.side_effect = requests.RequestException("DNS lookup failed")

        resolver = PlaylistResolver(session=mock_session)
        with pytest.raises(ConnectionError, match="Failed to connect to YouTube playlist"):
            resolver.resolve(self._PLAYLIST_URL)

    def test_resolve_raises_value_error_on_private_alert(self) -> None:
        """Verify resolve detects private playlist alert in ytInitialData."""
        alert_data = {
            "alerts": [
                {"alertRenderer": {"text": {"simpleText": "This playlist is private."}}}
            ]
        }
        html = f"<script>var ytInitialData = {json.dumps(alert_data)};</script>"
        mock_session = MagicMock()
        mock_response = MagicMock(status_code=200, text=html)
        mock_session.get.return_value = mock_response

        resolver = PlaylistResolver(session=mock_session)
        with pytest.raises(ValueError, match="Playlist unavailable"):
            resolver.resolve(self._PLAYLIST_URL)

    def test_resolve_raises_value_error_when_no_videos_found(self) -> None:
        """Verify resolve raises ValueError when playlist contains no video renderers."""
        empty_data = self._create_mock_data("Empty Playlist", [])
        html = f"<script>var ytInitialData = {json.dumps(empty_data)};</script>"
        mock_session = MagicMock()
        mock_response = MagicMock(status_code=200, text=html)
        mock_session.get.return_value = mock_response

        resolver = PlaylistResolver(session=mock_session)
        with pytest.raises(ValueError, match="No videos found in playlist"):
            resolver.resolve(self._PLAYLIST_URL)

    def test_resolve_raises_value_error_when_initial_data_missing(self) -> None:
        """Verify resolve raises ValueError when ytInitialData block is not in HTML."""
        html = "<html><body>No data here</body></html>"
        mock_session = MagicMock()
        mock_response = MagicMock(status_code=200, text=html)
        mock_session.get.return_value = mock_response

        resolver = PlaylistResolver(session=mock_session)
        with pytest.raises(ValueError, match="Failed to parse playlist data"):
            resolver.resolve(self._PLAYLIST_URL)
