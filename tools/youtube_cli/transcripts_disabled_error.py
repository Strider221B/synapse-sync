"""Custom exception raised when transcripts are disabled or unavailable for a video."""

from __future__ import annotations


class TranscriptsDisabledError(Exception):
    """Exception raised when captions or transcripts are disabled for a YouTube video."""

    def __init__(self, message: str = "Transcripts are disabled for this video.") -> None:
        """Initialize the TranscriptsDisabledError instance."""
        super().__init__(message)
