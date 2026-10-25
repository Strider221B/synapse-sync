"""Manages incremental local state, JSON persistence, and markdown export for playlists."""

from __future__ import annotations

import datetime
import json
from pathlib import Path
from typing import Any, ClassVar


class PlaylistStateManager:
    """Handles incremental persistence of playlist notes, markdown files, and sync state."""

    _DEFAULT_NOTES_DIR: ClassVar[str] = "~/.synapse-sync/processed_notes"
    _FILE_NOTEBOOK: ClassVar[str] = "notebook.json"
    _FILE_NOTES: ClassVar[str] = "notes.json"
    _FILE_STATE: ClassVar[str] = "state.json"
    _DIR_NOTES_MD: ClassVar[str] = "notes"
    _STATUS_COMPLETED: ClassVar[str] = "completed"
    _STATUS_FAILED: ClassVar[str] = "failed"
    _STATUS_PENDING: ClassVar[str] = "pending"
    _KEY_VIDEOS: ClassVar[str] = "videos"
    _KEY_STATUS: ClassVar[str] = "status"
    _KEY_VIDEO_ID: ClassVar[str] = "videoId"
    _KEY_TITLE: ClassVar[str] = "title"
    _KEY_URL: ClassVar[str] = "url"
    _KEY_ERROR: ClassVar[str] = "error"
    _KEY_UPDATED_AT: ClassVar[str] = "updatedAt"
    _KEY_NOTE_ID: ClassVar[str] = "noteId"
    _KEY_MARKDOWN_PATH: ClassVar[str] = "markdownPath"
    _KEY_PLAYLIST_TITLE: ClassVar[str] = "playlistTitle"
    _KEY_PLAYLIST_URL: ClassVar[str] = "playlistUrl"
    _KEY_TOTAL_VIDEOS: ClassVar[str] = "totalVideos"
    _KEY_COMPLETED_VIDEOS: ClassVar[str] = "completedVideos"
    _KEY_FAILED_VIDEOS: ClassVar[str] = "failedVideos"
    _KEY_CONTENT: ClassVar[str] = "content"
    _EXT_MD: ClassVar[str] = ".md"
    _ENCODING_UTF8: ClassVar[str] = "utf-8"

    def __init__(self, notes_dir: str | Path | None = None) -> None:
        """Initialize PlaylistStateManager with configured notes root directory."""
        dir_val = notes_dir if notes_dir is not None else self._DEFAULT_NOTES_DIR
        self._root_dir = Path(dir_val).expanduser().resolve()

    def get_playlist_dir(self, playlist_title: str) -> Path:
        """Generate a deterministic filesystem directory path for the playlist."""
        safe_name = self._sanitize_filename(playlist_title)
        target_dir = self._root_dir / safe_name
        target_dir.mkdir(parents=True, exist_ok=True)
        return target_dir

    def build_note_record(
        self, video_id: str, note_data: dict[str, Any], url: str
    ) -> dict[str, Any]:
        """Format processed note dictionary conforming to API schema."""
        content = note_data.get("markdown_notes", "")
        return {
            "id": f"note_{video_id}",
            "title": note_data.get("title", f"Lecture {video_id}"),
            "content": content,
            "contentFormat": "markdown",
            "sourceType": "youtube_transcript",
            "sourceUrl": url,
            "videoId": video_id,
            "wordCount": len(content.split()),
        }

    def build_playlist_notebook(self, title: str, url: str) -> dict[str, Any]:
        """Build notebook metadata dictionary for a playlist."""
        return {
            "name": title,
            "source": "youtube_playlist",
            "sourceUrl": url,
            "description": f"Complete series notes for {title}",
            "tags": ["youtube", "playlist"],
        }

    def build_single_notebook(self, title: str, url: str) -> dict[str, Any]:
        """Build notebook metadata dictionary for a single video."""
        return {
            "name": f"YouTube: {title}",
            "source": "youtube_playlist",
            "sourceUrl": url,
            "description": f"Generated notes for {title}",
            "tags": ["youtube", "lecture"],
        }

    def load_state(self, playlist_dir: Path) -> dict[str, Any]:
        """Read state.json from target playlist directory, or initialize default."""
        state_file = playlist_dir / self._FILE_STATE
        if state_file.is_file():
            try:
                data: dict[str, Any] = json.loads(
                    state_file.read_text(encoding=self._ENCODING_UTF8)
                )
                return data
            except (OSError, json.JSONDecodeError):
                pass
        return self._build_initial_state(playlist_dir.name)

    def load_notes(
        self, playlist_dir: Path
    ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        """Load notebook.json and notes.json from playlist directory."""
        nb_file = playlist_dir / self._FILE_NOTEBOOK
        notes_file = playlist_dir / self._FILE_NOTES
        nb_data: dict[str, Any] = (
            json.loads(nb_file.read_text(encoding=self._ENCODING_UTF8))
            if nb_file.is_file()
            else {}
        )
        notes_data: list[dict[str, Any]] = (
            json.loads(notes_file.read_text(encoding=self._ENCODING_UTF8))
            if notes_file.is_file()
            else []
        )
        return nb_data, notes_data

    def get_completed_ids(self, playlist_dir: Path) -> set[str]:
        """Return set of video IDs that have completed notes stored."""
        completed: set[str] = set()
        state = self.load_state(playlist_dir)
        for vid_id, vid_info in state.get(self._KEY_VIDEOS, {}).items():
            if vid_info.get(self._KEY_STATUS) == self._STATUS_COMPLETED:
                completed.add(vid_id)
        _, notes = self.load_notes(playlist_dir)
        for note in notes:
            vid_id = note.get(self._KEY_VIDEO_ID)
            if vid_id:
                completed.add(vid_id)
        return completed

    def get_failed_video_ids(self, playlist_dir: Path) -> set[str]:
        """Return set of video IDs that failed in previous runs."""
        state = self.load_state(playlist_dir)
        return {
            vid_id
            for vid_id, vid_info in state.get(self._KEY_VIDEOS, {}).items()
            if vid_info.get(self._KEY_STATUS) == self._STATUS_FAILED
        }

    def record_video_success(
        self,
        playlist_dir: Path,
        notebook: dict[str, Any],
        note: dict[str, Any],
        video_info: dict[str, Any],
    ) -> tuple[Path, Path]:
        """Atomically persist newly generated note, update notes.json and write markdown."""
        notes = self._upsert_note_record(playlist_dir, note)
        self._write_json(playlist_dir / self._FILE_NOTEBOOK, notebook)
        self._write_json(playlist_dir / self._FILE_NOTES, notes)
        md_path = self._write_markdown_note(playlist_dir, note, video_info)
        self._update_state_on_success(playlist_dir, video_info, note, md_path)
        return playlist_dir / self._FILE_NOTES, md_path

    def record_video_failure(
        self, playlist_dir: Path, video_info: dict[str, Any], error_msg: str
    ) -> Path:
        """Record video failure status and error details in state.json."""
        state = self.load_state(playlist_dir)
        vid_id = video_info.get(self._KEY_VIDEO_ID, "unknown")
        videos = state.setdefault(self._KEY_VIDEOS, {})
        videos[vid_id] = {
            self._KEY_VIDEO_ID: vid_id,
            self._KEY_TITLE: video_info.get(self._KEY_TITLE, ""),
            self._KEY_URL: video_info.get(self._KEY_URL, ""),
            self._KEY_STATUS: self._STATUS_FAILED,
            self._KEY_ERROR: error_msg,
            self._KEY_UPDATED_AT: datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }
        self._recalculate_counts(state)
        state_path = playlist_dir / self._FILE_STATE
        self._write_json(state_path, state)
        return state_path

    def _upsert_note_record(
        self, playlist_dir: Path, new_note: dict[str, Any]
    ) -> list[dict[str, Any]]:
        """Add or update note in existing notes collection."""
        _, notes = self.load_notes(playlist_dir)
        vid_id = new_note.get(self._KEY_VIDEO_ID)
        idx_match = next(
            (i for i, n in enumerate(notes) if n.get(self._KEY_VIDEO_ID) == vid_id), -1
        )
        if idx_match >= 0:
            notes[idx_match] = new_note
        else:
            notes.append(new_note)
        return notes

    def _write_markdown_note(
        self, playlist_dir: Path, note: dict[str, Any], video_info: dict[str, Any]
    ) -> Path:
        """Write an individual human-readable markdown note file in notes subdirectory."""
        notes_subdir = playlist_dir / self._DIR_NOTES_MD
        notes_subdir.mkdir(parents=True, exist_ok=True)
        title = note.get(self._KEY_TITLE) or video_info.get(self._KEY_TITLE, "Note")
        filename = f"{self._sanitize_filename(title)}{self._EXT_MD}"
        target_path = notes_subdir / filename
        body = note.get(self._KEY_CONTENT, "")
        header = f"# {title}\n\n"
        if video_info.get(self._KEY_URL):
            header += f"**Source**: {video_info[self._KEY_URL]}\n\n"
        target_path.write_text(f"{header}{body}", encoding=self._ENCODING_UTF8)
        return target_path

    def _update_state_on_success(
        self,
        playlist_dir: Path,
        video_info: dict[str, Any],
        note: dict[str, Any],
        md_path: Path,
    ) -> None:
        """Update state structure and write state.json on successful video note creation."""
        state = self.load_state(playlist_dir)
        vid_id = video_info.get(self._KEY_VIDEO_ID, note.get(self._KEY_VIDEO_ID, "unknown"))
        videos = state.setdefault(self._KEY_VIDEOS, {})
        videos[vid_id] = {
            self._KEY_VIDEO_ID: vid_id,
            self._KEY_TITLE: note.get(self._KEY_TITLE, video_info.get(self._KEY_TITLE, "")),
            self._KEY_URL: video_info.get(self._KEY_URL, ""),
            self._KEY_STATUS: self._STATUS_COMPLETED,
            self._KEY_ERROR: None,
            self._KEY_NOTE_ID: note.get("id"),
            self._KEY_MARKDOWN_PATH: str(md_path),
            self._KEY_UPDATED_AT: datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }
        self._recalculate_counts(state)
        self._write_json(playlist_dir / self._FILE_STATE, state)

    def _recalculate_counts(self, state: dict[str, Any]) -> None:
        """Compute aggregate completion and failure numbers in state metadata."""
        videos = state.get(self._KEY_VIDEOS, {})
        state[self._KEY_TOTAL_VIDEOS] = len(videos)
        state[self._KEY_COMPLETED_VIDEOS] = sum(
            1 for v in videos.values() if v.get(self._KEY_STATUS) == self._STATUS_COMPLETED
        )
        state[self._KEY_FAILED_VIDEOS] = sum(
            1 for v in videos.values() if v.get(self._KEY_STATUS) == self._STATUS_FAILED
        )
        state[self._KEY_UPDATED_AT] = datetime.datetime.now(datetime.timezone.utc).isoformat()

    def _build_initial_state(self, playlist_name: str) -> dict[str, Any]:
        """Construct initial empty state structure."""
        return {
            self._KEY_PLAYLIST_TITLE: playlist_name,
            self._KEY_TOTAL_VIDEOS: 0,
            self._KEY_COMPLETED_VIDEOS: 0,
            self._KEY_FAILED_VIDEOS: 0,
            self._KEY_VIDEOS: {},
            self._KEY_UPDATED_AT: datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }

    def _write_json(self, target_path: Path, data: Any) -> None:
        """Write Python data structure as formatted JSON to destination path."""
        target_path.write_text(
            json.dumps(data, indent=2, ensure_ascii=False),
            encoding=self._ENCODING_UTF8,
        )

    def _sanitize_filename(self, name: str) -> str:
        """Replace non-alphanumeric characters with underscore to form safe filenames."""
        return "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in name)
