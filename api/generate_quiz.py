"""Serverless HTTP endpoint handler for generating MCQs and flashcards via Gemini."""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler
from typing import Any, ClassVar

from google.generativeai.types import GenerationConfig

from tools.youtube_cli.config import Config
from tools.youtube_cli.gemini_service import GeminiService


class GenerateQuiz(BaseHTTPRequestHandler):
    """HTTP request handler generating structured MCQs and flashcards from study text."""

    _HEADER_CONTENT_TYPE: ClassVar[str] = "Content-Type"
    _HEADER_CONTENT_LENGTH: ClassVar[str] = "Content-Length"
    _MIME_JSON: ClassVar[str] = "application/json"
    _ENCODING: ClassVar[str] = "utf-8"

    _HTTP_OK: ClassVar[int] = 200
    _HTTP_BAD_REQUEST: ClassVar[int] = 400
    _HTTP_RATE_LIMITED: ClassVar[int] = 429
    _HTTP_INTERNAL_ERROR: ClassVar[int] = 500

    _ERR_BAD_REQUEST: ClassVar[str] = "BAD_REQUEST"
    _ERR_TEXT_TOO_SHORT: ClassVar[str] = "TEXT_TOO_SHORT"
    _ERR_RATE_LIMITED: ClassVar[str] = "RATE_LIMITED"
    _ERR_GENERATION_FAILED: ClassVar[str] = "GENERATION_FAILED"

    _MSG_TEXT_TOO_SHORT: ClassVar[str] = "Provide at least 50 characters of text."
    _MSG_RATE_LIMITED: ClassVar[str] = "Gemini API rate limit reached. Try again in a minute."

    _MIN_TEXT_LENGTH: ClassVar[int] = 50
    _MAX_WORDS: ClassVar[int] = 8000
    _DEFAULT_COUNT: ClassVar[int] = 5
    _MIN_COUNT: ClassVar[int] = 1
    _MAX_COUNT: ClassVar[int] = 10
    _DEFAULT_DIFFICULTY: ClassVar[str] = "medium"
    _VALID_DIFFICULTIES: ClassVar[tuple[str, ...]] = ("easy", "medium", "hard")
    _TEMPERATURE: ClassVar[float] = 0.7

    _SYSTEM_PROMPT: ClassVar[str] = (
        "You are an expert educational content creator. Generate quiz questions "
        "and flashcards that test deep understanding, not just surface-level recall.\n\n"
        "Rules:\n"
        "- MCQ questions should have exactly 4 options with one correct answer\n"
        "- Flashcard fronts should be open-ended questions that require active recall\n"
        "- Flashcard backs should be concise but complete answers\n"
        "- All content must be based STRICTLY on the provided text — "
        "do not add external knowledge\n"
        "- Explanations should reference specific concepts from the text\n"
        "- Difficulty: {difficulty}"
    )

    _QUIZ_SCHEMA: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "mcqs": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "question": {"type": "string"},
                        "options": {"type": "array", "items": {"type": "string"}},
                        "correctIndex": {"type": "integer"},
                        "explanation": {"type": "string"},
                    },
                    "required": ["question", "options", "correctIndex", "explanation"],
                },
            },
            "flashcards": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "front": {"type": "string"},
                        "back": {"type": "string"},
                    },
                    "required": ["front", "back"],
                },
            },
        },
        "required": ["mcqs", "flashcards"],
    }

    def do_POST(self) -> None:
        """Handle POST request to generate quiz and flashcards."""
        body_dict = self._read_json_body()
        if not body_dict:
            self._send_error(self._HTTP_BAD_REQUEST, self._ERR_BAD_REQUEST, "Missing request body")
            return

        text = str(body_dict.get("text", "")).strip()
        if len(text) < self._MIN_TEXT_LENGTH:
            self._send_error(
                self._HTTP_BAD_REQUEST, self._ERR_TEXT_TOO_SHORT, self._MSG_TEXT_TOO_SHORT
            )
            return

        difficulty = self._sanitize_difficulty(body_dict.get("difficulty"))
        mcq_count = self._clamp_count(body_dict.get("mcqCount", self._DEFAULT_COUNT))
        flash_count = self._clamp_count(body_dict.get("flashcardCount", self._DEFAULT_COUNT))

        try:
            result = self.generate_quiz(text, difficulty, mcq_count, flash_count)
            self._send_json(self._HTTP_OK, result)
        except Exception as err:
            self._handle_generation_error(err)

    def generate_quiz(
        self,
        text: str,
        difficulty: str = _DEFAULT_DIFFICULTY,
        mcq_count: int = _DEFAULT_COUNT,
        flashcard_count: int = _DEFAULT_COUNT,
        service: GeminiService | None = None,
        model_name: str | None = None,
    ) -> dict[str, Any]:
        """Generate structured MCQs and flashcards using Gemini service."""
        active_model = model_name or Config.get_default_model()
        truncated_text = self._truncate_text(text)
        prompt = self._build_prompt(truncated_text, difficulty, mcq_count, flashcard_count)
        config = self._build_generation_config()
        gemini_svc = service if service is not None else GeminiService()

        response = gemini_svc.call_with_retry(
            model_name=active_model,
            prompt=prompt,
            config=config,
        )
        return self._parse_quiz_response(response, active_model)

    def _sanitize_difficulty(self, diff: Any) -> str:
        """Sanitize and validate difficulty string, returning default if invalid."""
        clean = str(diff).lower() if diff is not None else self._DEFAULT_DIFFICULTY
        return clean if clean in self._VALID_DIFFICULTIES else self._DEFAULT_DIFFICULTY

    def _clamp_count(self, count_val: Any) -> int:
        """Clamp question counts within allowed minimum and maximum boundaries."""
        try:
            parsed = int(count_val)
            return max(self._MIN_COUNT, min(self._MAX_COUNT, parsed))
        except (ValueError, TypeError):
            return self._DEFAULT_COUNT

    def _truncate_text(self, text: str) -> str:
        """Truncate input content to maximum allowable word count."""
        words = text.split()
        if len(words) > self._MAX_WORDS:
            return " ".join(words[: self._MAX_WORDS])
        return text

    def _build_prompt(self, text: str, diff: str, mcqs: int, flashcards: int) -> str:
        """Format the system and user prompt with parameter substitutions."""
        header = self._SYSTEM_PROMPT.format(difficulty=diff)
        instructions = (
            f"Generate exactly {mcqs} multiple-choice questions and {flashcards} "
            f"active recall flashcards based strictly on the following text:\n\n"
            f"---\n{text}\n---"
        )
        return f"{header}\n\n{instructions}"

    def _build_generation_config(self) -> Any:
        """Construct GenerationConfig enforcing structured JSON schema output."""
        return GenerationConfig(
            response_mime_type=self._MIME_JSON,
            response_schema=self._QUIZ_SCHEMA,
            temperature=self._TEMPERATURE,
        )

    def _parse_quiz_response(self, response: Any, model_name: str) -> dict[str, Any]:
        """Parse raw Gemini response text into structured dictionary with usage tokens."""
        raw_text = response.text if hasattr(response, "text") else str(response)
        parsed: dict[str, Any] = json.loads(raw_text)
        usage = getattr(response, "usage_metadata", None)
        in_tokens = getattr(usage, "prompt_token_count", 0) if usage else 0
        out_tokens = getattr(usage, "candidates_token_count", 0) if usage else 0

        parsed["metadata"] = {
            "model": model_name,
            "inputTokens": in_tokens,
            "outputTokens": out_tokens,
        }
        return parsed

    def _handle_generation_error(self, err: Exception) -> None:
        """Route exception to 429 rate limit or 500 generation failure response."""
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


handler = GenerateQuiz
