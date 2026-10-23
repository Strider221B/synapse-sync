"""Unit tests for the Summarize endpoint handler."""

from __future__ import annotations

import io
import json
from email.message import Message
from typing import Any, ClassVar
from unittest.mock import MagicMock, patch

from api.summarize import Summarize
from tools.youtube_cli.config import Config


class TestSummarize:
    """Test suite validating input checking, AI delegation, and error mapping in Summarize."""

    _ENCODING: ClassVar[str] = "utf-8"
    _HTTP_OK: ClassVar[int] = 200
    _HTTP_BAD_REQUEST: ClassVar[int] = 400
    _HTTP_RATE_LIMITED: ClassVar[int] = 429
    _HTTP_INTERNAL_ERROR: ClassVar[int] = 500

    _AI_OUTPUT: ClassVar[dict[str, Any]] = {
        "title": "Machine Learning Overview",
        "summary": "High-level summary of ML fundamentals.",
        "keyPoints": ["Supervised learning", "Unsupervised learning"],
        "markdownNotes": "# Notes\nDetailed notes content.",
    }

    def _create_handler(self, body_data: dict[str, Any] | None = None) -> Summarize:
        """Construct mock Summarize instance with rfile, wfile, and headers."""
        instance = Summarize.__new__(Summarize)
        instance.wfile = io.BytesIO()

        body_bytes = json.dumps(body_data).encode(self._ENCODING) if body_data is not None else b""
        instance.rfile = io.BytesIO(body_bytes)

        headers = Message()
        headers["Content-Length"] = str(len(body_bytes))
        headers["Content-Type"] = "application/json"
        instance.headers = headers
        return instance

    def _get_response_json(self, handler: Summarize) -> dict[str, Any]:
        """Read and decode JSON response from handler wfile."""
        assert isinstance(handler.wfile, io.BytesIO)
        result: dict[str, Any] = json.loads(handler.wfile.getvalue().decode(self._ENCODING))
        return result

    def test_do_post_successful_generates_detailed_notes(self) -> None:
        """Verify do_POST delegates to generate_detailed_notes and writes 200 response."""
        handler = self._create_handler({"text": "Lecture text about AI.", "title": "AI Lecture"})
        expected_result = {
            "title": "Machine Learning Overview",
            "summary": "Summary",
            "keyPoints": ["Point 1"],
            "markdownNotes": "# Notes",
            "metadata": {
                "model": Config.get_default_model(),
                "inputTokens": 10,
                "outputTokens": 20,
            },
        }

        with (
            patch.object(handler, "generate_detailed_notes", return_value=expected_result),
            patch.object(handler, "send_response") as mock_resp,
            patch.object(handler, "send_header"),
            patch.object(handler, "end_headers"),
        ):
            handler.do_POST()
            mock_resp.assert_called_once_with(self._HTTP_OK)

        resp_data = self._get_response_json(handler)
        assert resp_data["title"] == "Machine Learning Overview"
        assert resp_data["markdownNotes"] == "# Notes"

    def test_do_post_returns_400_on_missing_text(self) -> None:
        """Verify do_POST responds with 400 Bad Request when text field is absent or empty."""
        handler = self._create_handler({"title": "No text provided"})

        with (
            patch.object(handler, "send_response") as mock_resp,
            patch.object(handler, "send_header"),
            patch.object(handler, "end_headers"),
        ):
            handler.do_POST()
            mock_resp.assert_called_once_with(self._HTTP_BAD_REQUEST)

        resp_data = self._get_response_json(handler)
        assert resp_data["error"]["code"] == "MISSING_TEXT"

    def test_do_post_returns_429_on_rate_limit(self) -> None:
        """Verify do_POST converts 429 / quota error to HTTP 429 response."""
        handler = self._create_handler({"text": "Valid text content"})
        error_side_effect = Exception("429 ResourceExhausted: Quota limit reached")

        with (
            patch.object(handler, "generate_detailed_notes", side_effect=error_side_effect),
            patch.object(handler, "send_response") as mock_resp,
            patch.object(handler, "send_header"),
            patch.object(handler, "end_headers"),
        ):
            handler.do_POST()
            mock_resp.assert_called_once_with(self._HTTP_RATE_LIMITED)

        resp_data = self._get_response_json(handler)
        assert resp_data["error"]["code"] == "RATE_LIMITED"

    def test_do_post_returns_500_on_ai_internal_error(self) -> None:
        """Verify do_POST returns 500 when AI generation encounters unexpected failure."""
        handler = self._create_handler({"text": "Valid text content"})
        error_side_effect = RuntimeError("Unknown model connection failure")

        with (
            patch.object(handler, "generate_detailed_notes", side_effect=error_side_effect),
            patch.object(handler, "send_response") as mock_resp,
            patch.object(handler, "send_header"),
            patch.object(handler, "end_headers"),
        ):
            handler.do_POST()
            mock_resp.assert_called_once_with(self._HTTP_INTERNAL_ERROR)

        resp_data = self._get_response_json(handler)
        assert resp_data["error"]["code"] == "AI_SERVICE_ERROR"

    def test_generate_detailed_notes_invokes_gemini_api(self) -> None:
        """Verify generate_detailed_notes calls Gemini model and formats structured output."""
        handler = self._create_handler()
        mock_response = MagicMock()
        mock_response.text = json.dumps(self._AI_OUTPUT)
        mock_response.usage_metadata = MagicMock(prompt_token_count=100, candidates_token_count=150)

        with (
            patch.dict("os.environ", {"GEMINI_API_KEY": "test-key"}),
            patch("google.generativeai.configure") as mock_config,
            patch("google.generativeai.GenerativeModel") as mock_model_cls,
        ):
            mock_model = MagicMock()
            mock_model.generate_content.return_value = mock_response
            mock_model_cls.return_value = mock_model

            result = handler.generate_detailed_notes("Sample text", "Title")
            mock_config.assert_called_once_with(api_key="test-key")
            mock_model_cls.assert_called_once_with(model_name=Config.get_default_model())
            assert result["title"] == "Machine Learning Overview"
            assert result["metadata"]["inputTokens"] == 100
            assert result["metadata"]["model"] == Config.get_default_model()
