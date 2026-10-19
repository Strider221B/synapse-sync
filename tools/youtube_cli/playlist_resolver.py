"""Resolves YouTube playlists to video lists and titles via web inspection."""

from __future__ import annotations

import json
import re
from typing import Any, ClassVar

import requests

from tools.youtube_cli.url_utils import UrlUtils


class PlaylistResolver:
    """Resolves individual video metadata from a YouTube playlist URL."""

    _BASE_PLAYLIST_URL: ClassVar[str] = "https://www.youtube.com/playlist?list="
    _REGEX_INITIAL_DATA: ClassVar[re.Pattern[str]] = re.compile(
        r"var\s+ytInitialData\s*=\s*({.+?});(?:</script>|\n)"
    )
    _REGEX_FALLBACK_DATA: ClassVar[re.Pattern[str]] = re.compile(
        r"ytInitialData\s*=\s*({.+?});"
    )
    _USER_AGENT: ClassVar[str] = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    _TIMEOUT_SECONDS: ClassVar[int] = 15
    _KEY_PLAYLIST_TITLE: ClassVar[str] = "playlist_title"
    _KEY_VIDEO_COUNT: ClassVar[str] = "video_count"
    _KEY_VIDEOS: ClassVar[str] = "videos"
    _DEFAULT_TITLE: ClassVar[str] = "YouTube Playlist"
    _RENDERER_KEY: ClassVar[str] = "playlistVideoRenderer"

    def __init__(
        self,
        url_utils: UrlUtils | None = None,
        session: requests.Session | None = None,
    ) -> None:
        """Initialize PlaylistResolver with URL utility and optional HTTP session."""
        self._url_utils = url_utils if url_utils is not None else UrlUtils()
        self._session = session if session is not None else requests.Session()
        if hasattr(self._session, "headers") and hasattr(self._session.headers, "update"):
            self._session.headers.update({"User-Agent": self._USER_AGENT})

    def resolve(self, playlist_url: str) -> dict[str, Any]:
        """Fetch and extract all video entries and title from a YouTube playlist."""
        playlist_id = self._url_utils.extract_playlist_id(playlist_url)
        if not playlist_id:
            raise ValueError(f"Invalid YouTube playlist URL: {playlist_url}")

        html_text = self._fetch_playlist_html(playlist_id)
        data = self._parse_initial_data(html_text)
        self._check_for_playlist_errors(data)

        title = self._extract_playlist_title(data)
        videos = self._extract_videos(data)
        if not videos:
            raise ValueError("No videos found in playlist or playlist is empty/private")

        return {
            self._KEY_PLAYLIST_TITLE: title,
            self._KEY_VIDEO_COUNT: len(videos),
            self._KEY_VIDEOS: videos,
        }

    def _fetch_playlist_html(self, playlist_id: str) -> str:
        """Fetch the playlist landing page HTML."""
        target_url = f"{self._BASE_PLAYLIST_URL}{playlist_id}"
        try:
            response = self._session.get(target_url, timeout=self._TIMEOUT_SECONDS)
            if response.status_code == 404:
                raise ValueError("Playlist not found or is private")
            response.raise_for_status()
            return response.text
        except requests.RequestException as err:
            raise ConnectionError(f"Failed to connect to YouTube playlist: {err}") from err

    def _parse_initial_data(self, html_text: str) -> dict[str, Any]:
        """Extract and decode ytInitialData JSON object embedded in HTML."""
        match = self._REGEX_INITIAL_DATA.search(html_text)
        if not match:
            match = self._REGEX_FALLBACK_DATA.search(html_text)
        if not match:
            raise ValueError("Failed to parse playlist data from YouTube")
        try:
            parsed: dict[str, Any] = json.loads(match.group(1))
            return parsed
        except json.JSONDecodeError as err:
            raise ValueError(f"Invalid JSON in YouTube playlist page: {err}") from err

    def _check_for_playlist_errors(self, data: dict[str, Any]) -> None:
        """Inspect data for alerts indicating private or non-existent playlist."""
        alerts = data.get("alerts", [])
        for alert in alerts:
            alert_renderer = alert.get("alertRenderer", {})
            text_block = alert_renderer.get("text", {})
            msg = text_block.get("simpleText") or "".join(
                r.get("text", "") for r in text_block.get("runs", [])
            )
            if "private" in msg.lower() or "exist" in msg.lower():
                raise ValueError(f"Playlist unavailable: {msg}")

    def _extract_playlist_title(self, data: dict[str, Any]) -> str:
        """Extract the playlist title from metadata renderer or fallback fields."""
        metadata = data.get("metadata", {}).get("playlistMetadataRenderer", {})
        title = metadata.get("title")
        if title:
            return str(title)
        header = data.get("header", {}).get("playlistHeaderRenderer", {})
        header_title = header.get("title", {})
        if "simpleText" in header_title:
            return str(header_title["simpleText"])
        runs = header_title.get("runs", [])
        if runs and "text" in runs[0]:
            return str(runs[0]["text"])
        return self._DEFAULT_TITLE

    def _extract_videos(self, data: dict[str, Any]) -> list[dict[str, Any]]:
        """Walk playlist structure to extract video items list."""
        contents = self._find_playlist_video_renderers(data)
        videos: list[dict[str, Any]] = []
        for idx, item in enumerate(contents, start=1):
            renderer = item.get(self._RENDERER_KEY)
            if not renderer:
                continue
            vid_id = renderer.get("videoId")
            if not vid_id:
                continue
            title = self._extract_video_item_title(renderer)
            videos.append({
                "video_id": vid_id,
                "title": title,
                "url": self._url_utils.build_video_url(vid_id),
                "index": idx,
            })
        return videos

    def _find_playlist_video_renderers(self, data: dict[str, Any]) -> list[dict[str, Any]]:
        """Traverse nested structure to locate playlist items container."""
        tabs = data.get("contents", {}).get("twoColumnBrowseResultsRenderer", {}).get("tabs", [])
        if not tabs:
            return []
        tab_content = tabs[0].get("tabRenderer", {}).get("content", {})
        section_list = tab_content.get("sectionListRenderer", {}).get("contents", [])
        if not section_list:
            return []
        item_section = section_list[0].get("itemSectionRenderer", {}).get("contents", [])
        if not item_section:
            return []
        video_list = item_section[0].get("playlistVideoListRenderer", {}).get("contents", [])
        return list(video_list)

    def _extract_video_item_title(self, renderer: dict[str, Any]) -> str:
        """Extract title string from playlist video renderer."""
        title_obj = renderer.get("title", {})
        if "simpleText" in title_obj:
            return str(title_obj["simpleText"])
        runs = title_obj.get("runs", [])
        if runs and "text" in runs[0]:
            return str(runs[0]["text"])
        return "Untitled Video"
