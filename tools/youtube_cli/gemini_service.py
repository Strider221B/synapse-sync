"""Service wrapper for interacting with Google Gemini API with rate limiting and retry."""

from __future__ import annotations

import os
import time
from typing import Any, ClassVar

import google.generativeai as genai


class GeminiService:
    """Provides resilient Gemini model invocation with exponential backoff on rate limits."""

    _ENV_API_KEY: ClassVar[str] = "GEMINI_API_KEY"
    _DEFAULT_DELAY_SECONDS: ClassVar[float] = 4.0
    _INITIAL_BACKOFF_SECONDS: ClassVar[float] = 2.0
    _BACKOFF_FACTOR: ClassVar[float] = 2.0
    _RATE_LIMIT_MARKER_429: ClassVar[str] = "429"
    _RATE_LIMIT_MARKER_RESOURCE: ClassVar[str] = "ResourceExhausted"
    _ERR_MISSING_API_KEY: ClassVar[str] = "GEMINI_API_KEY environment variable is not set."

    def __init__(
        self,
        api_key: str | None = None,
        delay_seconds: float = _DEFAULT_DELAY_SECONDS,
        genai_module: Any = None,
    ) -> None:
        """Initialize the GeminiService with optional API key, delay, and API client."""
        self._api_key = api_key or os.getenv(self._ENV_API_KEY)
        self._delay_seconds = delay_seconds
        self._genai = genai_module if genai_module is not None else genai
        self._last_call_timestamp: float = 0.0

    def configure(self) -> None:
        """Configure the underlying GenerativeAI library with the active API key."""
        if not self._api_key:
            self._api_key = os.getenv(self._ENV_API_KEY)
        if not self._api_key:
            raise ValueError(self._ERR_MISSING_API_KEY)
        self._genai.configure(api_key=self._api_key)

    def call_with_retry(
        self,
        model_name: str,
        prompt: str | list[Any],
        config: Any = None,
        max_retries: int = 3,
    ) -> Any:
        """Call Gemini model with rate-limit delay and exponential backoff retry."""
        self.configure()
        self._throttle_requests()
        backoff = self._INITIAL_BACKOFF_SECONDS

        for attempt in range(max_retries + 1):
            try:
                model = self._genai.GenerativeModel(model_name=model_name)
                response = model.generate_content(prompt, generation_config=config)
                self._last_call_timestamp = time.time()
                return response
            except Exception as err:
                if attempt >= max_retries or not self._is_rate_limit_error(err):
                    raise
                time.sleep(backoff)
                backoff *= self._BACKOFF_FACTOR

        raise RuntimeError("Maximum retry attempts exceeded for Gemini API call.")

    def _throttle_requests(self) -> None:
        """Sleep if required to preserve configured inter-request delay interval."""
        if self._last_call_timestamp > 0 and self._delay_seconds > 0:
            elapsed = time.time() - self._last_call_timestamp
            if elapsed < self._delay_seconds:
                time.sleep(self._delay_seconds - elapsed)

    def _is_rate_limit_error(self, err: Exception) -> bool:
        """Determine if an exception represents a 429 or quota exhaustion error."""
        error_msg = str(err)
        return (
            self._RATE_LIMIT_MARKER_429 in error_msg
            or self._RATE_LIMIT_MARKER_RESOURCE in error_msg
            or "quota" in error_msg.lower()
        )
