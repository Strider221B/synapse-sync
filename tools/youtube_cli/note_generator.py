"""Generates detailed, exhaustive study notes from transcripts using Gemini."""

from __future__ import annotations

import json
from typing import Any, ClassVar

from tools.youtube_cli.config import Config
from tools.youtube_cli.gemini_service import GeminiService


class NoteGenerator:
    """Orchestrates comprehensive study note generation via Gemini structured output."""

    _MAX_CHUNK_WORDS: ClassVar[int] = 7500
    _SYSTEM_PROMPT: ClassVar[str] = (
        "You are a meticulous note-taker, not a summarizer. "
        "Capture EVERY concept, definition, example, analogy, formula, and explanation. "
        "The notes should be detailed enough that someone reading only these notes would have a "
        "thorough understanding of the topic without needing to watch the original video. "
        "Use headings, subheadings, bullet points, numbered lists, bold/italic, and code blocks. "
        "Include specific examples, numbers, and data points mentioned in the lecture. "
        "Output MUST adhere strictly to the JSON schema."
    )
    _JSON_MIME: ClassVar[str] = "application/json"
    _KEY_TITLE: ClassVar[str] = "title"
    _KEY_SUMMARY: ClassVar[str] = "summary"
    _KEY_KEY_POINTS: ClassVar[str] = "keyPoints"
    _KEY_MARKDOWN_NOTES: ClassVar[str] = "markdownNotes"

    def __init__(
        self,
        gemini_service: GeminiService | None = None,
        model_name: str | None = None,
    ) -> None:
        """Initialize NoteGenerator with Gemini service wrapper and model choice."""
        self._gemini_service = gemini_service if gemini_service is not None else GeminiService()
        self._model_name = model_name or Config.get_default_model()

    def generate(
        self, transcript: str, video_title: str, on_retry: Any = None
    ) -> dict[str, Any]:
        """Generate comprehensive notes from full transcript text and video title."""
        if not transcript or not transcript.strip():
            raise ValueError("Transcript text cannot be empty")

        words = transcript.split()
        if len(words) <= self._MAX_CHUNK_WORDS:
            return self._generate_single_chunk(transcript, video_title, on_retry)
        return self._generate_chunked(words, video_title, on_retry)

    def _generate_single_chunk(
        self, transcript: str, video_title: str, on_retry: Any = None
    ) -> dict[str, Any]:
        """Execute single Gemini structured generation for transcripts within limit."""
        prompt = self._build_prompt(transcript, video_title)
        config = self._build_generation_config()
        response = self._gemini_service.call_with_retry(
            self._model_name, prompt, config=config, on_retry=on_retry
        )
        parsed = self._parse_response_json(response)
        metadata = self._extract_token_usage(response)
        return self._format_result_payload(parsed, video_title, metadata)

    def _generate_chunked(
        self, words: list[str], video_title: str, on_retry: Any = None
    ) -> dict[str, Any]:
        """Split oversized transcripts, generate notes per segment, and stitch results."""
        chunks = self._chunk_words(words, self._MAX_CHUNK_WORDS)
        results = [
            self._generate_single_chunk(
                " ".join(chunk),
                f"{video_title} (Part {idx + 1}/{len(chunks)})",
                on_retry,
            )
            for idx, chunk in enumerate(chunks)
        ]
        return self._combine_chunk_results(results, video_title)

    def _build_prompt(self, transcript: str, video_title: str) -> str:
        """Format the user prompt containing transcript content and instructions."""
        return (
            f"{self._SYSTEM_PROMPT}\n\n"
            f"Video Title: {video_title}\n\n"
            f"Transcript:\n{transcript}\n\n"
            f"Produce exhaustively detailed notes in JSON format."
        )

    def _build_generation_config(self) -> dict[str, Any]:
        """Build GenerationConfig dictionary enforcing JSON structured output schema."""
        return {
            "response_mime_type": self._JSON_MIME,
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

    def _parse_response_json(self, response: Any) -> dict[str, Any]:
        """Extract and decode JSON payload from model response."""
        text = response.text if hasattr(response, "text") else str(response)
        try:
            parsed: dict[str, Any] = json.loads(text)
            return parsed
        except json.JSONDecodeError as err:
            raise ValueError(f"Failed to parse Gemini JSON output: {err}") from err

    def _extract_token_usage(self, response: Any) -> dict[str, Any]:
        """Safely extract token usage metadata if present in response object."""
        usage = getattr(response, "usage_metadata", None)
        in_tokens = getattr(usage, "prompt_token_count", 0) if usage else 0
        out_tokens = getattr(usage, "candidates_token_count", 0) if usage else 0
        return {
            "model": self._model_name,
            "input_tokens": in_tokens,
            "output_tokens": out_tokens,
        }

    def _format_result_payload(
        self, parsed: dict[str, Any], default_title: str, metadata: dict[str, Any]
    ) -> dict[str, Any]:
        """Construct standard output dictionary conforming to design requirements."""
        title = parsed.get(self._KEY_TITLE) or default_title
        summary = parsed.get(self._KEY_SUMMARY) or ""
        key_points = parsed.get(self._KEY_KEY_POINTS) or []
        notes = parsed.get(self._KEY_MARKDOWN_NOTES) or ""
        return {
            "title": title,
            "summary": summary,
            "key_points": key_points,
            "markdown_notes": notes,
            "metadata": metadata,
        }

    def _chunk_words(self, words: list[str], chunk_size: int) -> list[list[str]]:
        """Slice words list into chunks of designated size."""
        return [words[i : i + chunk_size] for i in range(0, len(words), chunk_size)]

    def _combine_chunk_results(
        self, results: list[dict[str, Any]], video_title: str
    ) -> dict[str, Any]:
        """Merge multiple chunk results into a cohesive single note document."""
        combined_summaries = " ".join(r["summary"] for r in results if r.get("summary"))
        all_key_points: list[str] = []
        for r in results:
            all_key_points.extend(r.get("key_points", []))
        sections = [f"## Part {i + 1}\n\n{r['markdown_notes']}" for i, r in enumerate(results)]
        full_markdown = "\n\n".join(sections)
        total_in = sum(r.get("metadata", {}).get("input_tokens", 0) for r in results)
        total_out = sum(r.get("metadata", {}).get("output_tokens", 0) for r in results)

        return {
            "title": video_title,
            "summary": combined_summaries,
            "key_points": all_key_points,
            "markdown_notes": full_markdown,
            "metadata": {
                "model": self._model_name,
                "input_tokens": total_in,
                "output_tokens": total_out,
            },
        }
