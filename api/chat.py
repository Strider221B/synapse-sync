"""Serverless HTTP endpoint handler for AI study assistant chat via Gemini."""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler
from typing import Any, ClassVar

from tools.youtube_cli.gemini_service import GeminiService


class ChatEndpoint(BaseHTTPRequestHandler):
    """HTTP request handler providing context-aware AI study assistant chat."""

    _HEADER_CONTENT_TYPE: ClassVar[str] = "Content-Type"
    _HEADER_CONTENT_LENGTH: ClassVar[str] = "Content-Length"
    _MIME_JSON: ClassVar[str] = "application/json"
    _ENCODING: ClassVar[str] = "utf-8"
    _DEFAULT_MODEL: ClassVar[str] = "gemini-2.0-flash"

    _HTTP_OK: ClassVar[int] = 200
    _HTTP_BAD_REQUEST: ClassVar[int] = 400
    _HTTP_RATE_LIMITED: ClassVar[int] = 429
    _HTTP_INTERNAL_ERROR: ClassVar[int] = 500

    _ERR_BAD_REQUEST: ClassVar[str] = "BAD_REQUEST"
    _ERR_MISSING_NOTE_CONTEXT: ClassVar[str] = "MISSING_NOTE_CONTEXT"
    _ERR_MISSING_QUESTION: ClassVar[str] = "MISSING_QUESTION"
    _ERR_RATE_LIMITED: ClassVar[str] = "RATE_LIMITED"
    _ERR_GENERATION_FAILED: ClassVar[str] = "GENERATION_FAILED"

    _MSG_MISSING_BODY: ClassVar[str] = "Missing request body"
    _MSG_MISSING_NOTE_CONTEXT: ClassVar[str] = (
        "Field 'noteContext' is required and cannot be empty."
    )
    _MSG_MISSING_QUESTION: ClassVar[str] = "Field 'question' is required and cannot be empty."
    _MSG_RATE_LIMITED: ClassVar[str] = "Gemini API rate limit reached. Try again in a minute."

    _KEY_NOTE_CONTEXT: ClassVar[str] = "noteContext"
    _KEY_QUESTION: ClassVar[str] = "question"
    _KEY_HISTORY: ClassVar[str] = "conversationHistory"
    _KEY_MODE: ClassVar[str] = "mode"
    _KEY_ROLE: ClassVar[str] = "role"
    _KEY_CONTENT: ClassVar[str] = "content"
    _KEY_ANSWER: ClassVar[str] = "answer"
    _KEY_METADATA: ClassVar[str] = "metadata"
    _KEY_MODEL: ClassVar[str] = "model"
    _KEY_INPUT_TOKENS: ClassVar[str] = "inputTokens"
    _KEY_OUTPUT_TOKENS: ClassVar[str] = "outputTokens"

    _MODE_DEFAULT: ClassVar[str] = "default"
    _MODE_EXPLAIN: ClassVar[str] = "explain"
    _MODE_QUIZ: ClassVar[str] = "quiz"

    _PROMPT_SYSTEM_DEFAULT: ClassVar[str] = (
        "You are a knowledgeable study assistant. Answer questions based strictly on the provided "
        "note content. If the answer isn't in the notes, say so."
    )
    _PROMPT_SYSTEM_EXPLAIN: ClassVar[str] = (
        "Explain using simple language, analogies, and real-world examples. "
        "Break down complex concepts as if explaining to a beginner."
    )
    _PROMPT_SYSTEM_QUIZ: ClassVar[str] = (
        "Based on the note content, quiz the student by asking follow-up questions to test their "
        "understanding."
    )

    _MAX_CONTEXT_WORDS: ClassVar[int] = 8000
    _MAX_HISTORY_MESSAGES: ClassVar[int] = 10

    def do_POST(self) -> None:
        """Handle POST request for AI study assistant chat conversation."""
        body_dict = self._read_json_body()
        if not body_dict:
            self._send_error(self._HTTP_BAD_REQUEST, self._ERR_BAD_REQUEST, self._MSG_MISSING_BODY)
            return

        note_context = str(body_dict.get(self._KEY_NOTE_CONTEXT, "")).strip()
        if not note_context:
            self._send_error(
                self._HTTP_BAD_REQUEST,
                self._ERR_MISSING_NOTE_CONTEXT,
                self._MSG_MISSING_NOTE_CONTEXT,
            )
            return

        question = str(body_dict.get(self._KEY_QUESTION, "")).strip()
        if not question:
            self._send_error(
                self._HTTP_BAD_REQUEST, self._ERR_MISSING_QUESTION, self._MSG_MISSING_QUESTION
            )
            return

        raw_history = body_dict.get(self._KEY_HISTORY, [])
        history = raw_history if isinstance(raw_history, list) else []
        mode = str(body_dict.get(self._KEY_MODE, self._MODE_DEFAULT)).strip().lower()

        try:
            result = self.ask(note_context, question, history, mode)
            self._send_json(self._HTTP_OK, result)
        except Exception as err:
            self._handle_chat_error(err)

    def ask(
        self,
        note_context: str,
        question: str,
        history: list[dict[str, Any]] | None = None,
        mode: str = _MODE_DEFAULT,
        service: GeminiService | None = None,
    ) -> dict[str, Any]:
        """Query Gemini with contextual note content, bounded history, and mode instructions."""
        gemini_svc = service if service is not None else GeminiService()
        cleaned_history = self._filter_history(history or [])
        prompt = self._build_prompt(note_context, question, cleaned_history, mode)

        response = gemini_svc.call_with_retry(
            model_name=self._DEFAULT_MODEL,
            prompt=prompt,
        )
        return self._format_response(response)

    def _filter_history(self, history: list[dict[str, Any]]) -> list[dict[str, str]]:
        """Filter and bound conversation history to the most recent messages."""
        recent_items = history[-self._MAX_HISTORY_MESSAGES :]
        sanitized: list[dict[str, str]] = []
        for item in recent_items:
            if isinstance(item, dict):
                role = str(item.get(self._KEY_ROLE, "user"))
                content = str(item.get(self._KEY_CONTENT, "")).strip()
                if content:
                    sanitized.append({self._KEY_ROLE: role, self._KEY_CONTENT: content})
        return sanitized

    def _truncate_context(self, context: str) -> str:
        """Truncate note context to maximum allowable word count."""
        words = context.split()
        if len(words) > self._MAX_CONTEXT_WORDS:
            return " ".join(words[: self._MAX_CONTEXT_WORDS])
        return context

    def _get_mode_instruction(self, mode: str) -> str:
        """Retrieve the system prompt instruction corresponding to the specified mode."""
        if mode == self._MODE_EXPLAIN:
            return self._PROMPT_SYSTEM_EXPLAIN
        if mode == self._MODE_QUIZ:
            return self._PROMPT_SYSTEM_QUIZ
        return self._PROMPT_SYSTEM_DEFAULT

    def _format_history_block(self, history: list[dict[str, str]]) -> str:
        """Format history list into text block for model context continuity."""
        if not history:
            return ""
        lines: list[str] = ["Conversation History:"]
        for entry in history:
            role_label = "Assistant" if entry.get(self._KEY_ROLE) == "assistant" else "Student"
            lines.append(f"{role_label}: {entry.get(self._KEY_CONTENT, '')}")
        return "\n".join(lines) + "\n\n"

    def _build_prompt(
        self,
        note_context: str,
        question: str,
        history: list[dict[str, str]],
        mode: str,
    ) -> str:
        """Build the combined prompt incorporating system instruction, context, and query."""
        mode_instruction = self._get_mode_instruction(mode)
        truncated_context = self._truncate_context(note_context)
        history_text = self._format_history_block(history)
        return (
            f"{mode_instruction}\n\n"
            f"--- Note Context Start ---\n"
            f"{truncated_context}\n"
            f"--- Note Context End ---\n\n"
            f"{history_text}"
            f"Student Question: {question}\n\n"
            f"Assistant Response:"
        )

    def _format_response(self, response: Any) -> dict[str, Any]:
        """Extract answer text and usage token counts from Gemini response."""
        answer_text = response.text if hasattr(response, "text") else str(response)
        usage = getattr(response, "usage_metadata", None)
        in_tokens = getattr(usage, "prompt_token_count", 0) if usage else 0
        out_tokens = getattr(usage, "candidates_token_count", 0) if usage else 0

        return {
            self._KEY_ANSWER: answer_text,
            self._KEY_METADATA: {
                self._KEY_MODEL: self._DEFAULT_MODEL,
                self._KEY_INPUT_TOKENS: in_tokens,
                self._KEY_OUTPUT_TOKENS: out_tokens,
            },
        }

    def _handle_chat_error(self, err: Exception) -> None:
        """Map exception to structured JSON error response."""
        err_str = str(err)
        err_lower = err_str.lower()
        if (
            "429" in err_str
            or "quota" in err_lower
            or "resourceexhausted" in err_lower
        ):
            self._send_error(
                self._HTTP_RATE_LIMITED, self._ERR_RATE_LIMITED, self._MSG_RATE_LIMITED
            )
            return
        self._send_error(self._HTTP_INTERNAL_ERROR, self._ERR_GENERATION_FAILED, err_str)

    def _read_json_body(self) -> dict[str, Any] | None:
        """Read and decode request body bytes into JSON dictionary."""
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
        """Serialize payload to JSON and emit response headers and body."""
        body = json.dumps(data).encode(self._ENCODING)
        self.send_response(status)
        self.send_header(self._HEADER_CONTENT_TYPE, self._MIME_JSON)
        self.send_header(self._HEADER_CONTENT_LENGTH, str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_error(self, status: int, code: str, message: str) -> None:
        """Emit structured JSON error response conforming to API standards."""
        self._send_json(status, {"error": {"code": code, "message": message}})


handler = ChatEndpoint
