"""Health check endpoint handler for SynapseSync API."""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler
from typing import ClassVar


class Health(BaseHTTPRequestHandler):
    """HTTP request handler for API health checks."""

    _STATUS_OK: ClassVar[str] = "ok"
    _VERSION: ClassVar[str] = "1.0.0"
    _HEADER_CONTENT_TYPE: ClassVar[str] = "Content-Type"
    _MIME_JSON: ClassVar[str] = "application/json"
    _HTTP_STATUS_OK: ClassVar[int] = 200
    _ENCODING: ClassVar[str] = "utf-8"

    def do_GET(self) -> None:
        """Handle HTTP GET requests and respond with the health check payload."""
        payload_bytes = self.build_response_bytes()
        self.send_response(self._HTTP_STATUS_OK)
        self.send_header(self._HEADER_CONTENT_TYPE, self._MIME_JSON)
        self.end_headers()
        self.wfile.write(payload_bytes)

    def build_response_bytes(self) -> bytes:
        """Serialize the health status dictionary into UTF-8 encoded JSON bytes."""
        payload = {
            "status": self._STATUS_OK,
            "version": self._VERSION,
        }
        return json.dumps(payload).encode(self._ENCODING)


handler = Health
