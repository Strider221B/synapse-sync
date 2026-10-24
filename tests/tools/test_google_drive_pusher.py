"""Unit tests for the GoogleDrivePusher class."""

from __future__ import annotations

from typing import Any, ClassVar
from unittest.mock import MagicMock, patch

import pytest
import requests

from tools.youtube_cli.google_drive_pusher import GoogleDrivePusher


class TestGoogleDrivePusher:
    """Test suite validating Google Drive folder traversal, file creation, and note uploading."""

    _NOTEBOOK: ClassVar[dict[str, Any]] = {
        "id": "nb_100",
        "name": "Machine Learning Series",
        "source": "youtube_playlist",
    }
    _NOTES: ClassVar[list[dict[str, Any]]] = [
        {"id": "note_101", "title": "Lecture 1", "content": "Detailed lecture 1 notes"}
    ]
    _VALID_TOKEN: ClassVar[str] = "ya29.sample_oauth_token"
    _CUSTOM_FOLDER: ClassVar[str] = "MyDedicatedNotesFolder"

    def _create_mock_session(self) -> MagicMock:
        """Create a mock requests session with default successful status responses."""
        mock_session = MagicMock(spec=requests.Session)
        get_response = MagicMock(spec=requests.Response)
        get_response.status_code = 200
        get_response.json.return_value = {"files": []}

        post_response = MagicMock(spec=requests.Response)
        post_response.status_code = 200
        post_response.json.return_value = {"id": "mock_created_resource_id"}

        patch_response = MagicMock(spec=requests.Response)
        patch_response.status_code = 200
        patch_response.json.return_value = {"id": "mock_created_resource_id"}

        mock_session.get.return_value = get_response
        mock_session.post.return_value = post_response
        mock_session.patch.return_value = patch_response
        return mock_session

    def test_push_success_creates_folders_and_uploads_files(self) -> None:
        """Verify push resolves folders, uploads notebook and note files, and returns summary."""
        mock_session = self._create_mock_session()
        pusher = GoogleDrivePusher(
            access_token=self._VALID_TOKEN,
            drive_folder=self._CUSTOM_FOLDER,
            session=mock_session,
        )

        result = pusher.push(dict(self._NOTEBOOK), [dict(n) for n in self._NOTES])

        assert result["notebookId"] == "nb_100"
        assert result["noteIds"] == ["note_101"]
        assert result["notesStored"] == 1
        assert mock_session.get.call_count >= 3
        assert mock_session.post.call_count >= 3

    def test_push_updates_existing_files_when_found(self) -> None:
        """Verify push patches existing files instead of creating new records."""
        mock_session = MagicMock(spec=requests.Session)
        get_response = MagicMock(spec=requests.Response)
        get_response.status_code = 200
        get_response.json.return_value = {"files": [{"id": "existing_id", "name": "found"}]}
        patch_response = MagicMock(spec=requests.Response)
        patch_response.status_code = 200

        mock_session.get.return_value = get_response
        mock_session.patch.return_value = patch_response

        pusher = GoogleDrivePusher(access_token=self._VALID_TOKEN, session=mock_session)
        result = pusher.push(dict(self._NOTEBOOK), [dict(n) for n in self._NOTES])

        assert result["notebookId"] == "nb_100"
        assert mock_session.post.call_count == 0
        assert mock_session.patch.call_count == 2

    def test_push_raises_value_error_on_empty_notebook(self) -> None:
        """Verify push raises ValueError when notebook payload is empty."""
        pusher = GoogleDrivePusher(access_token=self._VALID_TOKEN)
        with pytest.raises(ValueError, match="Notebook dictionary is required"):
            pusher.push({}, [dict(n) for n in self._NOTES])

    def test_push_raises_value_error_on_empty_notes(self) -> None:
        """Verify push raises ValueError when notes list is empty."""
        pusher = GoogleDrivePusher(access_token=self._VALID_TOKEN)
        with pytest.raises(ValueError, match="Notes list cannot be empty"):
            pusher.push(dict(self._NOTEBOOK), [])

    def test_push_raises_permission_error_when_token_missing(self) -> None:
        """Verify push raises PermissionError when no OAuth token is configured."""
        with patch.dict("os.environ", {}, clear=True):
            pusher = GoogleDrivePusher(access_token=None)
            with pytest.raises(PermissionError, match="access token missing"):
                pusher.push(dict(self._NOTEBOOK), [dict(n) for n in self._NOTES])

    def test_push_raises_permission_error_on_http_401(self) -> None:
        """Verify push converts HTTP 401 response into PermissionError."""
        mock_session = MagicMock(spec=requests.Session)
        unauth_response = MagicMock(spec=requests.Response)
        unauth_response.status_code = 401
        mock_session.get.return_value = unauth_response

        pusher = GoogleDrivePusher(access_token="expired_token", session=mock_session)
        with pytest.raises(PermissionError, match="401 Unauthorized"):
            pusher.push(dict(self._NOTEBOOK), [dict(n) for n in self._NOTES])

    def test_push_quiz_success_creates_file_in_quizzes_folder(self) -> None:
        """Verify push_quiz creates file in quizzes folder and returns quiz identifier."""
        mock_session = self._create_mock_session()
        pusher = GoogleDrivePusher(access_token=self._VALID_TOKEN, session=mock_session)
        quiz_payload = {
            "quiz": {"id": "quiz_test_123", "noteId": "note_101", "version": 1},
            "mcqCards": [{"question": "Q1", "options": ["A", "B", "C", "D"], "correctIndex": 0}],
            "flashcards": [{"front": "Front", "back": "Back"}],
        }

        quiz_id = pusher.push_quiz(quiz_payload)

        assert quiz_id == "quiz_test_123"
        assert mock_session.post.call_count > 0

    def test_push_quiz_raises_value_error_on_empty_payload(self) -> None:
        """Verify push_quiz raises ValueError when payload dictionary is empty."""
        pusher = GoogleDrivePusher(access_token=self._VALID_TOKEN)
        with pytest.raises(ValueError, match="Quiz payload dictionary is required"):
            pusher.push_quiz({})

    def test_push_quiz_raises_permission_error_when_token_missing(self) -> None:
        """Verify push_quiz raises PermissionError when no OAuth token is configured."""
        with patch.dict("os.environ", {}, clear=True):
            pusher = GoogleDrivePusher(access_token=None)
            with pytest.raises(PermissionError, match="access token missing"):
                pusher.push_quiz({"quiz": {"id": "quiz_test"}})

