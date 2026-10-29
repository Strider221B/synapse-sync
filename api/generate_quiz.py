"""Serverless HTTP endpoint handler for generating MCQs and flashcards via Gemini."""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler
from typing import Any, ClassVar

from google.genai import types

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
    _HTTP_GATEWAY_TIMEOUT: ClassVar[int] = 504

    _ERR_BAD_REQUEST: ClassVar[str] = "BAD_REQUEST"
    _ERR_TEXT_TOO_SHORT: ClassVar[str] = "TEXT_TOO_SHORT"
    _ERR_RATE_LIMITED: ClassVar[str] = "RATE_LIMITED"
    _ERR_GENERATION_FAILED: ClassVar[str] = "GENERATION_FAILED"
    _ERR_TIMEOUT: ClassVar[str] = "TIMEOUT"

    _MSG_TEXT_TOO_SHORT: ClassVar[str] = "Provide at least 50 characters of text."
    _MSG_RATE_LIMITED: ClassVar[str] = "Gemini API rate limit reached. Try again in a minute."
    _MSG_TIMEOUT: ClassVar[str] = "Quiz generation request timed out. Please try again."

    _MIN_TEXT_LENGTH: ClassVar[int] = 50
    _MIN_CHUNK_WORDS: ClassVar[int] = 200
    _MAX_CHUNK_WORDS: ClassVar[int] = 5000
    _DEFAULT_CHUNK_WORDS: ClassVar[int] = 2500
    _DEFAULT_COUNT: ClassVar[int] = 5
    _MIN_COUNT: ClassVar[int] = 1
    _MAX_COUNT: ClassVar[int] = 10
    _DEFAULT_DIFFICULTY: ClassVar[str] = "medium"
    _VALID_DIFFICULTIES: ClassVar[tuple[str, ...]] = ("easy", "medium", "hard")
    _DEFAULT_THROTTLE_SPEED: ClassVar[str] = "low"
    _VALID_THROTTLE_SPEEDS: ClassVar[tuple[str, ...]] = ("low", "high")
    _THROTTLE_DELAY_HIGH: ClassVar[float] = 4.0
    _THROTTLE_DELAY_LOW: ClassVar[float] = 0.0
    _TEMPERATURE: ClassVar[float] = 0.7

    _SYSTEM_PROMPT: ClassVar[str] = (
        "You are an expert educational content creator. Generate quiz questions "
        "and flashcards that test deep understanding and practical application, "
        "not just surface-level recall.\n\n"
        "Rules for Multiple Choice Questions (MCQs):\n"
        "- EVERY MCQ question MUST be scenario-based: present a concrete, realistic real-life "
        "scenario or case study where the concept would be useful or applied in practice.\n"
        "- Make the MCQs tricky: design plausible, tricky distractors that target subtle "
        "misconceptions, edge cases, and common pitfalls. Avoid simple or obvious choices.\n"
        "- Each MCQ must have exactly 4 options with one unambiguously correct answer.\n"
        "- Explanations must clearly justify why the correct option is the best choice in that "
        "scenario and explain why the tricky distractors are incorrect, referencing specific "
        "concepts from the text.\n\n"
        "Rules for Flashcards:\n"
        "- Flashcard fronts should be open-ended questions that require active recall\n"
        "- Flashcard backs should be concise but complete answers\n\n"
        "General Rules:\n"
        "- All content must be based STRICTLY on the provided text — "
        "do not add external knowledge\n"
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

        args, kwargs = self._extract_post_params(body_dict)
        if body_dict.get("exportOnly") or body_dict.get("mode") == "export":
            export_result = self.export_quiz_prompts(text, *args, **kwargs)
            self._send_json(self._HTTP_OK, export_result)
            return

        try:
            result = self.generate_quiz(text, *args, **kwargs)
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
        chunk_size: int = _DEFAULT_CHUNK_WORDS,
        delay_seconds: float = _THROTTLE_DELAY_LOW,
        previous_context: Any = None,
    ) -> dict[str, Any]:
        """Generate structured MCQs and flashcards with chunking for large texts."""
        active_model = model_name or Config.get_default_model()
        gemini_svc = service if service is not None else GeminiService(delay_seconds=delay_seconds)
        words = text.split()
        if len(words) <= chunk_size:
            result = self._generate_single_chunk(
                text, difficulty, mcq_count, flashcard_count, gemini_svc, active_model,
                previous_context=previous_context,
            )
        else:
            result = self._generate_chunked(
                words, difficulty, mcq_count, flashcard_count, gemini_svc, active_model, chunk_size,
                previous_context=previous_context,
            )
        result["metadata"]["stats"] = gemini_svc.get_stats()
        return result

    def export_quiz_prompts(
        self,
        text: str,
        difficulty: str = _DEFAULT_DIFFICULTY,
        mcq_count: int = _DEFAULT_COUNT,
        flashcard_count: int = _DEFAULT_COUNT,
        chunk_size: int = _DEFAULT_CHUNK_WORDS,
        previous_context: Any = None,
        **_extra: Any,
    ) -> dict[str, Any]:
        """Export note chunks with full prompt and expected schema without calling Gemini."""
        words = text.split()
        sanitized_chunk_size = self._sanitize_chunk_size(chunk_size)
        sanitized_diff = self._sanitize_difficulty(difficulty)
        safe_mcq = self._clamp_count(mcq_count)
        safe_flash = self._clamp_count(flashcard_count)
        chunks = self._chunk_words(words, sanitized_chunk_size)
        accumulated = self._extract_context_items(previous_context)
        chunk_payloads = self._build_export_chunks(
            chunks, sanitized_diff, safe_mcq, safe_flash, accumulated
        )
        return {
            "totalChunks": len(chunks),
            "chunkSize": sanitized_chunk_size,
            "difficulty": sanitized_diff,
            "mcqCount": safe_mcq,
            "flashcardCount": safe_flash,
            "previousContext": accumulated,
            "outputSchema": self._QUIZ_SCHEMA,
            "chunks": chunk_payloads,
        }

    def _accumulate_chunk_items(
        self, accumulated: list[str], chunk_result: dict[str, Any]
    ) -> None:
        """Collect newly generated questions and flashcard fronts into the exclusion pool."""
        for mcq in chunk_result.get("mcqs", []):
            q_text = str(mcq.get("question", "")).strip()
            if q_text and q_text not in accumulated:
                accumulated.append(q_text)
        for flash in chunk_result.get("flashcards", []):
            f_front = str(flash.get("front", "")).strip()
            if f_front and f_front not in accumulated:
                accumulated.append(f_front)

    def _build_export_chunks(
        self,
        chunks: list[list[str]],
        diff: str,
        mcqs: int,
        flashcards: int,
        context_items: list[str],
    ) -> list[dict[str, Any]]:
        """Construct individual chunk prompt representations for export."""
        results: list[dict[str, Any]] = []
        for idx, chunk in enumerate(chunks):
            part_info = f" (Part {idx + 1} of {len(chunks)})" if len(chunks) > 1 else ""
            chunk_text = " ".join(chunk)
            prompt = self._build_prompt(
                chunk_text, diff, mcqs, flashcards, part_info, context_items
            )
            results.append({
                "chunkIndex": idx + 1,
                "totalChunks": len(chunks),
                "wordCount": len(chunk),
                "text": chunk_text,
                "prompt": prompt,
                "outputSchema": self._QUIZ_SCHEMA,
            })
        return results

    def _build_generation_config(self) -> types.GenerateContentConfig:
        """Construct GenerateContentConfig enforcing structured JSON schema output."""
        return types.GenerateContentConfig(
            response_mime_type=self._MIME_JSON,
            response_schema=self._QUIZ_SCHEMA,
            temperature=self._TEMPERATURE,
        )

    def _build_prompt(
        self,
        text: str,
        diff: str,
        mcqs: int,
        flashcards: int,
        part_info: str = "",
        previous_context: Any = None,
    ) -> str:
        """Format the system and user prompt with parameter substitutions."""
        header = self._SYSTEM_PROMPT.format(difficulty=diff)
        instructions = (
            f"Generate exactly {mcqs} scenario-based tricky multiple-choice questions "
            f"and {flashcards} active recall flashcards based strictly on the "
            f"following text{part_info}:\n\n"
            f"---\n{text}\n---"
        )
        context_block = self._format_previous_context(previous_context)
        if context_block:
            return f"{header}\n\n{context_block}\n\n{instructions}"
        return f"{header}\n\n{instructions}"

    def _chunk_words(self, words: list[str], chunk_size: int) -> list[list[str]]:
        """Slice words list into chunks of designated size."""
        return [words[i : i + chunk_size] for i in range(0, len(words), chunk_size)]

    def _clamp_count(self, count_val: Any) -> int:
        """Clamp question counts within allowed minimum and maximum boundaries."""
        try:
            parsed = int(count_val)
            return max(self._MIN_COUNT, min(self._MAX_COUNT, parsed))
        except (ValueError, TypeError):
            return self._DEFAULT_COUNT

    def _combine_quiz_results(
        self, results: list[dict[str, Any]], active_model: str
    ) -> dict[str, Any]:
        """Aggregate MCQs, flashcards, and token usage metadata across chunks."""
        all_mcqs: list[dict[str, Any]] = []
        all_flashcards: list[dict[str, Any]] = []
        total_in = 0
        total_out = 0
        for res in results:
            all_mcqs.extend(res.get("mcqs", []))
            all_flashcards.extend(res.get("flashcards", []))
            meta = res.get("metadata", {})
            total_in += meta.get("inputTokens", 0)
            total_out += meta.get("outputTokens", 0)
        return {
            "mcqs": all_mcqs,
            "flashcards": all_flashcards,
            "metadata": {
                "model": active_model,
                "inputTokens": total_in,
                "outputTokens": total_out,
                "totalChunks": len(results),
            },
        }

    def _extract_context_items(self, context_data: Any) -> list[str]:
        """Normalize various context representations into a list of prompt strings."""
        if not context_data:
            return []
        if isinstance(context_data, list):
            return [str(x).strip() for x in context_data if str(x).strip()]
        if isinstance(context_data, dict):
            items: list[str] = []
            for key in ("questions", "mcqs", "flashcards"):
                val = context_data.get(key)
                if isinstance(val, list):
                    items.extend([str(x).strip() for x in val if str(x).strip()])
            return items
        if isinstance(context_data, str) and context_data.strip():
            return [context_data.strip()]
        return []

    def _extract_post_params(
        self, body_dict: dict[str, Any]
    ) -> tuple[tuple[str, int, int], dict[str, Any]]:
        """Extract and sanitize quiz generation parameters from request body."""
        difficulty = self._sanitize_difficulty(body_dict.get("difficulty"))
        mcq_count = self._clamp_count(body_dict.get("mcqCount", self._DEFAULT_COUNT))
        flash_count = self._clamp_count(body_dict.get("flashcardCount", self._DEFAULT_COUNT))
        chunk_size = self._sanitize_chunk_size(body_dict.get("chunkSize"))
        throttle_speed = self._sanitize_throttle_speed(body_dict.get("throttleSpeed"))
        delay_sec = (
            self._THROTTLE_DELAY_HIGH if throttle_speed == "high" else self._THROTTLE_DELAY_LOW
        )
        prev_ctx = (
            body_dict.get("previousContext")
            or body_dict.get("context")
            or body_dict.get("previous_context")
        )
        kwargs: dict[str, Any] = {
            "chunk_size": chunk_size,
            "delay_seconds": delay_sec,
        }
        if prev_ctx:
            kwargs["previous_context"] = prev_ctx
        return (difficulty, mcq_count, flash_count), kwargs

    def _format_previous_context(self, prev_context: Any) -> str:
        """Format previous questions/flashcards into a prompt constraint section."""
        items = self._extract_context_items(prev_context)
        if not items:
            return ""
        lines = [
            "Previous Questions and Flashcards to AVOID "
            "(Do NOT duplicate, repeat, or rephrase these):"
        ]
        for itm in items[:30]:
            lines.append(f"- {itm}")
        lines.append(
            "Ensure all newly generated questions and flashcards explore DIFFERENT concepts, "
            "different real-life scenarios, and different aspects of the text."
        )
        return "\n".join(lines)

    def _generate_chunked(
        self,
        words: list[str],
        difficulty: str,
        mcq_count: int,
        flashcard_count: int,
        gemini_svc: GeminiService,
        active_model: str,
        chunk_size: int,
        previous_context: Any = None,
    ) -> dict[str, Any]:
        """Split text into segments, generate quiz items per chunk, and merge."""
        chunks = self._chunk_words(words, chunk_size)
        results: list[dict[str, Any]] = []
        accumulated = self._extract_context_items(previous_context)
        for idx, chunk in enumerate(chunks):
            part_info = f" (Part {idx + 1} of {len(chunks)})"
            chunk_text = " ".join(chunk)
            res = self._generate_single_chunk(
                chunk_text,
                difficulty,
                mcq_count,
                flashcard_count,
                gemini_svc,
                active_model,
                part_info=part_info,
                previous_context=accumulated,
            )
            results.append(res)
            self._accumulate_chunk_items(accumulated, res)
        return self._combine_quiz_results(results, active_model)

    def _generate_single_chunk(
        self,
        text: str,
        difficulty: str,
        mcq_count: int,
        flashcard_count: int,
        gemini_svc: GeminiService,
        active_model: str,
        part_info: str = "",
        previous_context: Any = None,
    ) -> dict[str, Any]:
        """Generate quiz payload for a single chunk of text."""
        prompt = self._build_prompt(
            text, difficulty, mcq_count, flashcard_count, part_info, previous_context
        )
        config = self._build_generation_config()
        response = gemini_svc.call_with_retry(
            model_name=active_model,
            prompt=prompt,
            config=config,
        )
        return self._parse_quiz_response(response, active_model)

    def _handle_generation_error(self, err: Exception) -> None:
        """Route exception to 429 rate limit, 504 timeout, or 500 generation failure response."""
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
        if "timeout" in err_lower or "timed out" in err_lower:
            self._send_error(
                self._HTTP_GATEWAY_TIMEOUT, self._ERR_TIMEOUT, self._MSG_TIMEOUT
            )
            return
        self._send_error(self._HTTP_INTERNAL_ERROR, self._ERR_GENERATION_FAILED, err_str)

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

    def _sanitize_chunk_size(self, size_val: Any) -> int:
        """Sanitize and validate chunk size parameter or return default."""
        try:
            if size_val is None:
                return self._DEFAULT_CHUNK_WORDS
            parsed = int(size_val)
            return max(self._MIN_CHUNK_WORDS, min(self._MAX_CHUNK_WORDS, parsed))
        except (ValueError, TypeError):
            return self._DEFAULT_CHUNK_WORDS

    def _sanitize_difficulty(self, diff: Any) -> str:
        """Sanitize and validate difficulty string, returning default if invalid."""
        clean = str(diff).lower() if diff is not None else self._DEFAULT_DIFFICULTY
        return clean if clean in self._VALID_DIFFICULTIES else self._DEFAULT_DIFFICULTY

    def _sanitize_throttle_speed(self, speed_val: Any) -> str:
        """Sanitize and validate throttle speed parameter or return default."""
        clean = str(speed_val).lower() if speed_val is not None else self._DEFAULT_THROTTLE_SPEED
        return clean if clean in self._VALID_THROTTLE_SPEEDS else self._DEFAULT_THROTTLE_SPEED

    def _send_error(self, status: int, code: str, message: str) -> None:
        """Emit structured JSON error response conforming to API standards."""
        self._send_json(status, {"error": {"code": code, "message": message}})

    def _send_json(self, status: int, data: dict[str, Any]) -> None:
        """Serialize payload to JSON and emit HTTP response headers and body."""
        body = json.dumps(data).encode(self._ENCODING)
        self.send_response(status)
        self.send_header(self._HEADER_CONTENT_TYPE, self._MIME_JSON)
        self.send_header(self._HEADER_CONTENT_LENGTH, str(len(body)))
        self.end_headers()
        self.wfile.write(body)


handler = GenerateQuiz
