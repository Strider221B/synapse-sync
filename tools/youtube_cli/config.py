"""Configuration settings and environment loaders for the YouTube CLI tool."""

from __future__ import annotations

import os
from typing import ClassVar


class Config:
    """Manages CLI runtime parameters, system defaults, and environment credentials."""

    _DEFAULT_MODEL_NAME: ClassVar[str] = "gemini-2.0-flash"
    _DEFAULT_DELAY_SECONDS: ClassVar[float] = 4.0
    _DEFAULT_MAX_RETRIES: ClassVar[int] = 3
    _DEFAULT_CACHE_DIR: ClassVar[str] = "~/.synapse-sync/transcript_cache"
    _DEFAULT_NOTES_DIR: ClassVar[str] = "~/.synapse-sync/processed_notes"
    _DEFAULT_LANGUAGE: ClassVar[str] = "en"
    _DEFAULT_SERVER_URL: ClassVar[str] = "http://localhost:3000"

    _ENV_GEMINI_KEY: ClassVar[str] = "GEMINI_API_KEY"
    _ENV_API_KEY: ClassVar[str] = "YOUTUBE_NOTES_API_KEY"
    _ENV_SERVER_URL: ClassVar[str] = "SYNAPSE_SERVER_URL"

    def __init__(self) -> None:
        """Initialize configuration properties from environment variables with fallbacks."""
        self._gemini_model = self._DEFAULT_MODEL_NAME
        self._delay_seconds = self._DEFAULT_DELAY_SECONDS
        self._max_retries = self._DEFAULT_MAX_RETRIES
        self._cache_dir = self._DEFAULT_CACHE_DIR
        self._notes_dir = self._DEFAULT_NOTES_DIR
        self._language = self._DEFAULT_LANGUAGE

    def get_gemini_api_key(self) -> str | None:
        """Return the configured Gemini API key from environment."""
        return os.getenv(self._ENV_GEMINI_KEY)

    def get_youtube_notes_api_key(self) -> str | None:
        """Return the shared secret for pushing notes to Vercel."""
        return os.getenv(self._ENV_API_KEY)

    def get_server_url(self) -> str:
        """Return target server URL with fallback to local development origin."""
        return os.getenv(self._ENV_SERVER_URL) or self._DEFAULT_SERVER_URL

    def get_model_name(self) -> str:
        """Return active Gemini model name for note generation."""
        return self._gemini_model

    def get_delay_seconds(self) -> float:
        """Return configured delay interval in seconds between requests."""
        return self._delay_seconds

    def get_max_retries(self) -> int:
        """Return maximum retry attempts allowed for API calls."""
        return self._max_retries

    def get_cache_dir(self) -> str:
        """Return directory path for caching raw transcripts."""
        return self._cache_dir

    def get_notes_dir(self) -> str:
        """Return directory path for storing processed markdown notes locally."""
        return self._notes_dir

    def get_language(self) -> str:
        """Return preferred transcript language code."""
        return self._language
