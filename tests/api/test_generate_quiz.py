"""Unit tests for the GenerateQuiz endpoint handler."""

from __future__ import annotations

import io
import json
from email.message import Message
from typing import Any, ClassVar
from unittest.mock import MagicMock, patch

from api.generate_quiz import GenerateQuiz


class TestGenerateQuiz:
    """Test suite validating input checking, Gemini invocation, and error handling."""

    _ENCODING: ClassVar[str] = "utf-8"
    _HTTP_OK: ClassVar[int] = 200
    _HTTP_BAD_REQUEST: ClassVar[int] = 400
    _HTTP_RATE_LIMITED: ClassVar[int] = 429
    _HTTP_INTERNAL_ERROR: ClassVar[int] = 500

    _SAMPLE_TEXT: ClassVar[str] = (
        "Machine learning is a subset of artificial intelligence that focuses on building "
        "systems that learn from data. Supervised learning uses labeled training examples "
        "to approximate an unknown target function."
    )

    _SAMPLE_QUIZ_PAYLOAD: ClassVar[dict[str, Any]] = {
        "mcqs": [
            {
                "question": "What is machine learning?",
                "options": ["A subset of AI", "A hardware component", "A compiler", "A database"],
                "correctIndex": 0,
                "explanation": "ML is a subset of AI.",
            }
        ],
        "flashcards": [
            {
                "front": "What does supervised learning require?",
                "back": "Labeled training data.",
            }
        ],
    }

    def _create_handler(self, body_data: dict[str, Any] | None = None) -> GenerateQuiz:
        """Construct mock GenerateQuiz instance with rfile, wfile, and headers."""
        instance = GenerateQuiz.__new__(GenerateQuiz)
        instance.wfile = io.BytesIO()

        body_bytes = json.dumps(body_data).encode(self._ENCODING) if body_data is not None else b""
        instance.rfile = io.BytesIO(body_bytes)

        headers = Message()
        headers["Content-Length"] = str(len(body_bytes))
        headers["Content-Type"] = "application/json"
        instance.headers = headers
        return instance

    def _get_response_json(self, handler: GenerateQuiz) -> dict[str, Any]:
        """Read and decode JSON response from handler wfile."""
        assert isinstance(handler.wfile, io.BytesIO)
        result: dict[str, Any] = json.loads(handler.wfile.getvalue().decode(self._ENCODING))
        return result

    def test_do_post_successful_generates_quiz(self) -> None:
        """Verify do_POST delegates to generate_quiz and returns 200 with result."""
        handler = self._create_handler({
            "text": self._SAMPLE_TEXT,
            "difficulty": "hard",
            "mcqCount": 3,
            "flashcardCount": 3,
        })
        mock_result = {
            "mcqs": self._SAMPLE_QUIZ_PAYLOAD["mcqs"],
            "flashcards": self._SAMPLE_QUIZ_PAYLOAD["flashcards"],
            "metadata": {"model": "gemini-2.0-flash", "inputTokens": 100, "outputTokens": 80},
        }

        with (
            patch.object(handler, "generate_quiz", return_value=mock_result),
            patch.object(handler, "send_response") as mock_resp,
            patch.object(handler, "send_header"),
            patch.object(handler, "end_headers"),
        ):
            handler.do_POST()
            mock_resp.assert_called_once_with(self._HTTP_OK)

        resp_data = self._get_response_json(handler)
        assert len(resp_data["mcqs"]) == 1
        assert resp_data["metadata"]["model"] == "gemini-2.0-flash"

    def test_do_post_returns_400_on_missing_body(self) -> None:
        """Verify do_POST responds with 400 when body is empty."""
        handler = self._create_handler(None)

        with (
            patch.object(handler, "send_response") as mock_resp,
            patch.object(handler, "send_header"),
            patch.object(handler, "end_headers"),
        ):
            handler.do_POST()
            mock_resp.assert_called_once_with(self._HTTP_BAD_REQUEST)

        resp_data = self._get_response_json(handler)
        assert resp_data["error"]["code"] == "BAD_REQUEST"

    def test_do_post_returns_400_on_short_text(self) -> None:
        """Verify do_POST responds with 400 when text length is under 50 characters."""
        handler = self._create_handler({"text": "Short note"})

        with (
            patch.object(handler, "send_response") as mock_resp,
            patch.object(handler, "send_header"),
            patch.object(handler, "end_headers"),
        ):
            handler.do_POST()
            mock_resp.assert_called_once_with(self._HTTP_BAD_REQUEST)

        resp_data = self._get_response_json(handler)
        assert resp_data["error"]["code"] == "TEXT_TOO_SHORT"

    def test_do_post_returns_429_on_rate_limit(self) -> None:
        """Verify do_POST responds with 429 when Gemini rate limits."""
        handler = self._create_handler({"text": self._SAMPLE_TEXT})
        err = Exception("429 ResourceExhausted: rate limit exceeded")

        with (
            patch.object(handler, "generate_quiz", side_effect=err),
            patch.object(handler, "send_response") as mock_resp,
            patch.object(handler, "send_header"),
            patch.object(handler, "end_headers"),
        ):
            handler.do_POST()
            mock_resp.assert_called_once_with(self._HTTP_RATE_LIMITED)

        resp_data = self._get_response_json(handler)
        assert resp_data["error"]["code"] == "RATE_LIMITED"

    def test_do_post_returns_500_on_generation_failure(self) -> None:
        """Verify do_POST responds with 500 when generation fails unexpectedly."""
        handler = self._create_handler({"text": self._SAMPLE_TEXT})
        err = RuntimeError("Unexpected AI model timeout")

        with (
            patch.object(handler, "generate_quiz", side_effect=err),
            patch.object(handler, "send_response") as mock_resp,
            patch.object(handler, "send_header"),
            patch.object(handler, "end_headers"),
        ):
            handler.do_POST()
            mock_resp.assert_called_once_with(self._HTTP_INTERNAL_ERROR)

        resp_data = self._get_response_json(handler)
        assert resp_data["error"]["code"] == "GENERATION_FAILED"

    def test_generate_quiz_invokes_gemini_service(self) -> None:
        """Verify generate_quiz delegates to GeminiService and formats tokens."""
        handler = self._create_handler()
        mock_service = MagicMock()
        mock_response = MagicMock()
        mock_response.text = json.dumps(self._SAMPLE_QUIZ_PAYLOAD)
        mock_response.usage_metadata = MagicMock(prompt_token_count=120, candidates_token_count=95)
        mock_service.call_with_retry.return_value = mock_response

        result = handler.generate_quiz(
            text=self._SAMPLE_TEXT,
            difficulty="medium",
            mcq_count=5,
            flashcard_count=5,
            service=mock_service,
        )

        assert len(result["mcqs"]) == 1
        assert len(result["flashcards"]) == 1
        assert result["metadata"]["inputTokens"] == 120
        assert result["metadata"]["outputTokens"] == 95
        mock_service.call_with_retry.assert_called_once()

    def test_text_truncation_limits_to_8000_words(self) -> None:
        """Verify input texts exceeding 8000 words are truncated properly."""
        handler = self._create_handler()
        long_text = "word " * 9000
        truncated = handler._truncate_text(long_text)
        assert len(truncated.split()) == 8000

    def test_sanitize_difficulty_fallback(self) -> None:
        """Verify invalid difficulty inputs fall back to default medium."""
        handler = self._create_handler()
        assert handler._sanitize_difficulty("extreme") == "medium"
        assert handler._sanitize_difficulty("EASY") == "easy"
        assert handler._sanitize_difficulty(None) == "medium"

    def test_clamp_count_boundaries(self) -> None:
        """Verify question count clamping between 1 and 10."""
        handler = self._create_handler()
        assert handler._clamp_count(-5) == 1
        assert handler._clamp_count(0) == 1
        assert handler._clamp_count(15) == 10
        assert handler._clamp_count("invalid") == 5
        assert handler._clamp_count(7) == 7

    def test_do_post_returns_400_on_malformed_json(self) -> None:
        """Verify do_POST responds with 400 when body bytes are not valid JSON."""
        instance = GenerateQuiz.__new__(GenerateQuiz)
        instance.wfile = io.BytesIO()
        instance.rfile = io.BytesIO(b"invalid-not-json")
        headers = Message()
        headers["Content-Length"] = "16"
        instance.headers = headers

        with (
            patch.object(instance, "send_response") as mock_resp,
            patch.object(instance, "send_header"),
            patch.object(instance, "end_headers"),
        ):
            instance.do_POST()
            mock_resp.assert_called_once_with(self._HTTP_BAD_REQUEST)

