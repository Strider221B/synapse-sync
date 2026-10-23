"""Unit tests for the ChatEndpoint handler."""

from __future__ import annotations

import io
import json
from email.message import Message
from typing import Any, ClassVar
from unittest.mock import MagicMock, patch

from api.chat import ChatEndpoint
from tools.youtube_cli.config import Config


class TestChatEndpoint:
    """Test suite validating request parsing, prompt generation, error mapping, and chat logic."""

    _ENCODING: ClassVar[str] = "utf-8"
    _HTTP_OK: ClassVar[int] = 200
    _HTTP_BAD_REQUEST: ClassVar[int] = 400
    _HTTP_RATE_LIMITED: ClassVar[int] = 429
    _HTTP_INTERNAL_ERROR: ClassVar[int] = 500

    _SAMPLE_NOTE: ClassVar[str] = (
        "Neural networks are computing systems inspired by biological neural networks. "
        "A perceptron takes multiple binary inputs and produces a single binary output."
    )
    _SAMPLE_QUESTION: ClassVar[str] = "What is a perceptron?"
    _SAMPLE_ANSWER: ClassVar[str] = (
        "A perceptron is a fundamental building block of neural networks."
    )

    def _create_handler(self, body_data: dict[str, Any] | None = None) -> ChatEndpoint:
        """Construct mock ChatEndpoint instance with rfile, wfile, and headers."""
        instance = ChatEndpoint.__new__(ChatEndpoint)
        instance.wfile = io.BytesIO()

        body_bytes = json.dumps(body_data).encode(self._ENCODING) if body_data is not None else b""
        instance.rfile = io.BytesIO(body_bytes)

        headers = Message()
        headers["Content-Length"] = str(len(body_bytes))
        headers["Content-Type"] = "application/json"
        instance.headers = headers
        return instance

    def _get_response_json(self, handler: ChatEndpoint) -> dict[str, Any]:
        """Extract and parse HTTP response payload from handler wfile."""
        assert isinstance(handler.wfile, io.BytesIO)
        result: dict[str, Any] = json.loads(handler.wfile.getvalue().decode(self._ENCODING))
        return result

    def _create_mock_service(self, answer: str = _SAMPLE_ANSWER) -> MagicMock:
        """Create a mock GeminiService returning a stubbed generation response."""
        mock_svc = MagicMock()
        mock_response = MagicMock()
        mock_response.text = answer
        mock_response.usage_metadata.prompt_token_count = 150
        mock_response.usage_metadata.candidates_token_count = 45
        mock_svc.call_with_retry.return_value = mock_response
        return mock_svc

    def test_do_post_successful_default_mode(self) -> None:
        """POST with valid context and question returns 200 and formatted answer."""
        handler = self._create_handler({
            "noteContext": self._SAMPLE_NOTE,
            "question": self._SAMPLE_QUESTION,
            "conversationHistory": [{"role": "user", "content": "Hello"}],
            "mode": "default",
        })
        mock_result = {
            "answer": self._SAMPLE_ANSWER,
            "metadata": {
                "model": Config.get_default_model(),
                "inputTokens": 150,
                "outputTokens": 45,
            },
        }

        with (
            patch.object(handler, "ask", return_value=mock_result),
            patch.object(handler, "send_response") as mock_resp,
            patch.object(handler, "send_header"),
            patch.object(handler, "end_headers"),
        ):
            handler.do_POST()
            mock_resp.assert_called_once_with(self._HTTP_OK)

        data = self._get_response_json(handler)
        assert data["answer"] == self._SAMPLE_ANSWER
        assert data["metadata"]["model"] == Config.get_default_model()
        assert data["metadata"]["inputTokens"] == 150

    def test_do_post_returns_400_on_missing_body(self) -> None:
        """POST with empty body returns 400 Bad Request error."""
        handler = self._create_handler(None)
        handler.headers["Content-Length"] = "0"

        with (
            patch.object(handler, "send_response") as mock_resp,
            patch.object(handler, "send_header"),
            patch.object(handler, "end_headers"),
        ):
            handler.do_POST()
            mock_resp.assert_called_once_with(self._HTTP_BAD_REQUEST)

        data = self._get_response_json(handler)
        assert "error" in data
        assert data["error"]["code"] == "BAD_REQUEST"

    def test_do_post_returns_400_on_missing_note_context(self) -> None:
        """POST without noteContext returns 400 MISSING_NOTE_CONTEXT error."""
        handler = self._create_handler({
            "question": self._SAMPLE_QUESTION,
        })

        with (
            patch.object(handler, "send_response") as mock_resp,
            patch.object(handler, "send_header"),
            patch.object(handler, "end_headers"),
        ):
            handler.do_POST()
            mock_resp.assert_called_once_with(self._HTTP_BAD_REQUEST)

        data = self._get_response_json(handler)
        assert "error" in data
        assert data["error"]["code"] == "MISSING_NOTE_CONTEXT"

    def test_do_post_returns_400_on_missing_question(self) -> None:
        """POST without question returns 400 MISSING_QUESTION error."""
        handler = self._create_handler({
            "noteContext": self._SAMPLE_NOTE,
            "question": "   ",
        })

        with (
            patch.object(handler, "send_response") as mock_resp,
            patch.object(handler, "send_header"),
            patch.object(handler, "end_headers"),
        ):
            handler.do_POST()
            mock_resp.assert_called_once_with(self._HTTP_BAD_REQUEST)

        data = self._get_response_json(handler)
        assert "error" in data
        assert data["error"]["code"] == "MISSING_QUESTION"

    def test_do_post_returns_429_on_rate_limit(self) -> None:
        """POST encountering rate limit returns 429 status code."""
        handler = self._create_handler({
            "noteContext": self._SAMPLE_NOTE,
            "question": self._SAMPLE_QUESTION,
        })
        err = Exception("429 ResourceExhausted: quota exceeded")

        with (
            patch.object(handler, "ask", side_effect=err),
            patch.object(handler, "send_response") as mock_resp,
            patch.object(handler, "send_header"),
            patch.object(handler, "end_headers"),
        ):
            handler.do_POST()
            mock_resp.assert_called_once_with(self._HTTP_RATE_LIMITED)

        data = self._get_response_json(handler)
        assert "error" in data
        assert data["error"]["code"] == "RATE_LIMITED"

    def test_do_post_returns_500_on_internal_error(self) -> None:
        """POST encountering unexpected exception returns 500 status code."""
        handler = self._create_handler({
            "noteContext": self._SAMPLE_NOTE,
            "question": self._SAMPLE_QUESTION,
        })
        err = ValueError("Unexpected model failure")

        with (
            patch.object(handler, "ask", side_effect=err),
            patch.object(handler, "send_response") as mock_resp,
            patch.object(handler, "send_header"),
            patch.object(handler, "end_headers"),
        ):
            handler.do_POST()
            mock_resp.assert_called_once_with(self._HTTP_INTERNAL_ERROR)

        data = self._get_response_json(handler)
        assert "error" in data
        assert data["error"]["code"] == "GENERATION_FAILED"

    def test_ask_modes_prompts(self) -> None:
        """Verify prompt construction across default, explain, and quiz modes."""
        handler = self._create_handler()
        mock_svc = self._create_mock_service()

        handler.ask(self._SAMPLE_NOTE, self._SAMPLE_QUESTION, mode="explain", service=mock_svc)
        prompt_used = mock_svc.call_with_retry.call_args[1]["prompt"]
        assert "Explain using simple language" in prompt_used

        handler.ask(self._SAMPLE_NOTE, self._SAMPLE_QUESTION, mode="quiz", service=mock_svc)
        prompt_quiz = mock_svc.call_with_retry.call_args[1]["prompt"]
        assert "quiz the student" in prompt_quiz

        handler.ask(self._SAMPLE_NOTE, self._SAMPLE_QUESTION, mode="default", service=mock_svc)
        prompt_default = mock_svc.call_with_retry.call_args[1]["prompt"]
        assert "knowledgeable study assistant" in prompt_default

    def test_ask_context_truncation(self) -> None:
        """Verify note context exceeding 8000 words is truncated."""
        handler = self._create_handler()
        mock_svc = self._create_mock_service()
        long_note = " ".join(["concept"] * 9000)

        handler.ask(long_note, self._SAMPLE_QUESTION, service=mock_svc)
        prompt_used = mock_svc.call_with_retry.call_args[1]["prompt"]
        assert len(long_note.split()) == 9000
        extracted = prompt_used.split("--- Note Context Start ---\n")[1].split(
            "\n--- Note Context End ---"
        )[0]
        assert len(extracted.split()) == 8000

    def test_ask_history_clamping_to_max(self) -> None:
        """Verify only last 10 messages from history are included."""
        handler = self._create_handler()
        mock_svc = self._create_mock_service()
        long_history = [{"role": "user", "content": f"Message {i}"} for i in range(20)]

        handler.ask(
            self._SAMPLE_NOTE,
            self._SAMPLE_QUESTION,
            history=long_history,
            service=mock_svc,
        )
        prompt_used = mock_svc.call_with_retry.call_args[1]["prompt"]
        assert "Message 19" in prompt_used
        assert "Message 10" in prompt_used
        assert "Message 9" not in prompt_used

    def test_read_json_body_invalid_json(self) -> None:
        """Verify invalid json body returns None."""
        handler = ChatEndpoint.__new__(ChatEndpoint)
        handler.rfile = io.BytesIO(b"not a valid json")
        headers = Message()
        headers["Content-Length"] = "16"
        handler.headers = headers

        result = handler._read_json_body()
        assert result is None
