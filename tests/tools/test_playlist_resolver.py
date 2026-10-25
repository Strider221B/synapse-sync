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
    """Test suite validating playlist page parsing, modern layout, and continuation handling."""

    _PLAYLIST_URL: ClassVar[str] = (
        "https://www.youtube.com/playlist?list=PLoROMvodv4rMiGQp3WXShtMGgzqpfVfbU"
    )

    def test_resolve_parses_playlist_html_successfully(self) -> None:
        """Verify resolve extracts title, video count, and legacy video items."""
        mock_data = self._create_mock_data("Stanford CS229", ["12345678901", "12345678902"])
        html = f"<html><body><script>var ytInitialData = {json.dumps(mock_data)};</script></body></html>"
        mock_session = MagicMock()
        mock_session.get.return_value = MagicMock(status_code=200, text=html)

        resolver = PlaylistResolver(url_utils=UrlUtils(), session=mock_session)
        result = resolver.resolve(self._PLAYLIST_URL)

        assert result["playlist_title"] == "Stanford CS229"
        assert result["video_count"] == 2
        assert len(result["videos"]) == 2
        assert result["videos"][0]["video_id"] == "12345678901"
        assert result["videos"][0]["title"] == "Lecture for 12345678901"
        assert result["videos"][0]["index"] == 1

    def test_resolve_parses_modern_lockup_view_model_layout(self) -> None:
        """Verify resolve extracts videos from modern lockupViewModel layout."""
        mock_data = self._create_lockup_mock_data(
            "Stanford EE292R",
            [("bt-R1RNc-5k", "Models of Computation"), ("IfkeGU4bEJI", "World Models")],
        )
        html = f"<script>var ytInitialData = {json.dumps(mock_data)};</script>"
        mock_session = MagicMock()
        mock_session.get.return_value = MagicMock(status_code=200, text=html)

        resolver = PlaylistResolver(session=mock_session)
        result = resolver.resolve(self._PLAYLIST_URL)

        assert result["playlist_title"] == "Stanford EE292R"
        assert result["video_count"] == 2
        assert result["videos"][0]["video_id"] == "bt-R1RNc-5k"
        assert result["videos"][0]["title"] == "Models of Computation"
        assert result["videos"][1]["video_id"] == "IfkeGU4bEJI"
        assert result["videos"][1]["index"] == 2

    def test_resolve_follows_continuation_tokens(self) -> None:
        """Verify resolve paginates through continuation tokens to collect all videos."""
        initial_data = self._create_lockup_mock_data(
            "Paged Playlist", [("vid00000001", "Video 1")], continuation_token="token_page_2"
        )
        page2_response = {
            "onResponseReceivedActions": [
                {
                    "appendContinuationItemsAction": {
                        "continuationItems": [
                            {
                                "lockupViewModel": {
                                    "contentId": "vid00000002",
                                    "metadata": {
                                        "lockupMetadataViewModel": {
                                            "title": {"content": "Video 2"}
                                        }
                                    },
                                }
                            }
                        ]
                    }
                }
            ]
        }
        mock_session = MagicMock()
        mock_session.get.return_value = MagicMock(
            status_code=200,
            text=f"<script>var ytInitialData = {json.dumps(initial_data)};</script>",
        )
        mock_session.post.return_value = MagicMock(status_code=200, json=lambda: page2_response)

        resolver = PlaylistResolver(session=mock_session)
        result = resolver.resolve(self._PLAYLIST_URL)

        assert result["video_count"] == 2
        assert result["videos"][0]["video_id"] == "vid00000001"
        assert result["videos"][1]["video_id"] == "vid00000002"

    def test_resolve_handles_continuation_failure_gracefully(self) -> None:
        """Verify resolve retains initial videos if continuation API call fails."""
        initial_data = self._create_lockup_mock_data(
            "Partial Playlist", [("vid00000001", "Video 1")], continuation_token="bad_token"
        )
        mock_session = MagicMock()
        mock_session.get.return_value = MagicMock(
            status_code=200,
            text=f"<script>var ytInitialData = {json.dumps(initial_data)};</script>",
        )
        mock_session.post.side_effect = requests.RequestException("API timeout")

        resolver = PlaylistResolver(session=mock_session)
        result = resolver.resolve(self._PLAYLIST_URL)

        assert result["video_count"] == 1
        assert result["videos"][0]["video_id"] == "vid00000001"

    def test_resolve_raises_value_error_on_invalid_playlist_url(self) -> None:
        """Verify resolve rejects URL lacking playlist identifier."""
        resolver = PlaylistResolver(url_utils=UrlUtils())
        with pytest.raises(ValueError, match="Invalid YouTube playlist URL"):
            resolver.resolve("https://youtube.com/watch?v=12345678901")

    def test_resolve_raises_value_error_on_404_response(self) -> None:
        """Verify resolve raises ValueError when playlist returns 404."""
        mock_session = MagicMock()
        mock_session.get.return_value = MagicMock(status_code=404)
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
        mock_session = MagicMock()
        mock_session.get.return_value = MagicMock(
            status_code=200, text=f"<script>var ytInitialData = {json.dumps(alert_data)};</script>"
        )
        resolver = PlaylistResolver(session=mock_session)
        with pytest.raises(ValueError, match="Playlist unavailable"):
            resolver.resolve(self._PLAYLIST_URL)

    def test_resolve_raises_value_error_when_no_videos_found(self) -> None:
        """Verify resolve raises ValueError when playlist contains no video renderers."""
        empty_data = self._create_mock_data("Empty Playlist", [])
        mock_session = MagicMock()
        mock_session.get.return_value = MagicMock(
            status_code=200, text=f"<script>var ytInitialData = {json.dumps(empty_data)};</script>"
        )
        resolver = PlaylistResolver(session=mock_session)
        with pytest.raises(ValueError, match="No videos found in playlist"):
            resolver.resolve(self._PLAYLIST_URL)

    def test_resolve_raises_value_error_when_initial_data_missing(self) -> None:
        """Verify resolve raises ValueError when ytInitialData block is not in HTML."""
        mock_session = MagicMock()
        mock_session.get.return_value = MagicMock(
            status_code=200, text="<html><body>No data here</body></html>"
        )
        resolver = PlaylistResolver(session=mock_session)
        with pytest.raises(ValueError, match="Failed to parse playlist data"):
            resolver.resolve(self._PLAYLIST_URL)

    def test_resolve_extracts_title_from_page_header_view_model(self) -> None:
        """Verify resolve extracts title from dynamicTextViewModel in pageHeaderRenderer."""
        data = {
            "header": {
                "pageHeaderRenderer": {
                    "content": {
                        "pageHeaderViewModel": {
                            "title": {
                                "dynamicTextViewModel": {
                                    "text": {"content": "Advanced Machine Learning"}
                                }
                            }
                        }
                    }
                }
            },
            "contents": self._wrap_sections([
                {
                    "lockupViewModel": {
                        "contentId": "11111111111",
                        "metadata": {
                            "lockupMetadataViewModel": {"title": {"content": "Intro"}}
                        },
                    }
                }
            ]),
        }
        mock_session = MagicMock()
        mock_session.get.return_value = MagicMock(
            status_code=200, text=f"<script>var ytInitialData = {json.dumps(data)};</script>"
        )
        resolver = PlaylistResolver(session=mock_session)
        result = resolver.resolve(self._PLAYLIST_URL)

        assert result["playlist_title"] == "Advanced Machine Learning"
        assert result["video_count"] == 1

    def test_resolve_raises_value_error_on_invalid_json(self) -> None:
        """Verify resolve raises ValueError when ytInitialData contains malformed JSON."""
        html = "<script>var ytInitialData = {broken json};</script>"
        mock_session = MagicMock()
        mock_session.get.return_value = MagicMock(status_code=200, text=html)
        resolver = PlaylistResolver(session=mock_session)
        with pytest.raises(ValueError, match="Invalid JSON in YouTube playlist page"):
            resolver.resolve(self._PLAYLIST_URL)

    def test_resolve_detects_alert_with_runs_text(self) -> None:
        """Verify resolve detects alert messages specified via runs list."""
        alert_data = {
            "alerts": [
                {"alertRenderer": {"text": {"runs": [{"text": "The playlist is unavailable."}]}}}
            ]
        }
        mock_session = MagicMock()
        mock_session.get.return_value = MagicMock(
            status_code=200, text=f"<script>var ytInitialData = {json.dumps(alert_data)};</script>"
        )
        resolver = PlaylistResolver(session=mock_session)
        with pytest.raises(ValueError, match="Playlist unavailable"):
            resolver.resolve(self._PLAYLIST_URL)

    def test_resolve_extracts_title_from_sidebar_and_microformat(self) -> None:
        """Verify resolve extracts playlist title from sidebar primary info or microformat."""
        sidebar_data = {
            "sidebar": {
                "playlistSidebarRenderer": {
                    "items": [
                        {
                            "playlistSidebarPrimaryInfoRenderer": {
                                "title": {"runs": [{"text": "Sidebar Playlist Title"}]}
                            }
                        }
                    ]
                }
            },
            "contents": self._wrap_sections([
                {
                    "lockupViewModel": {
                        "contentId": "22222222222",
                        "metadata": {
                            "lockupMetadataViewModel": {"title": {"content": "V1"}}
                        },
                    }
                }
            ]),
        }
        mock_session = MagicMock()
        mock_session.get.return_value = MagicMock(
            status_code=200,
            text=f"<script>var ytInitialData = {json.dumps(sidebar_data)};</script>",
        )
        resolver = PlaylistResolver(session=mock_session)
        result = resolver.resolve(self._PLAYLIST_URL)
        assert result["playlist_title"] == "Sidebar Playlist Title"

    def test_resolve_parses_single_column_browse_results_renderer(self) -> None:
        """Verify resolve parses layout with singleColumnBrowseResultsRenderer."""
        item = {
            "playlistVideoRenderer": {
                "videoId": "33333333333",
                "title": {"runs": [{"text": "Video Run"}]},
            }
        }
        data = {
            "metadata": {"playlistMetadataRenderer": {"title": "Mobile Playlist"}},
            "contents": self._wrap_sections([item], single_column=True),
        }
        mock_session = MagicMock()
        mock_session.get.return_value = MagicMock(
            status_code=200, text=f"<script>var ytInitialData = {json.dumps(data)};</script>"
        )
        resolver = PlaylistResolver(session=mock_session)
        result = resolver.resolve(self._PLAYLIST_URL)
        assert result["playlist_title"] == "Mobile Playlist"
        assert result["videos"][0]["title"] == "Video Run"

    def test_resolve_extracts_lockup_from_watch_endpoint_and_a11y(self) -> None:
        """Verify resolve extracts video ID from watchEndpoint and title from a11y label."""
        lockup_item = {
            "lockupViewModel": {
                "rendererContext": {
                    "accessibilityContext": {"label": "A11y Title"},
                    "commandContext": {
                        "onTap": {
                            "innertubeCommand": {
                                "watchEndpoint": {"videoId": "44444444444"}
                            }
                        }
                    },
                }
            }
        }
        data = {"contents": self._wrap_sections([lockup_item])}
        mock_session = MagicMock()
        mock_session.get.return_value = MagicMock(
            status_code=200, text=f"<script>var ytInitialData = {json.dumps(data)};</script>"
        )
        resolver = PlaylistResolver(session=mock_session)
        result = resolver.resolve(self._PLAYLIST_URL)
        assert result["videos"][0]["video_id"] == "44444444444"
        assert result["videos"][0]["title"] == "A11y Title"

    def test_resolve_handles_legacy_continuation_and_non_200(self) -> None:
        """Verify resolve handles continuationItemRenderer and non-200 continuation response."""
        items: list[dict[str, Any]] = [
            {
                "playlistVideoRenderer": {
                    "videoId": "55555555555",
                    "title": {"simpleText": "V1"},
                }
            },
            {
                "continuationItemRenderer": {
                    "continuationEndpoint": {
                        "continuationCommand": {"token": "tok123"}
                    }
                }
            },
        ]
        data = {"contents": self._wrap_sections(items)}
        mock_session = MagicMock()
        mock_session.get.return_value = MagicMock(
            status_code=200,
            text=(
                f'<script>var ytInitialData = {json.dumps(data)};</script>'
                '"INNERTUBE_API_KEY":"AIzaSyCUSTOM_KEY"'
                '"INNERTUBE_CLIENT_VERSION":"2.20261024.00"'
            ),
        )
        mock_session.post.return_value = MagicMock(status_code=500)
        resolver = PlaylistResolver(session=mock_session)
        result = resolver.resolve(self._PLAYLIST_URL)
        assert result["video_count"] == 1
        assert result["videos"][0]["video_id"] == "55555555555"

    def _wrap_sections(
        self, items: list[dict[str, Any]], single_column: bool = False
    ) -> dict[str, Any]:
        """Wrap a list of items into standard tabs and section list structure."""
        renderer_name = (
            "singleColumnBrowseResultsRenderer" if single_column else "twoColumnBrowseResultsRenderer"
        )
        return {
            renderer_name: {
                "tabs": [
                    {
                        "tabRenderer": {
                            "content": {
                                "sectionListRenderer": {
                                    "contents": [{"itemSectionRenderer": {"contents": items}}]
                                }
                            }
                        }
                    }
                ]
            }
        }

    def _create_mock_data(self, title: str, video_ids: list[str]) -> dict[str, Any]:
        """Construct a sample ytInitialData dictionary for legacy format."""
        renderers = [
            {
                "playlistVideoRenderer": {
                    "videoId": vid,
                    "title": {"simpleText": f"Lecture for {vid}"},
                }
            }
            for vid in video_ids
        ]
        items = [{"playlistVideoListRenderer": {"contents": renderers}}]
        return {
            "metadata": {"playlistMetadataRenderer": {"title": title}},
            "contents": self._wrap_sections(items),
        }

    def _create_lockup_mock_data(
        self,
        title: str,
        videos: list[tuple[str, str]],
        continuation_token: str | None = None,
    ) -> dict[str, Any]:
        """Construct a sample ytInitialData dictionary for modern lockupViewModel layout."""
        items: list[dict[str, Any]] = [
            {
                "lockupViewModel": {
                    "contentId": vid,
                    "metadata": {
                        "lockupMetadataViewModel": {"title": {"content": vid_title}}
                    },
                }
            }
            for vid, vid_title in videos
        ]
        sec_contents: list[dict[str, Any]] = [{"itemSectionRenderer": {"contents": items}}]
        if continuation_token:
            sec_contents.append({
                "continuationItemViewModel": {
                    "continuationCommand": {
                        "innertubeCommand": {
                            "continuationCommand": {"token": continuation_token}
                        }
                    }
                }
            })
        return {
            "header": {"pageHeaderRenderer": {"pageTitle": title}},
            "contents": {
                "twoColumnBrowseResultsRenderer": {
                    "tabs": [
                        {
                            "tabRenderer": {
                                "content": {"sectionListRenderer": {"contents": sec_contents}}
                            }
                        }
                    ]
                }
            },
        }
