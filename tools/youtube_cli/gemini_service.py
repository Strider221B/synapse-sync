"""Service wrapper for interacting with Google Gemini API with rate limiting and retry."""

from __future__ import annotations

import os
import time
from typing import Any, ClassVar

from google import genai
from google.genai import types


class GeminiService:
    """Provides resilient Gemini model invocation with exponential backoff on rate limits."""

    _ENV_API_KEY: ClassVar[str] = "GEMINI_API_KEY"
    _DEFAULT_DELAY_SECONDS: ClassVar[float] = 4.0
    _INITIAL_BACKOFF_SECONDS: ClassVar[float] = 2.0
    _BACKOFF_FACTOR: ClassVar[float] = 2.0
    _RATE_LIMIT_MARKER_429: ClassVar[str] = "429"
    _RATE_LIMIT_MARKER_RESOURCE: ClassVar[str] = "ResourceExhausted"
    _RATE_LIMIT_MARKER_QUOTA: ClassVar[str] = "quota"
    _ERR_MISSING_API_KEY: ClassVar[str] = "GEMINI_API_KEY environment variable is not set."
    _ERR_MAX_RETRIES: ClassVar[str] = "Maximum retry attempts exceeded for Gemini API call."
    _ERR_UNSUPPORTED_CLIENT: ClassVar[str] = (
        "Provided client does not support generate_content."
    )

    def __init__(
        self,
        api_key: str | None = None,
        delay_seconds: float = _DEFAULT_DELAY_SECONDS,
        client: Any = None,
        genai_module: Any = None,
    ) -> None:
        """Initialize the GeminiService with optional API key, delay, and API client."""
        self._api_key = api_key or os.getenv(self._ENV_API_KEY)
        self._delay_seconds = delay_seconds
        self._client = client if client is not None else genai_module
        self._last_call_timestamp: float = 0.0

    def configure(self) -> Any:
        """Configure the underlying Gemini client with the active API key."""
        if not self._api_key:
            self._api_key = os.getenv(self._ENV_API_KEY)
        if not self._api_key:
            raise ValueError(self._ERR_MISSING_API_KEY)
        if self._client is None:
            self._client = genai.Client(api_key=self._api_key)
        elif hasattr(self._client, "configure"):
            self._client.configure(api_key=self._api_key)
        return self._client

    def call_with_retry(
        self,
        model_name: str,
        prompt: str | list[Any],
        config: Any = None,
        max_retries: int = 3,
    ) -> Any:
        """Call Gemini model with rate-limit delay and exponential backoff retry."""
        client = self.configure()
        self._throttle_requests()
        backoff = self._INITIAL_BACKOFF_SECONDS

        for attempt in range(max_retries + 1):
            try:
                response = self._generate_content(client, model_name, prompt, config)
                self._last_call_timestamp = time.time()
                return response
            except Exception as err:
                if attempt >= max_retries or not self._is_rate_limit_error(err):
                    raise
                time.sleep(backoff)
                backoff *= self._BACKOFF_FACTOR

        raise RuntimeError(self._ERR_MAX_RETRIES)

    def _generate_content(
        self, client: Any, model_name: str, prompt: str | list[Any], config: Any
    ) -> Any:
        """Execute content generation via modern genai Client or legacy GenerativeModel."""
        if hasattr(client, "models") and hasattr(client.models, "generate_content"):
            gen_config = self._build_generate_content_config(config)
            return client.models.generate_content(
                model=model_name, contents=prompt, config=gen_config
            )
        if hasattr(client, "GenerativeModel"):
            model = client.GenerativeModel(model_name=model_name)
            return model.generate_content(prompt, generation_config=config)
        raise AttributeError(self._ERR_UNSUPPORTED_CLIENT)

    def _build_generate_content_config(self, config: Any) -> types.GenerateContentConfig:
        """Construct GenerateContentConfig with AFC disabled by default to suppress warnings."""
        if config is None:
            return types.GenerateContentConfig(
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True)
            )
        gen_config = (
            types.GenerateContentConfig(**config) if isinstance(config, dict) else config
        )
        if getattr(gen_config, "automatic_function_calling", None) is None:
            gen_config.automatic_function_calling = types.AutomaticFunctionCallingConfig(
                disable=True
            )
        return gen_config

    def _throttle_requests(self) -> None:
        """Sleep if required to preserve configured inter-request delay interval."""
        if self._last_call_timestamp > 0 and self._delay_seconds > 0:
            elapsed = time.time() - self._last_call_timestamp
            if elapsed < self._delay_seconds:
                time.sleep(self._delay_seconds - elapsed)

    def _is_rate_limit_error(self, err: Exception) -> bool:
        """Determine if an exception represents a 429 or quota exhaustion error."""
        error_msg = str(err).lower()
        return (
            self._RATE_LIMIT_MARKER_429 in error_msg
            or self._RATE_LIMIT_MARKER_RESOURCE.lower() in error_msg
            or self._RATE_LIMIT_MARKER_QUOTA in error_msg
        )
