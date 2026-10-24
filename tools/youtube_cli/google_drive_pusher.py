"""Uploads processed YouTube notebooks and notes directly to Google Drive."""

from __future__ import annotations

import datetime
import json
import os
import uuid
from typing import Any, ClassVar

import requests


class GoogleDrivePusher:
    """Pushes YouTube study notes and notebooks to a dedicated Google Drive folder."""

    _DEFAULT_FOLDER_NAME: ClassVar[str] = "SynapseSync"
    _SUBFOLDER_NOTEBOOKS: ClassVar[str] = "notebooks"
    _SUBFOLDER_NOTES: ClassVar[str] = "notes"
    _SUBFOLDER_QUIZZES: ClassVar[str] = "quizzes"
    _ENV_ACCESS_TOKEN: ClassVar[str] = "GOOGLE_DRIVE_ACCESS_TOKEN"
    _ENV_FOLDER_NAME: ClassVar[str] = "GOOGLE_DRIVE_FOLDER_NAME"

    _FILES_URL: ClassVar[str] = "https://www.googleapis.com/drive/v3/files"
    _UPLOAD_URL: ClassVar[str] = "https://www.googleapis.com/upload/drive/v3/files"
    _FOLDER_MIME: ClassVar[str] = "application/vnd.google-apps.folder"
    _JSON_MIME: ClassVar[str] = "application/json"
    _AUTH_HEADER: ClassVar[str] = "Authorization"
    _BEARER_PREFIX: ClassVar[str] = "Bearer "

    _PREFIX_NOTE: ClassVar[str] = "note_"
    _PREFIX_NOTEBOOK: ClassVar[str] = "notebook_"
    _PREFIX_QUIZ: ClassVar[str] = "quiz_"
    _EXT_JSON: ClassVar[str] = ".json"
    _FORMAT_MARKDOWN: ClassVar[str] = "markdown"
    _SOURCE_TYPE: ClassVar[str] = "youtube_transcript"
    _SOURCE_PLAYLIST: ClassVar[str] = "youtube_playlist"

    _HTTP_UNAUTHORIZED: ClassVar[int] = 401
    _HTTP_NOT_FOUND: ClassVar[int] = 404
    _TIMEOUT_SECONDS: ClassVar[int] = 30

    def __init__(
        self,
        access_token: str | None = None,
        drive_folder: str | None = None,
        session: requests.Session | None = None,
    ) -> None:
        """Initialize GoogleDrivePusher with OAuth token, target folder, and session."""
        self._access_token = access_token or os.getenv(self._ENV_ACCESS_TOKEN) or ""
        self._root_folder_name = (
            drive_folder or os.getenv(self._ENV_FOLDER_NAME) or self._DEFAULT_FOLDER_NAME
        )
        self._session = session if session is not None else requests.Session()

    def push(self, notebook: dict[str, Any], notes: list[dict[str, Any]]) -> dict[str, Any]:
        """Upload notebook and notes directly into dedicated Google Drive subfolders."""
        self._ensure_valid_inputs(notebook, notes)
        if not self._access_token:
            msg = "Google Drive access token missing. Set GOOGLE_DRIVE_ACCESS_TOKEN."
            raise PermissionError(msg)

        root_id = self._get_or_create_folder(self._root_folder_name)
        nb_folder_id = self._get_or_create_folder(self._SUBFOLDER_NOTEBOOKS, root_id)
        notes_folder_id = self._get_or_create_folder(self._SUBFOLDER_NOTES, root_id)

        nb_id = self._prepare_notebook(notebook)
        nb_filename = f"{self._PREFIX_NOTEBOOK}{nb_id}{self._EXT_JSON}"
        self._upload_json_file(nb_filename, notebook, nb_folder_id)

        note_ids = self._prepare_and_upload_notes(notes, nb_id, notes_folder_id)
        return {"notebookId": nb_id, "noteIds": note_ids, "notesStored": len(note_ids)}

    def push_quiz(self, quiz_payload: dict[str, Any]) -> str:
        """Upload quiz and cards payload directly into SynapseSync/quizzes folder."""
        if not quiz_payload:
            raise ValueError("Quiz payload dictionary is required for push")
        if not self._access_token:
            msg = "Google Drive access token missing. Set GOOGLE_DRIVE_ACCESS_TOKEN."
            raise PermissionError(msg)

        quiz_id = str(quiz_payload.get("quiz", {}).get("id") or uuid.uuid4())
        root_id = self._get_or_create_folder(self._root_folder_name)
        quiz_folder_id = self._get_or_create_folder(self._SUBFOLDER_QUIZZES, root_id)
        filename = f"{self._PREFIX_QUIZ}{quiz_id}{self._EXT_JSON}"
        self._upload_json_file(filename, quiz_payload, quiz_folder_id)
        return quiz_id


    def _ensure_valid_inputs(
        self, notebook: dict[str, Any], notes: list[dict[str, Any]]
    ) -> None:
        """Validate input dictionaries before initiating upload."""
        if not notebook:
            raise ValueError("Notebook dictionary is required for push")
        if not notes:
            raise ValueError("Notes list cannot be empty for push")

    def _prepare_notebook(self, notebook: dict[str, Any]) -> str:
        """Ensure notebook record has identifier, timestamps, and sync metadata."""
        nb_id = str(notebook.get("id") or f"nb_{uuid.uuid4()}")
        notebook["id"] = nb_id
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        notebook.setdefault("createdAt", now_iso)
        notebook["updatedAt"] = now_iso
        notebook["isSynced"] = True
        notebook.setdefault("source", self._SOURCE_PLAYLIST)
        notebook.setdefault("tags", ["youtube"])
        return nb_id

    def _prepare_and_upload_notes(
        self, notes: list[dict[str, Any]], notebook_id: str, notes_folder_id: str
    ) -> list[str]:
        """Process each note, assign schema properties, and upload to Google Drive."""
        note_ids: list[str] = []
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        for note in notes:
            note_id = str(note.get("id") or f"note_{uuid.uuid4()}")
            note["id"] = note_id
            note["notebookId"] = notebook_id
            note.setdefault("createdAt", now_iso)
            note["updatedAt"] = now_iso
            note["isSynced"] = True
            note.setdefault("contentFormat", self._FORMAT_MARKDOWN)
            note.setdefault("sourceType", self._SOURCE_TYPE)
            note.setdefault("wordCount", len(note.get("content", "").split()))

            filename = f"{self._PREFIX_NOTE}{note_id}{self._EXT_JSON}"
            self._upload_json_file(filename, note, notes_folder_id)
            note_ids.append(note_id)

        return note_ids

    def _get_or_create_folder(self, folder_name: str, parent_id: str | None = None) -> str:
        """Retrieve existing folder identifier or create a new folder under parent."""
        existing_id = self._find_folder(folder_name, parent_id)
        if existing_id:
            return existing_id
        return self._create_folder(folder_name, parent_id)

    def _find_folder(self, folder_name: str, parent_id: str | None = None) -> str | None:
        """Search Google Drive for an untrashed folder with matching name and parent."""
        query = (
            f"name = '{folder_name}' and mimeType = '{self._FOLDER_MIME}' and trashed = false"
        )
        if parent_id:
            query += f" and '{parent_id}' in parents"

        headers = self._build_auth_headers()
        params = {"q": query, "fields": "files(id, name)", "spaces": "drive"}
        response = self._session.get(
            self._FILES_URL, headers=headers, params=params, timeout=self._TIMEOUT_SECONDS
        )
        self._check_response_status(response)
        files = response.json().get("files", [])
        return str(files[0]["id"]) if files else None

    def _create_folder(self, folder_name: str, parent_id: str | None = None) -> str:
        """Create a new folder in Google Drive and return its resource identifier."""
        metadata: dict[str, Any] = {
            "name": folder_name,
            "mimeType": self._FOLDER_MIME,
        }
        if parent_id:
            metadata["parents"] = [parent_id]

        headers = self._build_auth_headers()
        response = self._session.post(
            self._FILES_URL, headers=headers, json=metadata, timeout=self._TIMEOUT_SECONDS
        )
        self._check_response_status(response)
        created_id: str = response.json()["id"]
        return created_id

    def _upload_json_file(
        self, file_name: str, payload: dict[str, Any], folder_id: str
    ) -> str:
        """Upload or overwrite a JSON file within the specified Google Drive folder."""
        content_str = json.dumps(payload, indent=2)
        existing_id = self._find_file(file_name, folder_id)
        if existing_id:
            self._patch_file_content(existing_id, content_str, self._JSON_MIME)
            return existing_id

        file_id = self._create_file_metadata(file_name, self._JSON_MIME, folder_id)
        self._patch_file_content(file_id, content_str, self._JSON_MIME)
        return file_id

    def _find_file(self, file_name: str, folder_id: str) -> str | None:
        """Find an existing file by name within the parent folder."""
        query = f"name = '{file_name}' and '{folder_id}' in parents and trashed = false"
        headers = self._build_auth_headers()
        params = {"q": query, "fields": "files(id, name)", "spaces": "drive"}
        response = self._session.get(
            self._FILES_URL, headers=headers, params=params, timeout=self._TIMEOUT_SECONDS
        )
        self._check_response_status(response)
        files = response.json().get("files", [])
        return str(files[0]["id"]) if files else None

    def _create_file_metadata(self, file_name: str, mime_type: str, folder_id: str) -> str:
        """Create file metadata entry in Google Drive and return new file ID."""
        metadata = {"name": file_name, "mimeType": mime_type, "parents": [folder_id]}
        headers = self._build_auth_headers()
        response = self._session.post(
            self._FILES_URL, headers=headers, json=metadata, timeout=self._TIMEOUT_SECONDS
        )
        self._check_response_status(response)
        new_id: str = response.json()["id"]
        return new_id

    def _patch_file_content(self, file_id: str, content: str, mime_type: str) -> None:
        """Stream UTF-8 encoded text into the Google Drive file content resource."""
        upload_url = f"{self._UPLOAD_URL}/{file_id}?uploadType=media"
        headers = self._build_auth_headers()
        headers["Content-Type"] = mime_type
        response = self._session.patch(
            upload_url,
            headers=headers,
            data=content.encode("utf-8"),
            timeout=self._TIMEOUT_SECONDS,
        )
        self._check_response_status(response)

    def _build_auth_headers(self) -> dict[str, str]:
        """Construct standard HTTP headers containing Bearer token authentication."""
        return {self._AUTH_HEADER: f"{self._BEARER_PREFIX}{self._access_token}"}

    def _check_response_status(self, response: requests.Response) -> None:
        """Raise appropriate exceptions on unauthorized or failed HTTP requests."""
        if response.status_code == self._HTTP_UNAUTHORIZED:
            raise PermissionError("Google Drive authentication failed (401 Unauthorized)")
        response.raise_for_status()
