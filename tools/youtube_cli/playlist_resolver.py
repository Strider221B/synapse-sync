"""Resolves YouTube playlists to video lists and titles via web inspection."""

from __future__ import annotations

import json
import re
from typing import Any, ClassVar

import requests

from tools.youtube_cli.url_utils import UrlUtils


class PlaylistResolver:
    """Resolves individual video metadata from a YouTube playlist URL."""

    _BASE_PLAYLIST_URL: ClassVar[str] = "https://www.youtube.com/playlist?list="
    _INNERTUBE_BROWSE_URL: ClassVar[str] = "https://www.youtube.com/youtubei/v1/browse"
    _DEFAULT_INNERTUBE_KEY: ClassVar[str] = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"
    _DEFAULT_CLIENT_VERSION: ClassVar[str] = "2.20261023.01.00"
    _CLIENT_NAME_WEB: ClassVar[str] = "WEB"
    _REGEX_INITIAL_DATA: ClassVar[re.Pattern[str]] = re.compile(
        r"var\s+ytInitialData\s*=\s*({.+?});\s*</script>"
    )
    _REGEX_INITIAL_DATA_NO_CLOSE: ClassVar[re.Pattern[str]] = re.compile(
        r"var\s+ytInitialData\s*=\s*({.+?});(?:</script>|\n)"
    )
    _REGEX_FALLBACK_DATA: ClassVar[re.Pattern[str]] = re.compile(
        r"ytInitialData\s*=\s*({.+?});"
    )
    _REGEX_API_KEY: ClassVar[re.Pattern[str]] = re.compile(
        r"\"INNERTUBE_API_KEY\":\s*\"(AIzaSy[A-Za-z0-9_-]+)\""
    )
    _REGEX_CLIENT_VER: ClassVar[re.Pattern[str]] = re.compile(
        r"\"INNERTUBE_CLIENT_VERSION\":\s*\"([0-9.]+)\""
    )
    _USER_AGENT: ClassVar[str] = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    _TIMEOUT_SECONDS: ClassVar[int] = 15
    _MAX_CONTINUATIONS: ClassVar[int] = 50
    _VIDEO_ID_LENGTH: ClassVar[int] = 11
    _STATUS_OK: ClassVar[int] = 200
    _STATUS_NOT_FOUND: ClassVar[int] = 404
    _KEY_PLAYLIST_TITLE: ClassVar[str] = "playlist_title"
    _KEY_VIDEO_COUNT: ClassVar[str] = "video_count"
    _KEY_VIDEOS: ClassVar[str] = "videos"
    _KEY_VIDEO_ID: ClassVar[str] = "video_id"
    _KEY_TITLE: ClassVar[str] = "title"
    _KEY_URL: ClassVar[str] = "url"
    _KEY_INDEX: ClassVar[str] = "index"
    _DEFAULT_TITLE: ClassVar[str] = "YouTube Playlist"
    _DEFAULT_VIDEO_TITLE: ClassVar[str] = "Untitled Video"
    _RENDERER_KEY: ClassVar[str] = "playlistVideoRenderer"
    _LOCKUP_KEY: ClassVar[str] = "lockupViewModel"

    def __init__(
        self,
        url_utils: UrlUtils | None = None,
        session: requests.Session | None = None,
    ) -> None:
        """Initialize PlaylistResolver with URL utility and optional HTTP session."""
        self._url_utils = url_utils if url_utils is not None else UrlUtils()
        self._session = session if session is not None else requests.Session()
        if hasattr(self._session, "headers") and hasattr(self._session.headers, "update"):
            self._session.headers.update({"User-Agent": self._USER_AGENT})

    def resolve(self, playlist_url: str) -> dict[str, Any]:
        """Fetch and extract all video entries and title from a YouTube playlist."""
        playlist_id = self._url_utils.extract_playlist_id(playlist_url)
        if not playlist_id:
            raise ValueError(f"Invalid YouTube playlist URL: {playlist_url}")

        html_text = self._fetch_playlist_html(playlist_id)
        data = self._parse_initial_data(html_text)
        self._check_for_playlist_errors(data)

        title = self._extract_playlist_title(data)
        videos = self._extract_videos(data)
        token = self._extract_continuation_token(data)
        if token:
            videos = self._fetch_all_continuations(html_text, token, videos)

        if not videos:
            raise ValueError("No videos found in playlist or playlist is empty/private")

        return {
            self._KEY_PLAYLIST_TITLE: title,
            self._KEY_VIDEO_COUNT: len(videos),
            self._KEY_VIDEOS: videos,
        }

    def _fetch_playlist_html(self, playlist_id: str) -> str:
        """Fetch the playlist landing page HTML."""
        target_url = f"{self._BASE_PLAYLIST_URL}{playlist_id}"
        try:
            response = self._session.get(target_url, timeout=self._TIMEOUT_SECONDS)
            if response.status_code == self._STATUS_NOT_FOUND:
                raise ValueError("Playlist not found or is private")
            response.raise_for_status()
            return response.text
        except requests.RequestException as err:
            raise ConnectionError(f"Failed to connect to YouTube playlist: {err}") from err

    def _parse_initial_data(self, html_text: str) -> dict[str, Any]:
        """Extract and decode ytInitialData JSON object embedded in HTML."""
        patterns = (
            self._REGEX_INITIAL_DATA,
            self._REGEX_INITIAL_DATA_NO_CLOSE,
            self._REGEX_FALLBACK_DATA,
        )
        match = None
        for pattern in patterns:
            match = pattern.search(html_text)
            if match:
                break
        if not match:
            raise ValueError("Failed to parse playlist data from YouTube")
        try:
            parsed: dict[str, Any] = json.loads(match.group(1))
            return parsed
        except json.JSONDecodeError as err:
            raise ValueError(f"Invalid JSON in YouTube playlist page: {err}") from err

    def _check_for_playlist_errors(self, data: dict[str, Any]) -> None:
        """Inspect data for alerts indicating private or non-existent playlist."""
        alerts = data.get("alerts", [])
        for alert in alerts:
            alert_renderer = alert.get("alertRenderer", {})
            text_block = alert_renderer.get("text", {})
            msg = text_block.get("simpleText") or "".join(
                r.get("text", "") for r in text_block.get("runs", [])
            )
            lowered = msg.lower()
            if "private" in lowered or "exist" in lowered or "unavailable" in lowered:
                raise ValueError(f"Playlist unavailable: {msg}")

    def _extract_playlist_title(self, data: dict[str, Any]) -> str:
        """Extract the playlist title from metadata renderer or fallback fields."""
        title = self._extract_metadata_title(data)
        if title:
            return title
        title = self._extract_header_title(data)
        if title:
            return title
        title = self._extract_sidebar_or_microformat_title(data)
        return title if title else self._DEFAULT_TITLE

    def _extract_metadata_title(self, data: dict[str, Any]) -> str | None:
        """Extract title from playlistMetadataRenderer."""
        metadata = data.get("metadata", {}).get("playlistMetadataRenderer", {})
        title = metadata.get("title")
        return str(title) if title else None

    def _extract_header_title(self, data: dict[str, Any]) -> str | None:
        """Extract title from pageHeaderRenderer or playlistHeaderRenderer."""
        page_header = data.get("header", {}).get("pageHeaderRenderer", {})
        if "pageTitle" in page_header:
            return str(page_header["pageTitle"])
        vm_text = (
            page_header.get("content", {})
            .get("pageHeaderViewModel", {})
            .get("title", {})
            .get("dynamicTextViewModel", {})
            .get("text", {})
            .get("content")
        )
        if vm_text:
            return str(vm_text)
        pl_header = data.get("header", {}).get("playlistHeaderRenderer", {}).get("title", {})
        if "simpleText" in pl_header:
            return str(pl_header["simpleText"])
        runs = pl_header.get("runs", [])
        return str(runs[0]["text"]) if runs and "text" in runs[0] else None

    def _extract_sidebar_or_microformat_title(self, data: dict[str, Any]) -> str | None:
        """Extract title from sidebar or microformat data."""
        sidebar_items = data.get("sidebar", {}).get("playlistSidebarRenderer", {}).get("items", [])
        if sidebar_items:
            primary_info = sidebar_items[0].get("playlistSidebarPrimaryInfoRenderer", {})
            title_obj = primary_info.get("title", {})
            runs = title_obj.get("runs", [])
            if runs and "text" in runs[0]:
                return str(runs[0]["text"])
            if "simpleText" in title_obj:
                return str(title_obj["simpleText"])
        mf_title = data.get("microformat", {}).get("microformatDataRenderer", {}).get("title")
        return str(mf_title) if mf_title else None

    def _extract_videos(self, data: dict[str, Any]) -> list[dict[str, Any]]:
        """Walk playlist structure to extract video items list."""
        raw_items = self._find_playlist_raw_items(data)
        if not raw_items:
            raw_items = self._fallback_find_raw_items(data)
        videos: list[dict[str, Any]] = []
        seen_ids: set[str] = set()
        for item in raw_items:
            parsed = self._parse_single_video_item(item, len(videos) + 1)
            if parsed and parsed[self._KEY_VIDEO_ID] not in seen_ids:
                seen_ids.add(parsed[self._KEY_VIDEO_ID])
                videos.append(parsed)
        return videos

    def _find_playlist_raw_items(self, data: dict[str, Any]) -> list[dict[str, Any]]:
        """Locate raw video item dictionaries in contents hierarchy."""
        results: list[dict[str, Any]] = []
        contents = data.get("contents", {})
        browse_results = contents.get("twoColumnBrowseResultsRenderer") or contents.get(
            "singleColumnBrowseResultsRenderer"
        )
        if not browse_results:
            return results
        for tab in browse_results.get("tabs", []):
            sec_list = tab.get("tabRenderer", {}).get("content", {}).get("sectionListRenderer", {})
            for section in sec_list.get("contents", []):
                item_sec = section.get("itemSectionRenderer", {}).get("contents", [])
                results.extend(self._unpack_section_contents(item_sec))
        return results

    def _unpack_section_contents(self, contents: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Extract video items from an itemSectionRenderer content list."""
        items: list[dict[str, Any]] = []
        for entry in contents:
            if self._RENDERER_KEY in entry or self._LOCKUP_KEY in entry:
                items.append(entry)
            elif "playlistVideoListRenderer" in entry:
                list_contents = entry["playlistVideoListRenderer"].get("contents", [])
                items.extend(list_contents)
        return items

    def _fallback_find_raw_items(self, data: Any) -> list[dict[str, Any]]:
        """Recursively scan data structure to find video renderers."""
        items: list[dict[str, Any]] = []
        if isinstance(data, dict):
            if self._RENDERER_KEY in data:
                items.append({self._RENDERER_KEY: data[self._RENDERER_KEY]})
            elif self._LOCKUP_KEY in data:
                items.append({self._LOCKUP_KEY: data[self._LOCKUP_KEY]})
            else:
                for val in data.values():
                    items.extend(self._fallback_find_raw_items(val))
        elif isinstance(data, list):
            for element in data:
                items.extend(self._fallback_find_raw_items(element))
        return items

    def _parse_single_video_item(
        self, item: dict[str, Any], next_index: int
    ) -> dict[str, Any] | None:
        """Parse video ID and title from a playlistVideoRenderer or lockupViewModel."""
        if self._RENDERER_KEY in item:
            renderer = item[self._RENDERER_KEY]
            vid_id = renderer.get("videoId")
            title = self._extract_legacy_title(renderer)
        elif self._LOCKUP_KEY in item:
            renderer = item[self._LOCKUP_KEY]
            vid_id = self._extract_lockup_video_id(renderer)
            title = self._extract_lockup_title(renderer)
        else:
            return None
        if not vid_id:
            return None
        return {
            self._KEY_VIDEO_ID: vid_id,
            self._KEY_TITLE: title,
            self._KEY_URL: self._url_utils.build_video_url(vid_id),
            self._KEY_INDEX: next_index,
        }

    def _extract_legacy_title(self, renderer: dict[str, Any]) -> str:
        """Extract title string from playlistVideoRenderer."""
        title_obj = renderer.get("title", {})
        if "simpleText" in title_obj:
            return str(title_obj["simpleText"])
        runs = title_obj.get("runs", [])
        if runs and "text" in runs[0]:
            return str(runs[0]["text"])
        return self._DEFAULT_VIDEO_TITLE

    def _extract_lockup_video_id(self, renderer: dict[str, Any]) -> str | None:
        """Extract video ID from a lockupViewModel."""
        content_id = renderer.get("contentId")
        if content_id and len(content_id) == self._VIDEO_ID_LENGTH:
            return str(content_id)
        cmd_context = (
            renderer.get("rendererContext", {})
            .get("commandContext", {})
            .get("onTap", {})
            .get("innertubeCommand", {})
        )
        vid_id = cmd_context.get("watchEndpoint", {}).get("videoId")
        return str(vid_id) if vid_id else None

    def _extract_lockup_title(self, renderer: dict[str, Any]) -> str:
        """Extract video title from lockupViewModel."""
        metadata = renderer.get("metadata", {}).get("lockupMetadataViewModel", {})
        title_content = metadata.get("title", {}).get("content")
        if title_content:
            return str(title_content)
        a11y_label = (
            renderer.get("rendererContext", {})
            .get("accessibilityContext", {})
            .get("label")
        )
        if a11y_label:
            return str(a11y_label)
        return self._DEFAULT_VIDEO_TITLE

    def _extract_continuation_token(self, data: Any) -> str | None:
        """Search for a continuation token in data structure."""
        if isinstance(data, dict):
            if "continuationItemViewModel" in data:
                return self._parse_continuation_command(data["continuationItemViewModel"])
            if "continuationItemRenderer" in data:
                return self._parse_continuation_endpoint(data["continuationItemRenderer"])
            for val in data.values():
                token = self._extract_continuation_token(val)
                if token:
                    return token
        elif isinstance(data, list):
            for elem in data:
                token = self._extract_continuation_token(elem)
                if token:
                    return token
        return None

    def _parse_continuation_command(self, model: dict[str, Any]) -> str | None:
        """Extract token from continuationItemViewModel."""
        cmd = (
            model.get("continuationCommand", {})
            .get("innertubeCommand", {})
            .get("continuationCommand", {})
        )
        token = cmd.get("token")
        return str(token) if token else None

    def _parse_continuation_endpoint(self, renderer: dict[str, Any]) -> str | None:
        """Extract token from continuationItemRenderer."""
        endpoint = renderer.get("continuationEndpoint", {}).get("continuationCommand", {})
        token = endpoint.get("token")
        return str(token) if token else None

    def _fetch_all_continuations(
        self, html_text: str, initial_token: str, existing_videos: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Paginate through continuation tokens to collect all videos."""
        api_key = self._extract_innertube_api_key(html_text)
        client_ver = self._extract_innertube_client_version(html_text)
        seen_ids = {v[self._KEY_VIDEO_ID] for v in existing_videos}
        videos = list(existing_videos)
        current_token: str | None = initial_token
        pages = 0

        while current_token and pages < self._MAX_CONTINUATIONS:
            pages += 1
            response_data = self._request_continuation_data(current_token, api_key, client_ver)
            if not response_data:
                break
            new_items = self._extract_continuation_items(response_data)
            self._append_new_videos(new_items, videos, seen_ids)
            current_token = self._extract_continuation_token(response_data)

        return videos

    def _request_continuation_data(
        self, token: str, api_key: str, client_ver: str
    ) -> dict[str, Any] | None:
        """Send POST request to YouTube browse continuation API."""
        url = f"{self._INNERTUBE_BROWSE_URL}?key={api_key}"
        payload: dict[str, Any] = {
            "context": {
                "client": {"clientName": self._CLIENT_NAME_WEB, "clientVersion": client_ver}
            },
            "continuation": token,
        }
        try:
            resp = self._session.post(url, json=payload, timeout=self._TIMEOUT_SECONDS)
            if resp.status_code != self._STATUS_OK:
                return None
            result: dict[str, Any] = resp.json()
            return result
        except (requests.RequestException, json.JSONDecodeError):
            return None

    def _append_new_videos(
        self, items: list[dict[str, Any]], videos: list[dict[str, Any]], seen_ids: set[str]
    ) -> None:
        """Parse raw continuation items and append unencountered videos."""
        for item in items:
            parsed = self._parse_single_video_item(item, len(videos) + 1)
            if parsed and parsed[self._KEY_VIDEO_ID] not in seen_ids:
                seen_ids.add(parsed[self._KEY_VIDEO_ID])
                videos.append(parsed)

    def _extract_continuation_items(self, response_data: dict[str, Any]) -> list[dict[str, Any]]:
        """Extract item list from onResponseReceivedActions."""
        items: list[dict[str, Any]] = []
        actions = response_data.get("onResponseReceivedActions", [])
        for action in actions:
            continuation_items = (
                action.get("appendContinuationItemsAction", {}).get("continuationItems", [])
                or action.get("reloadContinuationItemsCommand", {}).get("continuationItems", [])
            )
            items.extend(continuation_items)
        if not items:
            items = self._fallback_find_raw_items(response_data)
        return items

    def _extract_innertube_api_key(self, html_text: str) -> str:
        """Extract Innertube API key from HTML or return default."""
        match = self._REGEX_API_KEY.search(html_text)
        return match.group(1) if match else self._DEFAULT_INNERTUBE_KEY

    def _extract_innertube_client_version(self, html_text: str) -> str:
        """Extract Innertube client version from HTML or return default."""
        match = self._REGEX_CLIENT_VER.search(html_text)
        return match.group(1) if match else self._DEFAULT_CLIENT_VERSION
