"""Unit tests for PlaylistStateManager class."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from tools.youtube_cli.playlist_state_manager import PlaylistStateManager


class TestPlaylistStateManager:
    """Test suite verifying playlist state persistence, incremental notes, and markdown export."""

    @pytest.fixture
    def temp_notes_dir(self, tmp_path: Path) -> Path:
        """Create a temporary directory fixture for state testing."""
        return tmp_path / "notes"

    @pytest.fixture
    def manager(self, temp_notes_dir: Path) -> PlaylistStateManager:
        """Instantiate PlaylistStateManager referencing temporary directory."""
        return PlaylistStateManager(temp_notes_dir)

    def test_get_playlist_dir_creates_safe_directory(
        self, manager: PlaylistStateManager, temp_notes_dir: Path
    ) -> None:
        """Verify get_playlist_dir sanitizes special characters and creates target directory."""
        p_dir = manager.get_playlist_dir("Course / Lecture: Intro to AI!")
        assert p_dir.exists()
        assert p_dir.is_dir()
        assert "Course___Lecture__Intro_to_AI_" in p_dir.name

    def test_load_state_returns_initial_when_file_missing(
        self, manager: PlaylistStateManager, temp_notes_dir: Path
    ) -> None:
        """Verify load_state builds default dictionary structure when state.json is absent."""
        p_dir = temp_notes_dir / "test_pl"
        p_dir.mkdir(parents=True)
        state = manager.load_state(p_dir)
        assert state["playlistTitle"] == "test_pl"
        assert state["totalVideos"] == 0
        assert state["completedVideos"] == 0
        assert state["failedVideos"] == 0
        assert state["videos"] == {}

    def test_record_video_success_writes_notes_and_markdown(
        self, manager: PlaylistStateManager, temp_notes_dir: Path
    ) -> None:
        """Verify record_video_success persists notes.json, notebook.json, markdown, and state."""
        p_dir = manager.get_playlist_dir("Test Course")
        notebook = {"name": "Test Course", "description": "CS Course"}
        note = {
            "id": "note_123",
            "videoId": "vid_abc",
            "title": "Lecture 1: Intro",
            "content": "Introductory content",
            "wordCount": 2,
        }
        vid_info = {"videoId": "vid_abc", "url": "https://youtube.com/watch?v=vid_abc"}

        notes_file, md_file = manager.record_video_success(p_dir, notebook, note, vid_info)

        assert notes_file.is_file()
        assert md_file.is_file()
        notes_data = json.loads(notes_file.read_text(encoding="utf-8"))
        assert len(notes_data) == 1
        assert notes_data[0]["videoId"] == "vid_abc"

        md_content = md_file.read_text(encoding="utf-8")
        assert "# Lecture 1: Intro" in md_content
        assert "Introductory content" in md_content

        state = manager.load_state(p_dir)
        assert state["completedVideos"] == 1
        assert state["failedVideos"] == 0
        assert state["videos"]["vid_abc"]["status"] == "completed"

    def test_record_video_success_upserts_existing_note(
        self, manager: PlaylistStateManager
    ) -> None:
        """Verify updating a previously saved note replaces rather than duplicates it."""
        p_dir = manager.get_playlist_dir("Course Re-run")
        notebook = {"name": "Course Re-run"}
        note_v1 = {"videoId": "vid_1", "title": "Lecture 1 v1", "content": "v1"}
        note_v2 = {"videoId": "vid_1", "title": "Lecture 1 v2", "content": "v2"}
        vid_info = {"videoId": "vid_1", "url": "https://youtube.com/watch?v=vid_1"}

        manager.record_video_success(p_dir, notebook, note_v1, vid_info)
        manager.record_video_success(p_dir, notebook, note_v2, vid_info)

        _, notes = manager.load_notes(p_dir)
        assert len(notes) == 1
        assert notes[0]["content"] == "v2"

    def test_record_video_failure_updates_state_counts(
        self, manager: PlaylistStateManager
    ) -> None:
        """Verify record_video_failure marks status as failed and records error message."""
        p_dir = manager.get_playlist_dir("Failed Course")
        vid_info = {
            "videoId": "vid_err",
            "title": "Broken Lecture",
            "url": "https://youtube.com/watch?v=vid_err",
        }

        manager.record_video_failure(p_dir, vid_info, "503 UNAVAILABLE: High demand")
        state = manager.load_state(p_dir)

        assert state["failedVideos"] == 1
        assert state["completedVideos"] == 0
        rec = state["videos"]["vid_err"]
        assert rec["status"] == "failed"
        assert "503 UNAVAILABLE" in rec["error"]

    def test_get_completed_ids_from_state_and_notes(
        self, manager: PlaylistStateManager
    ) -> None:
        """Verify get_completed_ids collects IDs from both state records and notes.json."""
        p_dir = manager.get_playlist_dir("Merged Status")
        notebook = {"name": "Merged Status"}
        note = {"videoId": "vid_done", "title": "Done Note", "content": "content"}
        vid_info = {"videoId": "vid_done", "url": "https://youtube.com/watch?v=vid_done"}

        manager.record_video_success(p_dir, notebook, note, vid_info)
        completed = manager.get_completed_ids(p_dir)

        assert "vid_done" in completed

    def test_get_failed_video_ids(self, manager: PlaylistStateManager) -> None:
        """Verify get_failed_video_ids filters accurately for failed video keys."""
        p_dir = manager.get_playlist_dir("Filtered Failures")
        manager.record_video_failure(
            p_dir, {"videoId": "vid_fail"}, "429 ResourceExhausted"
        )

        failed = manager.get_failed_video_ids(p_dir)
        assert "vid_fail" in failed

    def test_load_notes_syncs_edited_and_new_markdown_files(
        self, manager: PlaylistStateManager
    ) -> None:
        """Verify load_notes automatically updates and adds notes from notes/ markdown files."""
        p_dir = manager.get_playlist_dir("Sync Course")
        notebook = {"name": "Sync Course"}
        note = {"videoId": "v1", "title": "Lecture 1", "content": "Original content"}
        manager.record_video_success(
            p_dir, notebook, note, {"videoId": "v1", "url": "https://yt.com/v1"}
        )

        notes_dir = p_dir / "notes"
        md_file = notes_dir / "Lecture_1.md"
        md_file.write_text("# Lecture 1\n\nUpdated markdown content here.")

        new_md = notes_dir / "Lecture_2_Manual.md"
        new_md.write_text("# Lecture 2: Manual\n\nManual note content.")

        _, synced = manager.load_notes(p_dir)
        by_title = {n["title"]: n for n in synced}

        assert by_title["Lecture 1"]["content"] == "Updated markdown content here."
        assert "Lecture 2: Manual" in by_title
        assert by_title["Lecture 2: Manual"]["content"] == "Manual note content."
        assert by_title["Lecture 2: Manual"]["sourceType"] == "manual"

    def test_load_notes_synthesizes_notebook_when_missing_but_markdown_exists(
        self, manager: PlaylistStateManager, temp_notes_dir: Path
    ) -> None:
        """Verify load_notes synthesizes notebook.json if absent but markdown notes exist."""
        p_dir = temp_notes_dir / "CS221_AI_2025"
        notes_dir = p_dir / "notes"
        notes_dir.mkdir(parents=True)
        (notes_dir / "01_intro.md").write_text("# Intro to AI\n\nAI foundations content.")

        nb, notes = manager.load_notes(p_dir)
        assert nb["name"] == "CS221 AI 2025"
        assert nb["source"] == "youtube_playlist"
        assert len(notes) == 1
        assert (p_dir / "notebook.json").is_file()

    def test_init_playlist_creates_notebook_json_and_state(
        self, manager: PlaylistStateManager, temp_notes_dir: Path
    ) -> None:
        """Verify init_playlist creates directory, notes subfolder, notebook.json and state.json."""
        p_dir = temp_notes_dir / "Stanford_CS229"
        notebook = manager.build_playlist_notebook("Stanford CS229", "https://youtube.com/pl")
        manager.init_playlist(p_dir, notebook, "https://youtube.com/pl")

        assert (p_dir / "notebook.json").is_file()
        assert (p_dir / "state.json").is_file()
        assert (p_dir / "notes").is_dir()
        state = manager.load_state(p_dir)
        assert state["playlistUrl"] == "https://youtube.com/pl"

    def test_save_notebook_persists_metadata_and_notes_dir(
        self, manager: PlaylistStateManager, temp_notes_dir: Path
    ) -> None:
        """Verify save_notebook writes notebook.json and creates notes directory."""
        p_dir = temp_notes_dir / "Custom_Course"
        notebook = {"name": "Custom Course", "tags": ["test"]}
        nb_file = manager.save_notebook(p_dir, notebook)

        assert nb_file.is_file()
        assert (p_dir / "notes").is_dir()
        loaded = json.loads(nb_file.read_text(encoding="utf-8"))
        assert loaded["name"] == "Custom Course"
