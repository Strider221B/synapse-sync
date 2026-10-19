"""Pushes processed YouTube notebooks and notes to the Vercel API endpoint."""

from __future__ import annotations

import os
import time
from typing import Any, ClassVar

import requests


class ServerPusher:
    """Sends generated notes and notebook metadata to the backend API with retries."""

    _DEFAULT_SERVER_URL: ClassVar[str] = "http://localhost:3000"
    _ENDPOINT: ClassVar[str] = "/api/youtube-notes"
    _ENV_API_KEY: ClassVar[str] = "YOUTUBE_NOTES_API_KEY"
    _ENV_SERVER_URL: ClassVar[str] = "SYNAPSE_SERVER_URL"
    _HEADER_AUTH: ClassVar[str] = "Authorization"
    _HEADER_CONTENT_TYPE: ClassVar[str] = "Content-Type"
    _MIME_JSON: ClassVar[str] = "application/json"
    _BEARER_PREFIX: ClassVar[str] = "Bearer "
    _MAX_RETRIES: ClassVar[int] = 3
    _INITIAL_BACKOFF_SECONDS: ClassVar[float] = 1.0
    _BACKOFF_FACTOR: ClassVar[float] = 2.0
    _HTTP_UNAUTHORIZED: ClassVar[int] = 401
    _HTTP_BAD_REQUEST: ClassVar[int] = 400

    def __init__(
        self,
        server_url: str | None = None,
        api_key: str | None = None,
        session: requests.Session | None = None,
    ) -> None:
        """Initialize the ServerPusher with server URL, API key, and optional session."""
        env_url = os.getenv(self._ENV_SERVER_URL)
        self._server_url = server_url or env_url or self._DEFAULT_SERVER_URL
        self._api_key = api_key or os.getenv(self._ENV_API_KEY) or ""
        self._session = session if session is not None else requests.Session()

    def push(self, notebook: dict[str, Any], notes: list[dict[str, Any]]) -> dict[str, Any]:
        """Post notebook and notes payload to the serverless endpoint with retry handling."""
        if not notebook:
            raise ValueError("Notebook dictionary is required for push")
        if not notes:
            raise ValueError("Notes list cannot be empty for push")

        payload = {"notebook": notebook, "notes": notes}
        url = self._build_endpoint_url()
        headers = self._build_headers()
        return self._send_with_retry(url, payload, headers)

    def _build_endpoint_url(self) -> str:
        """Construct full target URL for the youtube-notes endpoint."""
        base = self._server_url.rstrip("/")
        return f"{base}{self._ENDPOINT}"

    def _build_headers(self) -> dict[str, str]:
        """Construct HTTP headers with Bearer token authentication."""
        headers = {
            self._HEADER_CONTENT_TYPE: self._MIME_JSON,
        }
        if self._api_key:
            headers[self._HEADER_AUTH] = f"{self._BEARER_PREFIX}{self._api_key}"
        return headers

    def _send_with_retry(
        self, url: str, payload: dict[str, Any], headers: dict[str, str]
    ) -> dict[str, Any]:
        """Execute HTTP POST with exponential backoff for transient issues."""
        backoff = self._INITIAL_BACKOFF_SECONDS
        last_error: Exception | None = None

        for attempt in range(self._MAX_RETRIES + 1):
            try:
                response = self._session.post(url, json=payload, headers=headers, timeout=30)
                return self._evaluate_response(response)
            except (requests.ConnectionError, requests.Timeout) as err:
                last_error = err
                if attempt >= self._MAX_RETRIES:
                    raise ConnectionError(f"Network error pushing notes to {url}: {err}") from err
                time.sleep(backoff)
                backoff *= self._BACKOFF_FACTOR

        raise RuntimeError(f"Server push failed: {last_error}")

    def _evaluate_response(self, response: requests.Response) -> dict[str, Any]:
        """Check response status code and return parsed JSON data."""
        if response.status_code == self._HTTP_UNAUTHORIZED:
            raise PermissionError("Authentication failed: Invalid or missing YOUTUBE_NOTES_API_KEY")
        if response.status_code == self._HTTP_BAD_REQUEST:
            raise ValueError(f"Server rejected payload (400): {response.text}")
        if response.status_code >= 500:
            raise RuntimeError(f"Server internal error ({response.status_code}): {response.text}")

        response.raise_for_status()
        result: dict[str, Any] = response.json()
        return result
