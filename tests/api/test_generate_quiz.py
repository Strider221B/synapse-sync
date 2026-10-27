"""Unit tests for the GenerateQuiz endpoint handler."""

from __future__ import annotations

import io
import json
from email.message import Message
from typing import Any, ClassVar
from unittest.mock import MagicMock, patch

from api.generate_quiz import GenerateQuiz
from tools.youtube_cli.config import Config
from tools.youtube_cli.gemini_service import GeminiService


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
            "metadata": {
                "model": Config.get_default_model(),
                "inputTokens": 100,
                "outputTokens": 80,
            },
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
        assert resp_data["metadata"]["model"] == Config.get_default_model()

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

    def test_generate_quiz_chunks_long_text_and_combines_results(self) -> None:
        """Verify input texts exceeding chunk size are split into chunks and merged."""
        handler = self._create_handler()
        mock_service = MagicMock()
        mock_response = MagicMock()
        mock_response.text = json.dumps(self._SAMPLE_QUIZ_PAYLOAD)
        mock_response.usage_metadata = MagicMock(prompt_token_count=50, candidates_token_count=40)
        mock_service.call_with_retry.return_value = mock_response

        # 600 words with chunk_size 250 yields 3 chunks
        long_text = "word " * 600
        result = handler.generate_quiz(
            text=long_text,
            difficulty="medium",
            mcq_count=5,
            flashcard_count=5,
            service=mock_service,
            chunk_size=250,
        )

        assert mock_service.call_with_retry.call_count == 3
        assert len(result["mcqs"]) == 3
        assert len(result["flashcards"]) == 3
        assert result["metadata"]["inputTokens"] == 150
        assert result["metadata"]["outputTokens"] == 120
        assert result["metadata"]["totalChunks"] == 3

    def test_sanitize_chunk_size(self) -> None:
        """Verify chunk size sanitization and boundaries."""
        handler = self._create_handler()
        assert handler._sanitize_chunk_size(None) == 2500
        assert handler._sanitize_chunk_size(100) == 200
        assert handler._sanitize_chunk_size(10000) == 5000
        assert handler._sanitize_chunk_size("invalid") == 2500
        assert handler._sanitize_chunk_size(1500) == 1500

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

    def test_sanitize_throttle_speed(self) -> None:
        """Verify throttle speed sanitization and defaults."""
        handler = self._create_handler()
        assert handler._sanitize_throttle_speed(None) == "low"
        assert handler._sanitize_throttle_speed("invalid") == "low"
        assert handler._sanitize_throttle_speed("HIGH") == "high"
        assert handler._sanitize_throttle_speed("low") == "low"

    def test_do_post_with_throttle_speed_high(self) -> None:
        """Verify do_POST passes high throttle speed configuration."""
        payload = {
            "text": self._SAMPLE_TEXT,
            "throttleSpeed": "high",
        }
        handler = self._create_handler(payload)
        with (
            patch.object(handler, "generate_quiz") as mock_gen,
            patch.object(handler, "send_response") as mock_resp,
            patch.object(handler, "send_header"),
            patch.object(handler, "end_headers"),
        ):
            mock_gen.return_value = {"mcqs": [], "flashcards": []}
            handler.do_POST()
            mock_resp.assert_called_once_with(self._HTTP_OK)
            mock_gen.assert_called_once_with(
                self._SAMPLE_TEXT,
                "medium",
                5,
                5,
                chunk_size=2500,
                delay_seconds=4.0,
            )

    def test_build_generation_config(self) -> None:
        """Verify _build_generation_config returns GenerateContentConfig with JSON schema."""
        handler = self._create_handler()
        config = handler._build_generation_config()
        assert config.response_mime_type == "application/json"
        assert config.temperature == 0.7
        assert config.response_schema is not None

    def test_build_generation_config_compatible_with_gemini_service(self) -> None:
        """Verify generated config integrates with GeminiService content configuration."""
        handler = self._create_handler()
        config = handler._build_generation_config()
        gemini_svc = GeminiService()
        content_config = gemini_svc._build_generate_content_config(config)
        assert content_config.response_mime_type == "application/json"
        assert content_config.automatic_function_calling is not None
        assert content_config.automatic_function_calling.disable is True

    def test_build_prompt_includes_scenario_based_rules(self) -> None:
        """Verify _build_prompt instructs model on scenario-based tricky questions."""
        handler = self._create_handler()
        prompt = handler._build_prompt("Sample topic text.", "hard", 5, 5)
        assert "EVERY MCQ question MUST be scenario-based" in prompt
        assert "Make the MCQs tricky" in prompt
        assert "Flashcard fronts should be open-ended questions" in prompt

    def test_build_prompt_incorporates_previous_context(self) -> None:
        """Verify _build_prompt includes previous items in the avoidance block."""
        handler = self._create_handler()
        ctx = {"questions": ["Scenario Q1", "Scenario Q2"], "flashcards": ["Front F1"]}
        prompt = handler._build_prompt("Sample text.", "medium", 3, 3, previous_context=ctx)
        assert "Previous Questions and Flashcards to AVOID" in prompt
        assert "- Scenario Q1" in prompt
        assert "- Scenario Q2" in prompt
        assert "- Front F1" in prompt

    def test_extract_context_items_from_various_formats(self) -> None:
        """Verify _extract_context_items handles dicts, lists, and strings."""
        handler = self._create_handler()
        assert handler._extract_context_items(None) == []
        assert handler._extract_context_items("Single question text") == ["Single question text"]
        assert handler._extract_context_items(["Q1", "Q2"]) == ["Q1", "Q2"]
        dict_data = {"questions": ["Q1"], "flashcards": ["F1"]}
        assert handler._extract_context_items(dict_data) == ["Q1", "F1"]

    def test_do_post_parses_previous_context(self) -> None:
        """Verify do_POST extracts previousContext and forwards it to generate_quiz."""
        payload = {
            "text": self._SAMPLE_TEXT,
            "previousContext": {"questions": ["Previous Q1"]},
        }
        handler = self._create_handler(payload)
        with (
            patch.object(handler, "generate_quiz") as mock_gen,
            patch.object(handler, "send_response") as mock_resp,
            patch.object(handler, "send_header"),
            patch.object(handler, "end_headers"),
        ):
            mock_gen.return_value = {"mcqs": [], "flashcards": []}
            handler.do_POST()
            mock_resp.assert_called_once_with(self._HTTP_OK)
            expected_ctx = {"questions": ["Previous Q1"]}
            assert mock_gen.call_args.kwargs.get("previous_context") == expected_ctx

    def test_generate_chunked_accumulates_items_across_chunks(self) -> None:
        """Verify chunked generation passes accumulated items to subsequent chunks."""
        handler = self._create_handler()
        mock_svc = MagicMock()
        mock_resp = MagicMock()
        mock_resp.text = json.dumps(self._SAMPLE_QUIZ_PAYLOAD)
        mock_resp.usage_metadata = MagicMock(prompt_token_count=10, candidates_token_count=10)
        mock_svc.call_with_retry.return_value = mock_resp

        result = handler.generate_quiz(
            text="word " * 600,
            service=mock_svc,
            chunk_size=250,
            previous_context=["Initial Q0"],
        )
        assert mock_svc.call_with_retry.call_count == 3
        assert len(result["mcqs"]) == 3

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



