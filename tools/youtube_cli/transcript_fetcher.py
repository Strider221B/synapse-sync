"""Fetches and normalizes YouTube video transcripts using youtube-transcript-api."""

from __future__ import annotations

from typing import Any, ClassVar

from youtube_transcript_api import (
    CouldNotRetrieveTranscript,
    InvalidVideoId,
    NoTranscriptFound,
    TranscriptsDisabled,
    VideoUnavailable,
    YouTubeRequestFailed,
    YouTubeTranscriptApi,
)

from tools.youtube_cli.transcripts_disabled_error import TranscriptsDisabledError
from tools.youtube_cli.url_utils import UrlUtils
from tools.youtube_cli.video_unavailable_error import VideoUnavailableError


class TranscriptFetcher:
    """Retrieves English transcripts from YouTube videos and formats them into text."""

    _DEFAULT_LANG: ClassVar[str] = "en"
    _KEY_TRANSCRIPT: ClassVar[str] = "transcript"
    _KEY_VIDEO_ID: ClassVar[str] = "video_id"
    _KEY_WORD_COUNT: ClassVar[str] = "word_count"
    _KEY_SEGMENT_COUNT: ClassVar[str] = "segment_count"
    _FIELD_TEXT: ClassVar[str] = "text"
    _DELIMITER_SPACE: ClassVar[str] = " "
    _ERR_RETRY_HINT: ClassVar[str] = "Network failure fetching transcript. Please retry later."

    def __init__(
        self,
        api_client: Any = None,
        url_utils: UrlUtils | None = None,
    ) -> None:
        """Initialize TranscriptFetcher with transcript API client and URL utilities."""
        self._api_client: Any = api_client if api_client is not None else YouTubeTranscriptApi()
        self._url_utils = url_utils if url_utils is not None else UrlUtils()

    def fetch(self, url_or_id: str) -> dict[str, Any]:
        """Fetch English transcript for a given video URL or ID and return structured data."""
        video_id = self._url_utils.extract_video_id(url_or_id)
        if not video_id:
            raise ValueError(f"Invalid YouTube video URL or ID: {url_or_id}")

        snippets = self._execute_transcript_call(video_id)
        text_parts = [self._extract_snippet_text(s) for s in snippets]
        full_transcript = self._DELIMITER_SPACE.join(text_parts).strip()
        word_count = len(full_transcript.split()) if full_transcript else 0

        return {
            self._KEY_TRANSCRIPT: full_transcript,
            self._KEY_VIDEO_ID: video_id,
            self._KEY_WORD_COUNT: word_count,
            self._KEY_SEGMENT_COUNT: len(snippets),
        }

    def _execute_transcript_call(self, video_id: str) -> list[Any]:
        """Invoke transcript retrieval through the API client with error mapping."""
        client: Any = self._api_client
        try:
            if hasattr(client, "fetch"):
                result = client.fetch(video_id, languages=[self._DEFAULT_LANG])
            elif hasattr(client, "get_transcript"):
                result = client.get_transcript(video_id, languages=[self._DEFAULT_LANG])
            elif callable(client):
                result = client(video_id, languages=[self._DEFAULT_LANG])
            else:
                result = []
            return list(result)
        except (TranscriptsDisabled, NoTranscriptFound) as err:
            msg = f"No transcripts available for {video_id}: {err}"
            raise TranscriptsDisabledError(msg) from err
        except (VideoUnavailable, InvalidVideoId) as err:
            msg = f"Video {video_id} is unavailable: {err}"
            raise VideoUnavailableError(msg) from err
        except (YouTubeRequestFailed, CouldNotRetrieveTranscript, ConnectionError) as err:
            raise ConnectionError(f"{self._ERR_RETRY_HINT} ({err})") from err

    def _extract_snippet_text(self, snippet: Any) -> str:
        """Extract text string from a snippet whether represented as object or dictionary."""
        if isinstance(snippet, dict):
            raw_text = snippet.get(self._FIELD_TEXT, "")
        else:
            raw_text = getattr(snippet, self._FIELD_TEXT, "")
        return str(raw_text).strip()
