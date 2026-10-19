"""Unit tests for the YoutubeNotes serverless endpoint handler."""

from __future__ import annotations

import io
import json
from email.message import Message
from pathlib import Path
from typing import Any, ClassVar
from unittest.mock import patch

from api.youtube_notes import YoutubeNotes


class TestYoutubeNotes:
    """Test suite validating ingestion, validation, and retrieval in YoutubeNotes handler."""

    _ENCODING: ClassVar[str] = "utf-8"
    _HTTP_OK: ClassVar[int] = 200
    _HTTP_BAD_REQUEST: ClassVar[int] = 400
    _HTTP_UNAUTHORIZED: ClassVar[int] = 401
    _HTTP_INTERNAL_ERROR: ClassVar[int] = 500

    _SAMPLE_NOTEBOOK: ClassVar[dict[str, Any]] = {
        "name": "Stanford CS229",
        "source": "youtube_playlist",
        "sourceUrl": "https://youtube.com/playlist?list=123",
        "description": "ML lecture series",
        "tags": ["ml"],
    }
    _SAMPLE_NOTE: ClassVar[dict[str, Any]] = {
        "title": "Lecture 1",
        "content": "# Lecture 1 Notes",
        "contentFormat": "markdown",
        "sourceType": "youtube_transcript",
        "sourceUrl": "https://youtube.com/watch?v=123",
        "videoId": "12345678901",
        "wordCount": 100,
    }

    def _create_handler(
        self,
        body_data: dict[str, Any] | None = None,
        auth_header: str | None = None,
        path: str = "/api/youtube-notes",
    ) -> YoutubeNotes:
        """Create a mock YoutubeNotes handler with configured rfile, wfile, and headers."""
        instance = YoutubeNotes.__new__(YoutubeNotes)
        instance.path = path
        instance.wfile = io.BytesIO()

        body_bytes = json.dumps(body_data).encode(self._ENCODING) if body_data is not None else b""
        instance.rfile = io.BytesIO(body_bytes)

        headers = Message()
        headers["Content-Length"] = str(len(body_bytes))
        headers["Content-Type"] = "application/json"
        if auth_header:
            headers["Authorization"] = auth_header
        instance.headers = headers
        return instance

    def _get_response_json(self, handler: YoutubeNotes) -> dict[str, Any]:
        """Read and decode JSON data written to handler wfile."""
        assert isinstance(handler.wfile, io.BytesIO)
        result: dict[str, Any] = json.loads(handler.wfile.getvalue().decode(self._ENCODING))
        return result

    def test_do_post_successful_stores_notebook_and_notes(self, tmp_path: Path) -> None:
        """Verify do_POST assigns IDs, saves to store, and returns HTTP 200."""
        store_file = tmp_path / "notes_store.json"
        payload = {"notebook": self._SAMPLE_NOTEBOOK, "notes": [self._SAMPLE_NOTE]}
        handler = self._create_handler(payload)

        with (
            patch.dict("os.environ", {"YOUTUBE_NOTES_STORE_PATH": str(store_file)}, clear=True),
            patch.object(handler, "send_response") as mock_resp,
            patch.object(handler, "send_header"),
            patch.object(handler, "end_headers"),
        ):
            handler.do_POST()
            mock_resp.assert_called_once_with(self._HTTP_OK)

        resp_data = self._get_response_json(handler)
        assert "notebookId" in resp_data
        assert resp_data["notesStored"] == 1
        assert store_file.is_file()

    def test_do_post_returns_401_on_missing_or_invalid_auth(self) -> None:
        """Verify do_POST rejects request when API key is set and token is invalid."""
        payload = {"notebook": self._SAMPLE_NOTEBOOK, "notes": [self._SAMPLE_NOTE]}
        handler = self._create_handler(payload, auth_header="Bearer wrong-key")

        with (
            patch.dict("os.environ", {"YOUTUBE_NOTES_API_KEY": "valid-secret"}, clear=True),
            patch.object(handler, "send_response") as mock_resp,
            patch.object(handler, "send_header"),
            patch.object(handler, "end_headers"),
        ):
            handler.do_POST()
            mock_resp.assert_called_once_with(self._HTTP_UNAUTHORIZED)

        resp_data = self._get_response_json(handler)
        assert resp_data["error"]["code"] == "UNAUTHORIZED"

    def test_do_post_returns_400_on_missing_notebook(self) -> None:
        """Verify do_POST returns 400 when notebook field is missing or empty."""
        payload = {"notes": [self._SAMPLE_NOTE]}
        handler = self._create_handler(payload)

        with (
            patch.dict("os.environ", {}, clear=True),
            patch.object(handler, "send_response") as mock_resp,
            patch.object(handler, "send_header"),
            patch.object(handler, "end_headers"),
        ):
            handler.do_POST()
            mock_resp.assert_called_once_with(self._HTTP_BAD_REQUEST)

        resp_data = self._get_response_json(handler)
        assert resp_data["error"]["code"] == "MISSING_NOTEBOOK"

    def test_do_post_returns_400_on_missing_notes(self) -> None:
        """Verify do_POST returns 400 when notes field is empty or missing."""
        payload = {"notebook": self._SAMPLE_NOTEBOOK, "notes": []}
        handler = self._create_handler(payload)

        with (
            patch.dict("os.environ", {}, clear=True),
            patch.object(handler, "send_response") as mock_resp,
            patch.object(handler, "send_header"),
            patch.object(handler, "end_headers"),
        ):
            handler.do_POST()
            mock_resp.assert_called_once_with(self._HTTP_BAD_REQUEST)

        resp_data = self._get_response_json(handler)
        assert resp_data["error"]["code"] == "MISSING_NOTES"

    def test_do_post_returns_400_on_invalid_note_data(self) -> None:
        """Verify do_POST returns 400 when note is missing required keys."""
        invalid_note = {"title": "Title Only"}
        payload = {"notebook": self._SAMPLE_NOTEBOOK, "notes": [invalid_note]}
        handler = self._create_handler(payload)

        with (
            patch.dict("os.environ", {}, clear=True),
            patch.object(handler, "send_response") as mock_resp,
            patch.object(handler, "send_header"),
            patch.object(handler, "end_headers"),
        ):
            handler.do_POST()
            mock_resp.assert_called_once_with(self._HTTP_BAD_REQUEST)

        resp_data = self._get_response_json(handler)
        assert resp_data["error"]["code"] == "INVALID_NOTE"

    def test_do_get_returns_stored_data(self, tmp_path: Path) -> None:
        """Verify do_GET returns saved notebooks and notes."""
        store_file = tmp_path / "notes_store.json"
        saved = {
            "notebooks": [{"id": "nb_1", "name": "NB1"}],
            "notes": [{"id": "n_1", "notebookId": "nb_1", "title": "Note 1"}],
        }
        store_file.write_text(json.dumps(saved), encoding=self._ENCODING)

        handler = self._create_handler(path="/api/youtube-notes?notebookId=nb_1")

        with (
            patch.dict("os.environ", {"YOUTUBE_NOTES_STORE_PATH": str(store_file)}, clear=True),
            patch.object(handler, "send_response") as mock_resp,
            patch.object(handler, "send_header"),
            patch.object(handler, "end_headers"),
        ):
            handler.do_GET()
            mock_resp.assert_called_once_with(self._HTTP_OK)

        resp_data = self._get_response_json(handler)
        assert len(resp_data["notebooks"]) == 1
        assert len(resp_data["notes"]) == 1
