"""Serverless HTTP endpoint handler for generating comprehensive notes from text via Gemini."""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler
from typing import Any, ClassVar

import google.generativeai as genai

from tools.youtube_cli.config import Config


class Summarize(BaseHTTPRequestHandler):
    """HTTP request handler generating exhaustively detailed study notes using Google Gemini."""

    _HEADER_CONTENT_TYPE: ClassVar[str] = "Content-Type"
    _HEADER_CONTENT_LENGTH: ClassVar[str] = "Content-Length"
    _MIME_JSON: ClassVar[str] = "application/json"
    _ENCODING: ClassVar[str] = "utf-8"
    _ENV_GEMINI_KEY: ClassVar[str] = "GEMINI_API_KEY"

    _HTTP_OK: ClassVar[int] = 200
    _HTTP_BAD_REQUEST: ClassVar[int] = 400
    _HTTP_RATE_LIMITED: ClassVar[int] = 429
    _HTTP_INTERNAL_ERROR: ClassVar[int] = 500

    _ERR_MISSING_TEXT: ClassVar[str] = "MISSING_TEXT"
    _ERR_RATE_LIMITED: ClassVar[str] = "RATE_LIMITED"
    _ERR_AI_ERROR: ClassVar[str] = "AI_SERVICE_ERROR"

    _SYSTEM_PROMPT: ClassVar[str] = (
        "You are a meticulous note-taker, not a summarizer. "
        "Capture EVERY concept, definition, example, analogy, formula, and explanation. "
        "The notes must be detailed enough that someone reading only these notes has a thorough "
        "understanding of the topic without needing to read the original text. "
        "Use headings, subheadings, bullet points, numbered lists, bold/italic, and code blocks. "
        "Output MUST adhere strictly to JSON schema: title, summary, keyPoints, markdownNotes."
    )

    def do_POST(self) -> None:
        """Handle POST requests to generate comprehensive notes from supplied text."""
        body_dict = self._read_json_body()
        if not body_dict or not body_dict.get("text"):
            self._send_error(
                self._HTTP_BAD_REQUEST,
                self._ERR_MISSING_TEXT,
                "Field 'text' is required and cannot be empty",
            )
            return

        text = str(body_dict.get("text", "")).strip()
        title = body_dict.get("title") or "Study Notes"

        try:
            result = self.generate_detailed_notes(text, title)
            self._send_json(self._HTTP_OK, result)
        except Exception as err:
            self._handle_generation_error(err)

    def generate_detailed_notes(
        self, text: str, title: str, model_name: str | None = None
    ) -> dict[str, Any]:
        """Configure Gemini and invoke structured content generation for detailed notes."""
        api_key = os.getenv(self._ENV_GEMINI_KEY)
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable is not configured.")

        active_model = model_name or Config.get_default_model()
        genai_client: Any = genai
        genai_client.configure(api_key=api_key)
        model: Any = genai_client.GenerativeModel(model_name=active_model)
        prompt = f"{self._SYSTEM_PROMPT}\n\nTitle: {title}\n\nSource Content:\n{text}"
        config: Any = self._build_generation_config()

        response: Any = model.generate_content(prompt, generation_config=config)
        return self._format_ai_response(response, title, active_model)

    def _build_generation_config(self) -> dict[str, Any]:
        """Construct generation configuration enforcing JSON schema output."""
        return {
            "response_mime_type": self._MIME_JSON,
            "response_schema": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "summary": {"type": "string"},
                    "keyPoints": {"type": "array", "items": {"type": "string"}},
                    "markdownNotes": {"type": "string"},
                },
                "required": ["title", "summary", "keyPoints", "markdownNotes"],
            },
        }

    def _format_ai_response(
        self, response: Any, default_title: str, model_name: str
    ) -> dict[str, Any]:
        """Parse response text and build standardized output dictionary."""
        response_text = response.text if hasattr(response, "text") else str(response)
        parsed: dict[str, Any] = json.loads(response_text)
        usage = getattr(response, "usage_metadata", None)
        in_tokens = getattr(usage, "prompt_token_count", 0) if usage else 0
        out_tokens = getattr(usage, "candidates_token_count", 0) if usage else 0

        return {
            "title": parsed.get("title") or default_title,
            "summary": parsed.get("summary") or "",
            "keyPoints": parsed.get("keyPoints") or [],
            "markdownNotes": parsed.get("markdownNotes") or "",
            "metadata": {
                "model": model_name,
                "inputTokens": in_tokens,
                "outputTokens": out_tokens,
            },
        }

    def _handle_generation_error(self, err: Exception) -> None:
        """Route exception to 429 rate limit or 500 AI service failure response."""
        err_str = str(err).lower()
        if "429" in err_str or "quota" in err_str or "resourceexhausted" in err_str:
            self._send_error(
                self._HTTP_RATE_LIMITED, self._ERR_RATE_LIMITED, f"AI quota exceeded: {err}"
            )
            return
        self._send_error(
            self._HTTP_INTERNAL_ERROR, self._ERR_AI_ERROR, f"AI generation failed: {err}"
        )

    def _read_json_body(self) -> dict[str, Any] | None:
        """Read and decode request body bytes as JSON dictionary."""
        length_str = self.headers.get(self._HEADER_CONTENT_LENGTH, "0")
        try:
            length = int(length_str)
            if length <= 0:
                return None
            body_bytes = self.rfile.read(length)
            parsed: dict[str, Any] = json.loads(body_bytes.decode(self._ENCODING))
            return parsed
        except (ValueError, json.JSONDecodeError):
            return None

    def _send_json(self, status: int, data: dict[str, Any]) -> None:
        """Serialize payload to JSON and emit HTTP response headers and body."""
        body = json.dumps(data).encode(self._ENCODING)
        self.send_response(status)
        self.send_header(self._HEADER_CONTENT_TYPE, self._MIME_JSON)
        self.send_header(self._HEADER_CONTENT_LENGTH, str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_error(self, status: int, code: str, message: str) -> None:
        """Emit structured JSON error response conforming to API standards."""
        self._send_json(status, {"error": {"code": code, "message": message}})


handler = Summarize
