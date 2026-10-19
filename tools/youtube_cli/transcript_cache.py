"""File-based local caching layer for fetched YouTube transcripts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, ClassVar


class TranscriptCache:
    """Manages filesystem caching of raw YouTube video transcripts to prevent re-fetching."""

    _DEFAULT_DIR: ClassVar[str] = "~/.synapse-sync/transcript_cache"
    _FILE_SUFFIX: ClassVar[str] = ".json"
    _ENCODING: ClassVar[str] = "utf-8"
    _KEY_TRANSCRIPT: ClassVar[str] = "transcript"
    _KEY_METADATA: ClassVar[str] = "metadata"
    _KEY_CACHED_AT: ClassVar[str] = "cachedAt"

    def __init__(self, cache_dir: str | None = None) -> None:
        """Initialize the TranscriptCache with the specified or default storage directory."""
        dir_path = cache_dir if cache_dir is not None else self._DEFAULT_DIR
        self._cache_dir = Path(dir_path).expanduser().resolve()
        self._ensure_cache_directory()

    def has(self, video_id: str) -> bool:
        """Check whether a cached transcript file exists for the given video ID."""
        if not video_id:
            return False
        cache_file = self._resolve_cache_file(video_id)
        return cache_file.is_file()

    def get(self, video_id: str) -> dict[str, Any] | None:
        """Retrieve and parse a cached transcript by video ID if available."""
        if not self.has(video_id):
            return None
        cache_file = self._resolve_cache_file(video_id)
        try:
            content = cache_file.read_text(encoding=self._ENCODING)
            data: dict[str, Any] = json.loads(content)
            return data
        except (OSError, json.JSONDecodeError):
            return None

    def put(self, video_id: str, transcript: str, metadata: dict[str, Any] | None = None) -> None:
        """Store transcript text and associated metadata into the local cache."""
        if not video_id:
            raise ValueError("video_id cannot be empty")
        self._ensure_cache_directory()
        cache_file = self._resolve_cache_file(video_id)
        payload = {
            self._KEY_TRANSCRIPT: transcript,
            self._KEY_METADATA: metadata or {},
        }
        json_bytes = json.dumps(payload, indent=2, ensure_ascii=False)
        cache_file.write_text(json_bytes, encoding=self._ENCODING)

    def _resolve_cache_file(self, video_id: str) -> Path:
        """Compute the absolute Path corresponding to the given video ID."""
        clean_id = video_id.strip()
        filename = f"{clean_id}{self._FILE_SUFFIX}"
        return self._cache_dir / filename

    def _ensure_cache_directory(self) -> None:
        """Create cache directory on disk if it does not already exist."""
        self._cache_dir.mkdir(parents=True, exist_ok=True)
