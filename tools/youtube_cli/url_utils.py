"""YouTube URL parsing and validation utilities for the local CLI tool."""

from __future__ import annotations

import re
from typing import ClassVar


class UrlUtils:
    """Helper class for parsing and validating YouTube video and playlist URLs."""

    _VIDEO_ID_PATTERN: ClassVar[re.Pattern[str]] = re.compile(
        r"(?:v=|\/embed\/|\/watch\?v=|\/v\/|youtu\.be\/|\/shorts\/|^)([a-zA-Z0-9_-]{11})(?:[?&/]|$)"
    )
    _PLAYLIST_ID_PATTERN: ClassVar[re.Pattern[str]] = re.compile(
        r"[?&]list=([a-zA-Z0-9_-]+)"
    )
    _BARE_VIDEO_ID_PATTERN: ClassVar[re.Pattern[str]] = re.compile(r"^[a-zA-Z0-9_-]{11}$")
    _CANONICAL_WATCH_URL: ClassVar[str] = "https://www.youtube.com/watch?v="

    def is_video_url(self, url: str) -> bool:
        """Return True if the provided URL or ID corresponds to a single YouTube video."""
        if not url or not isinstance(url, str):
            return False
        clean_url = url.strip()
        if self.is_playlist_url(clean_url) and "v=" not in clean_url:
            return False
        return self.extract_video_id(clean_url) is not None

    def is_playlist_url(self, url: str) -> bool:
        """Return True if the provided URL contains a playlist identifier."""
        if not url or not isinstance(url, str):
            return False
        return self.extract_playlist_id(url.strip()) is not None

    def extract_video_id(self, url: str) -> str | None:
        """Extract the 11-character YouTube video ID from a URL or raw identifier."""
        if not url or not isinstance(url, str):
            return None
        stripped = url.strip()
        if self._BARE_VIDEO_ID_PATTERN.match(stripped):
            return stripped
        match = self._VIDEO_ID_PATTERN.search(stripped)
        return match.group(1) if match else None

    def extract_playlist_id(self, url: str) -> str | None:
        """Extract the YouTube playlist ID from the provided URL query string."""
        if not url or not isinstance(url, str):
            return None
        stripped = url.strip()
        match = self._PLAYLIST_ID_PATTERN.search(stripped)
        return match.group(1) if match else None

    def build_video_url(self, video_id: str) -> str:
        """Construct a canonical YouTube watch URL from an 11-character video ID."""
        cleaned_id = video_id.strip() if video_id else ""
        if not self._BARE_VIDEO_ID_PATTERN.match(cleaned_id):
            raise ValueError(f"Invalid YouTube video ID format: {video_id}")
        return f"{self._CANONICAL_WATCH_URL}{cleaned_id}"
