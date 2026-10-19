"""Serverless HTTP endpoint handler for ingesting and retrieving YouTube notes."""

from __future__ import annotations

import json
import os
import urllib.parse
import uuid
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from typing import Any, ClassVar


class YoutubeNotes(BaseHTTPRequestHandler):
    """HTTP request handler for receiving local CLI notes and synchronizing with PWA."""

    _HEADER_CONTENT_TYPE: ClassVar[str] = "Content-Type"
    _HEADER_CONTENT_LENGTH: ClassVar[str] = "Content-Length"
    _HEADER_AUTH: ClassVar[str] = "Authorization"
    _MIME_JSON: ClassVar[str] = "application/json"
    _ENCODING: ClassVar[str] = "utf-8"
    _BEARER_PREFIX: ClassVar[str] = "Bearer "
    _ENV_API_KEY: ClassVar[str] = "YOUTUBE_NOTES_API_KEY"
    _ENV_STORE_PATH: ClassVar[str] = "YOUTUBE_NOTES_STORE_PATH"
    _DEFAULT_STORE_PATH: ClassVar[str] = "/tmp/synapse_youtube_notes.json"

    _HTTP_OK: ClassVar[int] = 200
    _HTTP_BAD_REQUEST: ClassVar[int] = 400
    _HTTP_UNAUTHORIZED: ClassVar[int] = 401
    _HTTP_INTERNAL_ERROR: ClassVar[int] = 500

    _ERR_UNAUTHORIZED: ClassVar[str] = "UNAUTHORIZED"
    _ERR_MISSING_NOTEBOOK: ClassVar[str] = "MISSING_NOTEBOOK"
    _ERR_MISSING_NOTES: ClassVar[str] = "MISSING_NOTES"
    _ERR_INVALID_NOTE: ClassVar[str] = "INVALID_NOTE"
    _ERR_STORAGE_FAILED: ClassVar[str] = "STORAGE_FAILED"

    def do_POST(self) -> None:
        """Handle POST requests to store notebooks and notes pushed from the local CLI."""
        if not self._is_authorized():
            self._send_error(
                self._HTTP_UNAUTHORIZED, self._ERR_UNAUTHORIZED, "Invalid or missing API key"
            )
            return

        body_dict = self._read_json_body()
        if body_dict is None:
            self._send_error(
                self._HTTP_BAD_REQUEST, self._ERR_MISSING_NOTEBOOK, "Malformed or empty JSON body"
            )
            return

        notebook = body_dict.get("notebook")
        if not isinstance(notebook, dict) or not notebook.get("name"):
            self._send_error(
                self._HTTP_BAD_REQUEST,
                self._ERR_MISSING_NOTEBOOK,
                "Notebook object with name is required",
            )
            return

        notes = body_dict.get("notes")
        if not isinstance(notes, list) or len(notes) == 0:
            self._send_error(
                self._HTTP_BAD_REQUEST, self._ERR_MISSING_NOTES, "Non-empty notes array is required"
            )
            return

        if not self._validate_notes(notes):
            self._send_error(
                self._HTTP_BAD_REQUEST, self._ERR_INVALID_NOTE, "Notes missing required fields"
            )
            return

        self._persist_and_respond(notebook, notes)

    def do_GET(self) -> None:
        """Handle GET requests to retrieve stored YouTube notebooks and notes for PWA sync."""
        query_params = self._parse_query_params()
        notebook_id = query_params.get("notebookId")
        try:
            store_data = self._read_store()
            filtered_data = self._filter_store_by_notebook(store_data, notebook_id)
            self._send_json(self._HTTP_OK, filtered_data)
        except Exception as err:
            self._send_error(self._HTTP_INTERNAL_ERROR, self._ERR_STORAGE_FAILED, str(err))

    def _persist_and_respond(self, notebook: dict[str, Any], notes: list[dict[str, Any]]) -> None:
        """Assign IDs, commit records to persistent store, and send success payload."""
        notebook_id = notebook.get("id") or f"nb_{uuid.uuid4()}"
        notebook["id"] = notebook_id

        note_ids: list[str] = []
        for note in notes:
            note_id = note.get("id") or f"note_{uuid.uuid4()}"
            note["id"] = note_id
            note["notebookId"] = notebook_id
            note_ids.append(note_id)

        try:
            self._save_to_store(notebook, notes)
            response_payload = {
                "notebookId": notebook_id,
                "noteIds": note_ids,
                "notesStored": len(notes),
            }
            self._send_json(self._HTTP_OK, response_payload)
        except OSError as err:
            self._send_error(
                self._HTTP_INTERNAL_ERROR,
                self._ERR_STORAGE_FAILED,
                f"Storage write error: {err}",
            )

    def _is_authorized(self) -> bool:
        """Validate Authorization Bearer header against server API key if configured."""
        expected_key = os.getenv(self._ENV_API_KEY)
        if not expected_key:
            return True
        auth_header = self.headers.get(self._HEADER_AUTH, "")
        if not auth_header.startswith(self._BEARER_PREFIX):
            return False
        token = auth_header[len(self._BEARER_PREFIX) :].strip()
        return token == expected_key

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

    def _validate_notes(self, notes: list[dict[str, Any]]) -> bool:
        """Verify each note contains mandatory title, content, and videoId fields."""
        required = {
            "title",
            "content",
            "contentFormat",
            "sourceType",
            "sourceUrl",
            "videoId",
            "wordCount",
        }
        for note in notes:
            if not isinstance(note, dict) or not required.issubset(note.keys()):
                return False
            if not note["title"] or not note["content"]:
                return False
        return True

    def _parse_query_params(self) -> dict[str, str]:
        """Extract query string parameters from URL path."""
        parsed_url = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed_url.query)
        return {k: v[0] for k, v in qs.items() if v}

    def _get_store_path(self) -> Path:
        """Resolve the JSON storage file location."""
        path_str = os.getenv(self._ENV_STORE_PATH, self._DEFAULT_STORE_PATH)
        return Path(path_str).expanduser().resolve()

    def _read_store(self) -> dict[str, Any]:
        """Load stored notebooks and notes dictionary from disk."""
        store_path = self._get_store_path()
        if not store_path.is_file():
            return {"notebooks": [], "notes": []}
        try:
            raw = store_path.read_text(encoding=self._ENCODING)
            data: dict[str, Any] = json.loads(raw)
            return data
        except (OSError, json.JSONDecodeError):
            return {"notebooks": [], "notes": []}

    def _save_to_store(self, notebook: dict[str, Any], notes: list[dict[str, Any]]) -> None:
        """Upsert notebook and notes into the local JSON file store."""
        store_path = self._get_store_path()
        store_path.parent.mkdir(parents=True, exist_ok=True)
        store_data = self._read_store()

        notebooks: list[dict[str, Any]] = [
            nb for nb in store_data.get("notebooks", []) if nb.get("id") != notebook.get("id")
        ]
        notebooks.append(notebook)

        new_note_ids = {n.get("id") for n in notes}
        existing_notes: list[dict[str, Any]] = [
            n for n in store_data.get("notes", []) if n.get("id") not in new_note_ids
        ]
        existing_notes.extend(notes)

        updated_store = {"notebooks": notebooks, "notes": existing_notes}
        temp_path = store_path.with_suffix(".tmp")
        temp_path.write_text(json.dumps(updated_store, indent=2), encoding=self._ENCODING)
        temp_path.replace(store_path)

    def _filter_store_by_notebook(
        self, store_data: dict[str, Any], notebook_id: str | None
    ) -> dict[str, Any]:
        """Filter notes by notebookId when provided in query parameters."""
        if not notebook_id:
            return store_data
        notebooks = [nb for nb in store_data.get("notebooks", []) if nb.get("id") == notebook_id]
        notes = [n for n in store_data.get("notes", []) if n.get("notebookId") == notebook_id]
        return {"notebooks": notebooks, "notes": notes}

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


handler = YoutubeNotes
