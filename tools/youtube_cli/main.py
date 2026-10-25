"""Command-line interface entry point for local YouTube transcript ingestion pipeline."""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path
from typing import Any, ClassVar

_WORKSPACE_ROOT: str = str(Path(__file__).resolve().parent.parent.parent)
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)

from rich.console import Console  # noqa: E402
from rich.table import Table  # noqa: E402

from tools.youtube_cli.config import Config  # noqa: E402
from tools.youtube_cli.google_drive_pusher import GoogleDrivePusher  # noqa: E402
from tools.youtube_cli.note_generator import NoteGenerator  # noqa: E402
from tools.youtube_cli.playlist_resolver import PlaylistResolver  # noqa: E402
from tools.youtube_cli.playlist_state_manager import PlaylistStateManager  # noqa: E402
from tools.youtube_cli.server_pusher import ServerPusher  # noqa: E402
from tools.youtube_cli.transcript_cache import TranscriptCache  # noqa: E402
from tools.youtube_cli.transcript_fetcher import TranscriptFetcher  # noqa: E402
from tools.youtube_cli.url_utils import UrlUtils  # noqa: E402


class YouTubeCli:
    """Command-line interface for local YouTube transcript fetching and note generation."""

    _CMD_PROCESS: ClassVar[str] = "process"
    _CMD_PUSH: ClassVar[str] = "push"
    _CMD_RETRY: ClassVar[str] = "retry"
    _OPT_URL: ClassVar[str] = "--url"
    _OPT_LOCAL_ONLY: ClassVar[str] = "--local-only"
    _OPT_DRIVE_FOLDER: ClassVar[str] = "--drive-folder"
    _OPT_DRIVE_TOKEN: ClassVar[str] = "--drive-token"
    _OPT_SERVER_URL: ClassVar[str] = "--server-url"
    _OPT_NOTEBOOK_DIR: ClassVar[str] = "--notebook-dir"
    _OPT_FORCE: ClassVar[str] = "--force"
    _OPT_RETRY_FAILED: ClassVar[str] = "--retry-failed"
    _ENV_LOCAL_FILE: ClassVar[str] = ".env.local"
    _ENV_FILE: ClassVar[str] = ".env"
    _ENV_COMMENT_PREFIX: ClassVar[str] = "#"
    _ENV_DELIMITER: ClassVar[str] = "="

    def __init__(
        self,
        config: Config | None = None,
        console: Console | None = None,
        fetcher: TranscriptFetcher | None = None,
        resolver: PlaylistResolver | None = None,
        generator: NoteGenerator | None = None,
        pusher: GoogleDrivePusher | ServerPusher | None = None,
        cache: TranscriptCache | None = None,
        url_utils: UrlUtils | None = None,
        state_manager: PlaylistStateManager | None = None,
    ) -> None:
        """Initialize the CLI with configurable subcomponents and rendering console."""
        self._load_environment()
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
        self._pusher = pusher or GoogleDrivePusher(
            access_token=self._config.get_drive_token(),
            drive_folder=self._config.get_drive_folder(),
        )
        self._state_manager = state_manager or PlaylistStateManager(self._config.get_notes_dir())

    def run(self, argv: list[str] | None = None) -> int:
        """Parse arguments and dispatch execution to the appropriate command handler."""
        parser = self._build_arg_parser()
        args = parser.parse_args(argv if argv is not None else sys.argv[1:])

        if args.command == self._CMD_PROCESS:
            return self.process(
                args.url, args.local_only, args.server_url,
                args.drive_folder, args.drive_token, args.force, args.retry_failed,
            )
        if args.command == self._CMD_RETRY:
            return self.retry(
                args.url, args.notebook_dir, args.local_only,
                args.server_url, args.drive_folder, args.drive_token,
            )
        if args.command == self._CMD_PUSH:
            return self.push_directory(
                args.notebook_dir, args.server_url, args.drive_folder, args.drive_token
            )

        parser.print_help()
        return 1

    def process(
        self,
        url: str,
        local_only: bool = False,
        server_url: str | None = None,
        drive_folder: str | None = None,
        drive_token: str | None = None,
        force: bool = False,
        retry_failed: bool = False,
    ) -> int:
        """Process a single YouTube video or full playlist end-to-end."""
        if not url:
            self._console.print("[bold red]Error: --url is required[/bold red]")
            return 1

        if self._url_utils.is_playlist_url(url):
            return self._process_playlist(
                url, local_only, server_url, drive_folder, drive_token, force, retry_failed
            )
        if self._url_utils.is_video_url(url):
            return self._process_single_video(
                url, local_only, server_url, drive_folder, drive_token
            )

        self._console.print(f"[bold red]Error: Unrecognized YouTube URL: {url}[/bold red]")
        return 1

    def retry(
        self,
        url: str | None = None,
        notebook_dir: str | None = None,
        local_only: bool = False,
        server_url: str | None = None,
        drive_folder: str | None = None,
        drive_token: str | None = None,
    ) -> int:
        """Retry previously failed videos in a playlist."""
        target_url = self._resolve_retry_url(url, notebook_dir)
        if not target_url:
            self._console.print("[bold red]Error: Provide --url or --notebook-dir[/bold red]")
            return 1
        return self.process(
            url=target_url,
            local_only=local_only,
            server_url=server_url,
            drive_folder=drive_folder,
            drive_token=drive_token,
            retry_failed=True,
        )

    def push_directory(
        self,
        notebook_dir: str,
        server_url: str | None = None,
        drive_folder: str | None = None,
        drive_token: str | None = None,
    ) -> int:
        """Push a locally saved notebook directory to Google Drive or backend server."""
        nb_path = Path(notebook_dir).expanduser().resolve()
        notebook, notes = self._state_manager.load_notes(nb_path)
        if not notebook:
            self._console.print(f"[bold red]Error: Missing notebook.json in {nb_path}[/bold red]")
            return 1

        try:
            dest = f"server ({server_url})" if server_url else "Google Drive"
            self._console.print(f"[cyan]Uploading {len(notes)} note(s) to {dest}...[/cyan]")
            res = self._execute_push(notebook, notes, server_url, drive_folder, drive_token)
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
        self._add_process_subparser(subparsers)
        self._add_push_subparser(subparsers)
        self._add_retry_subparser(subparsers)
        return parser

    def _add_common_remote_options(self, subparser: Any) -> None:
        """Add common remote storage and destination arguments to subparser."""
        subparser.add_argument(self._OPT_LOCAL_ONLY, action="store_true", help="Local only")
        subparser.add_argument(self._OPT_DRIVE_FOLDER, default=None, help="Drive folder name")
        subparser.add_argument(self._OPT_DRIVE_TOKEN, default=None, help="Drive OAuth token")
        subparser.add_argument(self._OPT_SERVER_URL, default=None, help="Server URL")

    def _add_process_subparser(self, subparsers: Any) -> None:
        """Configure arguments for the process command."""
        proc_parser = subparsers.add_parser(self._CMD_PROCESS, help="Process video or playlist")
        proc_parser.add_argument(self._OPT_URL, required=True, help="YouTube URL")
        self._add_common_remote_options(proc_parser)
        proc_parser.add_argument(self._OPT_FORCE, action="store_true", help="Force regenerate")
        proc_parser.add_argument(self._OPT_RETRY_FAILED, action="store_true", help="Retry failed")

    def _add_push_subparser(self, subparsers: Any) -> None:
        """Configure arguments for the push command."""
        push_parser = subparsers.add_parser(self._CMD_PUSH, help="Push local notebook directory")
        push_parser.add_argument(
            self._OPT_NOTEBOOK_DIR, required=True, help="Path to notebook directory"
        )
        self._add_common_remote_options(push_parser)

    def _add_retry_subparser(self, subparsers: Any) -> None:
        """Configure arguments for the retry command."""
        retry_parser = subparsers.add_parser(self._CMD_RETRY, help="Retry failed playlist videos")
        retry_parser.add_argument(self._OPT_URL, default=None, help="YouTube playlist URL")
        retry_parser.add_argument(self._OPT_NOTEBOOK_DIR, default=None, help="Notebook directory")
        self._add_common_remote_options(retry_parser)

    def _process_single_video(
        self,
        url: str,
        local_only: bool,
        server_url: str | None,
        drive_folder: str | None,
        drive_token: str | None,
    ) -> int:
        """Process an individual video URL."""
        video_id = self._url_utils.extract_video_id(url)
        self._console.print(f"[bold cyan]Processing video:[/bold cyan] {video_id}")
        start_time = time.time()

        try:
            transcript_data, _ = self._fetch_or_cache_transcript(url, video_id or "unknown")
            note_data = self._generator.generate(
                transcript_data["transcript"],
                f"Video {video_id}",
                on_retry=self._on_model_retry,
            )
            processed_note = self._state_manager.build_note_record(video_id or "", note_data, url)
            notebook = self._state_manager.build_single_notebook(note_data["title"], url)
            playlist_dir = self._state_manager.get_playlist_dir(notebook["name"])
            notes_file, md_file = self._state_manager.record_video_success(
                playlist_dir, notebook, processed_note, {"videoId": video_id, "url": url}
            )
            self._console.print(f"  [cyan]Saved note locally:[/cyan] file://{md_file}")
            self._console.print(f"  [dim]Notes collection:[/dim] file://{notes_file}")
            self._maybe_push(
                notebook, [processed_note], local_only, server_url, drive_folder, drive_token
            )
            elapsed = time.time() - start_time
            self._print_summary_table(1, 1, 0, processed_note["wordCount"], elapsed)
            return 0
        except Exception as err:
            self._console.print(f"[bold red]Failed processing video: {err}[/bold red]")
            return 1

    def _process_playlist(
        self,
        url: str,
        local_only: bool,
        server_url: str | None,
        drive_folder: str | None,
        drive_token: str | None,
        force: bool = False,
        retry_failed: bool = False,
    ) -> int:
        """Process an entire YouTube playlist sequentially."""
        self._console.print(f"[bold cyan]Resolving playlist:[/bold cyan] {url}")
        try:
            pl_info = self._resolver.resolve(url)
        except Exception as err:
            self._console.print(f"[bold red]Failed to resolve playlist: {err}[/bold red]")
            return 1

        playlist_title = pl_info["playlist_title"]
        playlist_dir = self._state_manager.get_playlist_dir(playlist_title)
        self._console.print(f"[dim]Playlist directory: file://{playlist_dir}[/dim]")
        notebook = self._state_manager.build_playlist_notebook(playlist_title, url)
        _, _, fail_cnt, _ = self._process_video_batch(
            videos=pl_info["videos"],
            playlist_dir=playlist_dir,
            notebook=notebook,
            local_only=local_only,
            server_url=server_url,
            drive_folder=drive_folder,
            drive_token=drive_token,
            force=force,
            retry_failed=retry_failed,
        )
        return 0 if fail_cnt == 0 else 1

    def _process_video_batch(
        self,
        videos: list[dict[str, Any]],
        playlist_dir: Path,
        notebook: dict[str, Any],
        local_only: bool,
        server_url: str | None,
        drive_folder: str | None,
        drive_token: str | None,
        force: bool,
        retry_failed: bool,
    ) -> tuple[list[dict[str, Any]], int, int, int]:
        """Iterate through playlist videos with incremental disk and Google Drive persistence."""
        completed_ids = self._state_manager.get_completed_ids(playlist_dir)
        failed_ids = self._state_manager.get_failed_video_ids(playlist_dir)
        notes: list[dict[str, Any]] = []
        success_cnt, fail_cnt, total_words = 0, 0, 0
        total_videos = len(videos)
        start_time = time.time()

        for idx, vid in enumerate(videos, start=1):
            vid_id = vid["video_id"]
            title = vid.get("title", f"Video {vid_id}")
            if retry_failed and vid_id not in failed_ids:
                continue
            if not force and vid_id in completed_ids:
                self._console.print(f"[{idx}/{total_videos}] [dim]⏩ Skipped:[/dim] {title}")
                success_cnt += 1
                continue

            self._console.print(f"[{idx}/{total_videos}] [yellow]⏳ In progress:[/yellow] {title}")
            try:
                note_rec = self._process_single_batch_item(
                    vid, playlist_dir, notebook, local_only, server_url, drive_folder, drive_token
                )
                notes.append(note_rec)
                success_cnt += 1
                total_words += note_rec["wordCount"]
                self._console.print(f"[{idx}/{total_videos}] [green]✅ Completed:[/green] {title}")
            except Exception as err:
                fail_cnt += 1
                self._state_manager.record_video_failure(playlist_dir, vid, str(err))
                self._console.print(f"[{idx}/{total_videos}] [red]❌ Failed:[/red] {title} ({err})")

        elapsed = time.time() - start_time
        self._print_summary_table(total_videos, success_cnt, fail_cnt, total_words, elapsed)
        return notes, success_cnt, fail_cnt, total_words

    def _process_single_batch_item(
        self,
        vid: dict[str, Any],
        playlist_dir: Path,
        notebook: dict[str, Any],
        local_only: bool,
        server_url: str | None,
        drive_folder: str | None,
        drive_token: str | None,
    ) -> dict[str, Any]:
        """Fetch transcript, generate notes, and persist immediately locally and remotely."""
        vid_id = vid["video_id"]
        title = vid.get("title", f"Video {vid_id}")
        t_data, _ = self._fetch_or_cache_transcript(vid["url"], vid_id)
        n_data = self._generator.generate(
            t_data["transcript"], title, on_retry=self._on_model_retry
        )
        note_rec = self._state_manager.build_note_record(vid_id, n_data, vid["url"])
        notes_file, md_file = self._state_manager.record_video_success(
            playlist_dir, notebook, note_rec, vid
        )
        self._console.print(f"  [cyan]Saved note locally:[/cyan] file://{md_file}")
        self._console.print(f"  [dim]Notes collection:[/dim] file://{notes_file}")
        self._maybe_push(notebook, [note_rec], local_only, server_url, drive_folder, drive_token)
        return note_rec

    def _fetch_or_cache_transcript(self, url: str, video_id: str) -> tuple[dict[str, Any], Path]:
        """Retrieve transcript from cache or execute external fetch and cache."""
        cache_file = self._cache._resolve_cache_file(video_id)
        if self._cache.has(video_id):
            cached = self._cache.get(video_id)
            if cached and cached.get("transcript"):
                self._console.print(f"  [dim]Cached transcript: file://{cache_file}[/dim]")
                return cached, cache_file
        fetched = self._fetcher.fetch(url)
        self._cache.put(video_id, fetched["transcript"], fetched)
        self._console.print(f"  [dim]Transcript cached: file://{cache_file}[/dim]")
        return fetched, cache_file

    def _execute_push(
        self,
        notebook: dict[str, Any],
        notes: list[dict[str, Any]],
        server_url: str | None = None,
        drive_folder: str | None = None,
        drive_token: str | None = None,
    ) -> dict[str, Any]:
        """Send notebook and notes to Google Drive (default) or backend server if URL specified."""
        if server_url:
            pusher: Any = ServerPusher(server_url=server_url)
        elif drive_folder or drive_token:
            pusher = GoogleDrivePusher(
                access_token=drive_token or self._config.get_drive_token(),
                drive_folder=drive_folder or self._config.get_drive_folder(),
            )
        else:
            pusher = self._pusher

        result: dict[str, Any] = pusher.push(notebook, notes)
        return result

    def _maybe_push(
        self,
        notebook: dict[str, Any],
        notes: list[dict[str, Any]],
        local_only: bool,
        server_url: str | None = None,
        drive_folder: str | None = None,
        drive_token: str | None = None,
    ) -> None:
        """Push notes to Google Drive or server unless local_only flag is enabled."""
        if local_only:
            self._console.print("  [dim]Local-only mode: Skipping remote push.[/dim]")
            return
        try:
            res = self._execute_push(notebook, notes, server_url, drive_folder, drive_token)
            count = res.get("notesStored", len(notes))
            target_desc = f"server ({server_url})" if server_url else "Google Drive"
            msg = f"  [bold green]Saved to {target_desc}: {count} note(s) stored.[/bold green]"
            self._console.print(msg)
        except Exception as err:
            self._console.print(
                f"  [bold yellow]Warning: Remote push skipped: {err}[/bold yellow]"
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

    def _on_model_retry(self, attempt: int, error: Exception, delay: float) -> None:
        """Render informative warning when Gemini encounters transient retryable error."""
        self._console.print(
            f"  [bold yellow]⚠️ Transient server error: {error}. Retrying in {delay:.1f}s "
            f"(attempt {attempt}/3)...[/bold yellow]"
        )

    def _resolve_retry_url(self, url: str | None, notebook_dir: str | None) -> str | None:
        """Extract playlist URL from direct argument or local notebook state."""
        if url:
            return url
        if not notebook_dir:
            return None
        nb_path = Path(notebook_dir).expanduser().resolve()
        state = self._state_manager.load_state(nb_path)
        result: str | None = state.get("playlistUrl")
        return result

    def _load_environment(self) -> None:
        """Load environment variables from local .env files if present and unset."""
        env_files = [
            Path(_WORKSPACE_ROOT) / self._ENV_LOCAL_FILE,
            Path(_WORKSPACE_ROOT) / self._ENV_FILE,
        ]
        for env_file in env_files:
            if env_file.is_file():
                self._load_env_file(env_file)

    def _load_env_file(self, env_path: Path) -> None:
        """Parse key-value pairs from an env file without overriding active environment."""
        try:
            with env_path.open(encoding="utf-8") as handle:
                for raw_line in handle:
                    line = raw_line.strip()
                    if (
                        not line
                        or line.startswith(self._ENV_COMMENT_PREFIX)
                        or self._ENV_DELIMITER not in line
                    ):
                        continue
                    key, val = line.split(self._ENV_DELIMITER, 1)
                    key = key.strip()
                    val = val.strip().strip("'\"")
                    if key and key not in os.environ:
                        os.environ[key] = val
        except OSError:
            pass


if __name__ == "__main__":
    cli = YouTubeCli()
    sys.exit(cli.run())
