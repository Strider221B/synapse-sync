"""Unit tests for the ServerPusher class."""

from __future__ import annotations

from typing import Any, ClassVar
from unittest.mock import MagicMock, patch

import pytest
import requests

from tools.youtube_cli.server_pusher import ServerPusher


class TestServerPusher:
    """Test suite validating server push execution, retries, and error handling."""

    _NOTEBOOK: ClassVar[dict[str, Any]] = {"name": "Test Notebook", "source": "youtube_playlist"}
    _NOTES: ClassVar[list[dict[str, Any]]] = [{"title": "Test Note", "content": "Content"}]

    def test_push_success_returns_server_payload(self) -> None:
        """Verify push sends payload to /api/youtube-notes and returns response dictionary."""
        mock_session = MagicMock(spec=requests.Session)
        mock_response = MagicMock(spec=requests.Response)
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "notebookId": "nb_123",
            "noteIds": ["note_1"],
            "notesStored": 1,
        }
        mock_session.post.return_value = mock_response

        pusher = ServerPusher(
            server_url="http://localhost:3000",
            api_key="secret-key",
            session=mock_session,
        )
        result = pusher.push(self._NOTEBOOK, self._NOTES)

        assert result["notebookId"] == "nb_123"
        assert result["notesStored"] == 1
        mock_session.post.assert_called_once()
        args, kwargs = mock_session.post.call_args
        assert args[0] == "http://localhost:3000/api/youtube-notes"
        assert kwargs["headers"]["Authorization"] == "Bearer secret-key"

    def test_push_raises_value_error_on_empty_notebook_or_notes(self) -> None:
        """Verify push rejects empty notebook or empty notes list."""
        pusher = ServerPusher(server_url="http://localhost:3000")
        with pytest.raises(ValueError, match="Notebook dictionary is required"):
            pusher.push({}, self._NOTES)
        with pytest.raises(ValueError, match="Notes list cannot be empty"):
            pusher.push(self._NOTEBOOK, [])

    def test_push_raises_permission_error_on_401(self) -> None:
        """Verify push raises PermissionError when server responds with 401 Unauthorized."""
        mock_session = MagicMock()
        mock_response = MagicMock(status_code=401, text="Unauthorized")
        mock_session.post.return_value = mock_response

        pusher = ServerPusher(session=mock_session)
        with pytest.raises(PermissionError, match="Authentication failed"):
            pusher.push(self._NOTEBOOK, self._NOTES)

    def test_push_raises_value_error_on_400(self) -> None:
        """Verify push raises ValueError when server rejects payload with 400 Bad Request."""
        mock_session = MagicMock()
        mock_response = MagicMock(status_code=400, text="MISSING_NOTES")
        mock_session.post.return_value = mock_response

        pusher = ServerPusher(session=mock_session)
        with pytest.raises(ValueError, match="Server rejected payload"):
            pusher.push(self._NOTEBOOK, self._NOTES)

    def test_push_retries_on_connection_error_and_succeeds(self) -> None:
        """Verify push retries transient connection failures before succeeding."""
        mock_session = MagicMock()
        mock_response = MagicMock(status_code=200)
        mock_response.json.return_value = {"notesStored": 1}
        mock_session.post.side_effect = [
            requests.ConnectionError("Connection refused"),
            mock_response,
        ]

        pusher = ServerPusher(session=mock_session)
        with patch("time.sleep"):
            result = pusher.push(self._NOTEBOOK, self._NOTES)

        assert result["notesStored"] == 1
        assert mock_session.post.call_count == 2
