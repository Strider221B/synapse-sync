"""Unit tests for the NoteGenerator class."""

from __future__ import annotations

import json
from typing import Any, ClassVar
from unittest.mock import MagicMock

import pytest

from tools.youtube_cli.note_generator import NoteGenerator


class TestNoteGenerator:
    """Test suite validating comprehensive note generation, chunking, and JSON decoding."""

    _SAMPLE_TRANSCRIPT: ClassVar[str] = "Linear regression models the relationship between X and Y."
    _SAMPLE_TITLE: ClassVar[str] = "Lecture 1: Linear Regression"
    _SAMPLE_RESPONSE: ClassVar[dict[str, Any]] = {
        "title": "Lecture 1: Linear Regression Notes",
        "summary": "Covers linear regression formulation and cost functions.",
        "keyPoints": ["Hypothesis h(x)", "Cost function J(theta)", "Gradient descent algorithm"],
        "markdownNotes": "# Linear Regression\n\n## 1. Hypothesis\nh(x) = theta * x",
    }

    def test_generate_single_chunk_successful(self) -> None:
        """Verify generate produces structured note dictionary for normal transcripts."""
        mock_service = MagicMock()
        mock_response = MagicMock()
        mock_response.text = json.dumps(self._SAMPLE_RESPONSE)
        usage = MagicMock()
        usage.prompt_token_count = 150
        usage.candidates_token_count = 200
        mock_response.usage_metadata = usage
        mock_service.call_with_retry.return_value = mock_response

        generator = NoteGenerator(gemini_service=mock_service)
        result = generator.generate(self._SAMPLE_TRANSCRIPT, self._SAMPLE_TITLE)

        assert result["title"] == "Lecture 1: Linear Regression Notes"
        assert len(result["key_points"]) == 3
        assert "# Linear Regression" in result["markdown_notes"]
        assert result["metadata"]["input_tokens"] == 150
        assert result["metadata"]["output_tokens"] == 200

    def test_generate_raises_value_error_on_empty_transcript(self) -> None:
        """Verify generate rejects empty or whitespace-only transcripts."""
        generator = NoteGenerator(gemini_service=MagicMock())
        with pytest.raises(ValueError, match="Transcript text cannot be empty"):
            generator.generate("   ", self._SAMPLE_TITLE)

    def test_generate_chunks_long_transcripts(self) -> None:
        """Verify generate splits transcripts over max chunk limit and combines results."""
        long_transcript = "word " * 8000
        mock_service = MagicMock()
        mock_response = MagicMock()
        mock_response.text = json.dumps(self._SAMPLE_RESPONSE)
        mock_response.usage_metadata = None
        mock_service.call_with_retry.return_value = mock_response

        generator = NoteGenerator(gemini_service=mock_service)
        result = generator.generate(long_transcript, self._SAMPLE_TITLE)

        assert result["title"] == self._SAMPLE_TITLE
        assert "## Part 1" in result["markdown_notes"]
        assert "## Part 2" in result["markdown_notes"]
        assert mock_service.call_with_retry.call_count == 2

    def test_generate_raises_value_error_on_invalid_json_output(self) -> None:
        """Verify generate raises ValueError when model response is not valid JSON."""
        mock_service = MagicMock()
        mock_response = MagicMock(text="plain non-json text response")
        mock_service.call_with_retry.return_value = mock_response

        generator = NoteGenerator(gemini_service=mock_service)
        with pytest.raises(ValueError, match="Failed to parse Gemini JSON output"):
            generator.generate(self._SAMPLE_TRANSCRIPT, self._SAMPLE_TITLE)
