"""Unit tests for the Health check endpoint handler."""

from __future__ import annotations

import io
import json
from typing import Any, ClassVar
from unittest.mock import patch

from api.health import Health


class TestHealth:
    """Test suite verifying behavior of the Health API handler."""

    _EXPECTED_STATUS: ClassVar[str] = "ok"
    _EXPECTED_VERSION: ClassVar[str] = "1.0.0"
    _EXPECTED_STATUS_KEY: ClassVar[str] = "status"
    _EXPECTED_VERSION_KEY: ClassVar[str] = "version"
    _EXPECTED_HTTP_OK: ClassVar[int] = 200
    _EXPECTED_CONTENT_TYPE: ClassVar[str] = "Content-Type"
    _EXPECTED_MIME_JSON: ClassVar[str] = "application/json"
    _ENCODING: ClassVar[str] = "utf-8"

    def test_build_response_bytes_returns_valid_json(self) -> None:
        """Verify that build_response_bytes returns correct status and version JSON."""
        instance = self._create_uninitialized_handler()
        raw_bytes = instance.build_response_bytes()
        parsed: dict[str, Any] = json.loads(raw_bytes.decode(self._ENCODING))

        assert parsed[self._EXPECTED_STATUS_KEY] == self._EXPECTED_STATUS
        assert parsed[self._EXPECTED_VERSION_KEY] == self._EXPECTED_VERSION

    def test_do_get_sends_http_ok_and_headers(self) -> None:
        """Verify that do_GET sends a 200 response code and JSON content-type header."""
        instance = self._create_uninitialized_handler()
        buffer = io.BytesIO()
        instance.wfile = buffer

        with (
            patch.object(instance, "send_response") as mock_send_resp,
            patch.object(instance, "send_header") as mock_send_header,
            patch.object(instance, "end_headers") as mock_end_headers,
        ):
            instance.do_GET()

            mock_send_resp.assert_called_once_with(self._EXPECTED_HTTP_OK)
            mock_send_header.assert_called_once_with(
                self._EXPECTED_CONTENT_TYPE,
                self._EXPECTED_MIME_JSON,
            )
            mock_end_headers.assert_called_once()
        assert len(buffer.getvalue()) > 0

    def _create_uninitialized_handler(self) -> Health:
        """Create a mock-friendly Health handler instance without invoking base socket init."""
        return Health.__new__(Health)
