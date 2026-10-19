"""Command-line interface entry point for local YouTube transcript ingestion pipeline."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any, ClassVar

from rich.console import Console
from rich.table import Table

from tools.youtube_cli.config import Config
from tools.youtube_cli.note_generator import NoteGenerator
from tools.youtube_cli.playlist_resolver import PlaylistResolver
from tools.youtube_cli.server_pusher import ServerPusher
from tools.youtube_cli.transcript_cache import TranscriptCache
from tools.youtube_cli.transcript_fetcher import TranscriptFetcher
from tools.youtube_cli.url_utils import UrlUtils


class YouTubeCli:
    """Command-line interface for local YouTube transcript fetching and note generation."""

    _CMD_PROCESS: ClassVar[str] = "process"
    _CMD_PUSH: ClassVar[str] = "push"
    _OPT_URL: ClassVar[str] = "--url"
    _OPT_LOCAL_ONLY: ClassVar[str] = "--local-only"
    _OPT_SERVER_URL: ClassVar[str] = "--server-url"
    _OPT_NOTEBOOK_DIR: ClassVar[str] = "--notebook-dir"
    _SOURCE_TYPE: ClassVar[str] = "youtube_transcript"
    _FORMAT_MARKDOWN: ClassVar[str] = "markdown"

    def __init__(
        self,
        config: Config | None = None,
        console: Console | None = None,
        fetcher: TranscriptFetcher | None = None,
        resolver: PlaylistResolver | None = None,
        generator: NoteGenerator | None = None,
        pusher: ServerPusher | None = None,
        cache: TranscriptCache | None = None,
        url_utils: UrlUtils | None = None,
    ) -> None:
        """Initialize the CLI with configurable subcomponents and rendering console."""
        self._config = config if config is not None else Config()
        self._console = console if console is not None else Console()
        self._url_utils = url_utils if url_utils is not None else UrlUtils()
        self._cache = cache if cache is not None else TranscriptCache(self._config.get_cache_dir())
        self._fetcher = (
            fetcher if fetcher is not None else TranscriptFetcher(url_utils=self._url_utils)
        )
        self._resolver = (
            resolver if resolver is not None else PlaylistResolver(url_utils=self._url_utils)
        )
        self._generator = generator if generator is not None else NoteGenerator()
        self._pusher = (
            pusher if pusher is not None else ServerPusher(server_url=self._config.get_server_url())
        )

    def run(self, argv: list[str] | None = None) -> int:
        """Parse arguments and dispatch execution to the appropriate command handler."""
        parser = self._build_arg_parser()
        args = parser.parse_args(argv if argv is not None else sys.argv[1:])

        if args.command == self._CMD_PROCESS:
            return self.process(args.url, args.local_only, args.server_url)
        if args.command == self._CMD_PUSH:
            return self.push_directory(args.notebook_dir, args.server_url)

        parser.print_help()
        return 1

    def process(self, url: str, local_only: bool = False, server_url: str | None = None) -> int:
        """Process a single YouTube video or full playlist end-to-end."""
        if not url:
            self._console.print("[bold red]Error: --url is required[/bold red]")
            return 1

        if self._url_utils.is_playlist_url(url):
            return self._process_playlist(url, local_only, server_url)
        if self._url_utils.is_video_url(url):
            return self._process_single_video(url, local_only, server_url)

        self._console.print(f"[bold red]Error: Unrecognized YouTube URL format: {url}[/bold red]")
        return 1

    def push_directory(self, notebook_dir: str, server_url: str | None = None) -> int:
        """Push a locally saved notebook directory to the Vercel backend server."""
        nb_path = Path(notebook_dir).expanduser().resolve()
        nb_file = nb_path / "notebook.json"
        if not nb_file.is_file():
            self._console.print(f"[bold red]Error: Missing notebook.json in {nb_path}[/bold red]")
            return 1

        try:
            notebook, notes = self._load_local_notebook(nb_path)
            pusher = ServerPusher(server_url=server_url) if server_url else self._pusher
            self._console.print(f"[cyan]Pushing {len(notes)} note(s) to server...[/cyan]")
            res = pusher.push(notebook, notes)
            stored_count = res.get("notesStored", len(notes))
            self._console.print(
                f"[bold green]Push successful! Stored {stored_count} notes.[/bold green]"
            )
            return 0
        except Exception as err:
            self._console.print(f"[bold red]Push failed: {err}[/bold red]")
            return 1

    def _build_arg_parser(self) -> argparse.ArgumentParser:
        """Construct CLI argument parser schema."""
        parser = argparse.ArgumentParser(
            prog="youtube-cli", description="SynapseSync YouTube CLI"
        )
        subparsers = parser.add_subparsers(dest="command", help="Command to execute")

        proc_parser = subparsers.add_parser(self._CMD_PROCESS, help="Process video or playlist")
        proc_parser.add_argument(self._OPT_URL, required=True, help="YouTube video or playlist URL")
        proc_parser.add_argument(
            self._OPT_LOCAL_ONLY, action="store_true", help="Save locally only"
        )
        proc_parser.add_argument(
            self._OPT_SERVER_URL, default=None, help="Target backend server URL"
        )

        push_parser = subparsers.add_parser(self._CMD_PUSH, help="Push local notebook to server")
        push_parser.add_argument(
            self._OPT_NOTEBOOK_DIR, required=True, help="Path to notebook directory"
        )
        push_parser.add_argument(
            self._OPT_SERVER_URL, default=None, help="Target backend server URL"
        )
        return parser

    def _process_single_video(self, url: str, local_only: bool, server_url: str | None) -> int:
        """Process an individual video URL."""
        video_id = self._url_utils.extract_video_id(url)
        self._console.print(f"[bold cyan]Processing video:[/bold cyan] {video_id}")
        start_time = time.time()

        try:
            transcript_data = self._fetch_or_cache_transcript(url, video_id or "unknown")
            note_data = self._generator.generate(
                transcript_data["transcript"],
                f"Video {video_id}",
            )
            processed_note = self._build_note_record(video_id or "", note_data, url)
            notebook = self._build_single_notebook_record(note_data["title"], url)
            notes = [processed_note]

            self._save_local_notebook(notebook, notes)
            self._maybe_push_to_server(notebook, notes, local_only, server_url)
            elapsed = time.time() - start_time
            self._print_summary_table(1, 1, 0, processed_note["wordCount"], elapsed)
            return 0
        except Exception as err:
            self._console.print(f"[bold red]Failed processing video: {err}[/bold red]")
            return 1

    def _process_playlist(self, url: str, local_only: bool, server_url: str | None) -> int:
        """Process an entire YouTube playlist sequentially."""
        self._console.print(f"[bold cyan]Resolving playlist:[/bold cyan] {url}")
        try:
            pl_info = self._resolver.resolve(url)
        except Exception as err:
            self._console.print(f"[bold red]Failed to resolve playlist: {err}[/bold red]")
            return 1

        videos = pl_info["videos"]
        notebook = self._build_playlist_notebook_record(pl_info["playlist_title"], url)
        notes, success_cnt, fail_cnt, total_words = self._process_video_batch(videos)

        if notes:
            self._save_local_notebook(notebook, notes)
            self._maybe_push_to_server(notebook, notes, local_only, server_url)

        return 0 if fail_cnt == 0 else 1

    def _process_video_batch(
        self, videos: list[dict[str, Any]]
    ) -> tuple[list[dict[str, Any]], int, int, int]:
        """Iterate through playlist videos and accumulate generated notes with status updates."""
        notes: list[dict[str, Any]] = []
        success_cnt, fail_cnt, total_words = 0, 0, 0
        total_videos = len(videos)
        start_time = time.time()

        for idx, vid in enumerate(videos, start=1):
            vid_id = vid["video_id"]
            title = vid.get("title", f"Video {vid_id}")
            self._console.print(f"[{idx}/{total_videos}] [yellow]⏳ In progress:[/yellow] {title}")
            try:
                t_data = self._fetch_or_cache_transcript(vid["url"], vid_id)
                n_data = self._generator.generate(t_data["transcript"], title)
                note_rec = self._build_note_record(vid_id, n_data, vid["url"])
                notes.append(note_rec)
                success_cnt += 1
                total_words += note_rec["wordCount"]
                self._console.print(f"[{idx}/{total_videos}] [green]✅ Completed:[/green] {title}")
            except Exception as err:
                fail_cnt += 1
                self._console.print(f"[{idx}/{total_videos}] [red]❌ Failed:[/red] {title} ({err})")

        elapsed = time.time() - start_time
        self._print_summary_table(total_videos, success_cnt, fail_cnt, total_words, elapsed)
        return notes, success_cnt, fail_cnt, total_words

    def _fetch_or_cache_transcript(self, url: str, video_id: str) -> dict[str, Any]:
        """Retrieve transcript from cache or execute external fetch and cache."""
        if self._cache.has(video_id):
            cached = self._cache.get(video_id)
            if cached and cached.get("transcript"):
                self._console.print(f"  [dim]Using cached transcript for {video_id}[/dim]")
                return cached
        fetched = self._fetcher.fetch(url)
        self._cache.put(video_id, fetched["transcript"], fetched)
        return fetched

    def _build_note_record(
        self, video_id: str, note_data: dict[str, Any], url: str
    ) -> dict[str, Any]:
        """Format processed note dictionary conforming to API schema."""
        content = note_data.get("markdown_notes", "")
        word_count = len(content.split())
        return {
            "title": note_data.get("title", f"Lecture {video_id}"),
            "content": content,
            "contentFormat": self._FORMAT_MARKDOWN,
            "sourceType": self._SOURCE_TYPE,
            "sourceUrl": url,
            "videoId": video_id,
            "wordCount": word_count,
        }

    def _build_single_notebook_record(self, title: str, url: str) -> dict[str, Any]:
        """Build notebook metadata dictionary for a single video."""
        return {
            "name": f"YouTube: {title}",
            "source": "youtube_playlist",
            "sourceUrl": url,
            "description": f"Generated notes for {title}",
            "tags": ["youtube", "lecture"],
        }

    def _build_playlist_notebook_record(self, title: str, url: str) -> dict[str, Any]:
        """Build notebook metadata dictionary for a playlist."""
        return {
            "name": title,
            "source": "youtube_playlist",
            "sourceUrl": url,
            "description": f"Complete series notes for {title}",
            "tags": ["youtube", "playlist"],
        }

    def _save_local_notebook(
        self, notebook: dict[str, Any], notes: list[dict[str, Any]]
    ) -> Path:
        """Persist notebook and notes JSON files to local storage directory."""
        safe_name = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in notebook["name"])
        base_dir = Path(self._config.get_notes_dir()).expanduser().resolve() / safe_name
        base_dir.mkdir(parents=True, exist_ok=True)
        (base_dir / "notebook.json").write_text(json.dumps(notebook, indent=2), encoding="utf-8")
        (base_dir / "notes.json").write_text(json.dumps(notes, indent=2), encoding="utf-8")
        self._console.print(f"[dim]Notes saved locally in: {base_dir}[/dim]")
        return base_dir

    def _load_local_notebook(self, dir_path: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        """Read notebook.json and notes.json from target directory."""
        nb_file = dir_path / "notebook.json"
        notes_file = dir_path / "notes.json"
        nb_data: dict[str, Any] = json.loads(nb_file.read_text(encoding="utf-8"))
        notes_data: list[dict[str, Any]] = json.loads(notes_file.read_text(encoding="utf-8"))
        return nb_data, notes_data

    def _maybe_push_to_server(
        self,
        notebook: dict[str, Any],
        notes: list[dict[str, Any]],
        local_only: bool,
        server_url: str | None,
    ) -> None:
        """Push notes to Vercel backend unless local_only flag is enabled."""
        if local_only:
            self._console.print("[dim]Local-only mode: Skipping push to server.[/dim]")
            return
        pusher = ServerPusher(server_url=server_url) if server_url else self._pusher
        try:
            res = pusher.push(notebook, notes)
            stored_count = res.get("notesStored", len(notes))
            self._console.print(
                f"[bold green]Pushed to server: {stored_count} notes stored.[/bold green]"
            )
        except Exception as err:
            self._console.print(
                f"[bold yellow]Warning: Failed to push to server: {err}[/bold yellow]"
            )

    def _print_summary_table(
        self, total: int, success: int, failed: int, word_count: int, duration: float
    ) -> None:
        """Render a formatted Rich table summarizing pipeline execution metrics."""
        table = Table(title="Processing Summary")
        table.add_column("Metric", style="cyan")
        table.add_column("Value", style="magenta")
        table.add_row("Total Videos", str(total))
        table.add_row("Successful", str(success))
        table.add_row("Failed", str(failed))
        table.add_row("Total Words Generated", str(word_count))
        table.add_row("Elapsed Time", f"{duration:.1f}s")
        self._console.print(table)


if __name__ == "__main__":
    cli = YouTubeCli()
    sys.exit(cli.run())
