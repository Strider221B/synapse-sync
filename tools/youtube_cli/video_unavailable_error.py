"""Custom exception raised when a YouTube video is unavailable, deleted, or private."""

from __future__ import annotations


class VideoUnavailableError(Exception):
    """Exception raised when a requested YouTube video cannot be accessed."""

    def __init__(self, message: str = "The requested YouTube video is unavailable.") -> None:
        """Initialize the VideoUnavailableError instance."""
        super().__init__(message)
