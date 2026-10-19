"""Unit tests for the YouTubeCli entry point."""

from __future__ import annotations

import json
from pathlib import Path
from typing import ClassVar
from unittest.mock import MagicMock

from rich.console import Console

from tools.youtube_cli.config import Config
from tools.youtube_cli.main import YouTubeCli
from tools.youtube_cli.url_utils import UrlUtils


class TestYouTubeCli:
    """Test suite validating end-to-end orchestration in the YouTubeCli."""

    _VIDEO_URL: ClassVar[str] = "https://www.youtube.com/watch?v=jGwO_UgTS7I"
    _PLAYLIST_URL: ClassVar[str] = (
        "https://www.youtube.com/playlist?list=PLoROMvodv4rMiGQp3WXShtMGgzqpfVfbU"
    )

    def _create_mock_cli(
        self, tmp_path: Path
    ) -> tuple[YouTubeCli, MagicMock, MagicMock, MagicMock, MagicMock]:
        """Construct a configured YouTubeCli instance with mock dependencies."""
        mock_fetcher = MagicMock()
        mock_fetcher.fetch.return_value = {
            "transcript": "Sample transcript content for video.",
            "video_id": "jGwO_UgTS7I",
            "word_count": 5,
            "segment_count": 1,
        }

        video_record = {
            "video_id": "jGwO_UgTS7I",
            "title": "Lecture 1",
            "url": self._VIDEO_URL,
            "index": 1,
        }
        mock_resolver = MagicMock()
        mock_resolver.resolve.return_value = {
            "playlist_title": "Stanford CS229",
            "video_count": 1,
            "videos": [video_record],
        }

        mock_generator = MagicMock()
        mock_generator.generate.return_value = {
            "title": "Generated Lecture 1",
            "summary": "Summary of lecture 1",
            "key_points": ["Point 1"],
            "markdown_notes": "# Lecture 1\nDetailed notes content.",
            "metadata": {"input_tokens": 10, "output_tokens": 20},
        }

        mock_pusher = MagicMock()
        mock_pusher.push.return_value = {"notesStored": 1}

        config = Config()
        config._notes_dir = str(tmp_path / "notes")
        config._cache_dir = str(tmp_path / "cache")

        console = Console(quiet=True)
        cli = YouTubeCli(
            config=config,
            console=console,
            fetcher=mock_fetcher,
            resolver=mock_resolver,
            generator=mock_generator,
            pusher=mock_pusher,
            url_utils=UrlUtils(),
        )
        return cli, mock_fetcher, mock_resolver, mock_generator, mock_pusher

    def test_process_single_video_pipeline(self, tmp_path: Path) -> None:
        """Verify pipeline for single video fetches transcript, generates notes, and pushes."""
        cli, mock_fetch, _, mock_gen, mock_push = self._create_mock_cli(tmp_path)
        exit_code = cli.run(["process", "--url", self._VIDEO_URL])

        assert exit_code == 0
        mock_fetch.fetch.assert_called_once_with(self._VIDEO_URL)
        mock_gen.generate.assert_called_once()
        mock_push.push.assert_called_once()

    def test_process_playlist_pipeline(self, tmp_path: Path) -> None:
        """Verify process pipeline for playlist resolves playlist and iterates through videos."""
        cli, _, mock_resolve, mock_gen, mock_push = self._create_mock_cli(tmp_path)
        exit_code = cli.run(["process", "--url", self._PLAYLIST_URL])

        assert exit_code == 0
        mock_resolve.resolve.assert_called_once_with(self._PLAYLIST_URL)
        mock_gen.generate.assert_called_once()
        mock_push.push.assert_called_once()

    def test_process_local_only_skips_push(self, tmp_path: Path) -> None:
        """Verify --local-only flag prevents server push from occurring."""
        cli, _, _, _, mock_push = self._create_mock_cli(tmp_path)
        exit_code = cli.run(["process", "--url", self._VIDEO_URL, "--local-only"])

        assert exit_code == 0
        mock_push.push.assert_not_called()

    def test_push_directory_sends_saved_notebook(self, tmp_path: Path) -> None:
        """Verify push command loads local notebook and notes JSON and pushes to server."""
        cli, _, _, _, mock_push = self._create_mock_cli(tmp_path)
        nb_dir = tmp_path / "test_nb"
        nb_dir.mkdir(parents=True, exist_ok=True)
        (nb_dir / "notebook.json").write_text(json.dumps({"name": "Test"}), encoding="utf-8")
        (nb_dir / "notes.json").write_text(json.dumps([{"title": "Note 1"}]), encoding="utf-8")

        exit_code = cli.run(["push", "--notebook-dir", str(nb_dir)])
        assert exit_code == 0
        mock_push.push.assert_called_once()

    def test_push_directory_fails_when_notebook_missing(self, tmp_path: Path) -> None:
        """Verify push command returns exit code 1 when notebook.json is absent."""
        cli, _, _, _, _ = self._create_mock_cli(tmp_path)
        empty_dir = tmp_path / "empty_nb"
        empty_dir.mkdir(parents=True, exist_ok=True)

        exit_code = cli.run(["push", "--notebook-dir", str(empty_dir)])
        assert exit_code == 1

    def test_process_returns_error_on_unrecognized_url(self, tmp_path: Path) -> None:
        """Verify process returns exit code 1 when URL format is unrecognized."""
        cli, _, _, _, _ = self._create_mock_cli(tmp_path)
        exit_code = cli.run(["process", "--url", "https://not-youtube.com/page"])
        assert exit_code == 1

    def test_process_playlist_fails_when_resolve_errors(self, tmp_path: Path) -> None:
        """Verify process returns 1 when playlist resolution raises an exception."""
        cli, _, mock_resolve, _, _ = self._create_mock_cli(tmp_path)
        mock_resolve.resolve.side_effect = ValueError("Playlist not found")
        exit_code = cli.run(["process", "--url", self._PLAYLIST_URL])
        assert exit_code == 1

    def test_process_single_video_fails_when_fetch_errors(self, tmp_path: Path) -> None:
        """Verify process returns 1 when transcript fetch throws an error."""
        cli, mock_fetch, _, _, _ = self._create_mock_cli(tmp_path)
        mock_fetch.fetch.side_effect = ConnectionError("Network down")
        exit_code = cli.run(["process", "--url", self._VIDEO_URL])
        assert exit_code == 1

    def test_run_empty_command_prints_help_and_returns_one(self, tmp_path: Path) -> None:
        """Verify run without arguments prints help and returns exit code 1."""
        cli, _, _, _, _ = self._create_mock_cli(tmp_path)
        exit_code = cli.run([])
        assert exit_code == 1

    def test_process_empty_url_returns_one(self, tmp_path: Path) -> None:
        """Verify process returns 1 when empty string is passed as URL."""
        cli, _, _, _, _ = self._create_mock_cli(tmp_path)
        exit_code = cli.process("")
        assert exit_code == 1

    def test_fetch_or_cache_uses_existing_cache_entry(self, tmp_path: Path) -> None:
        """Verify _fetch_or_cache_transcript returns cached transcript without re-fetching."""
        cli, mock_fetch, _, _, _ = self._create_mock_cli(tmp_path)
        cli._cache.put("jGwO_UgTS7I", "Cached transcript text")
        result = cli._fetch_or_cache_transcript(self._VIDEO_URL, "jGwO_UgTS7I")
        assert result["transcript"] == "Cached transcript text"
        mock_fetch.fetch.assert_not_called()
