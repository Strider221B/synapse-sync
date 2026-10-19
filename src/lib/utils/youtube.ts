/**
 * Utility functions for parsing and validating YouTube video and playlist URLs.
 */
export class YouTubeUrlUtils {
  private static readonly _VIDEO_ID_REGEX =
    /(?:v=|\/embed\/|\/watch\?v=|\/v\/|youtu\.be\/|\/shorts\/|^)([a-zA-Z0-9_-]{11})(?:[?&/]|$)/;
  private static readonly _PLAYLIST_ID_REGEX = /[?&]list=([a-zA-Z0-9_-]+)/;
  private static readonly _BARE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
  private static readonly _CANONICAL_WATCH_URL = 'https://www.youtube.com/watch?v=';

  /**
   * Determine whether a URL or identifier points to a YouTube video.
   */
  public isVideoUrl(url: string): boolean {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (this.isPlaylistUrl(trimmed) && !trimmed.includes('v=')) {
      return false;
    }
    return this.extractVideoId(trimmed) !== null;
  }

  /**
   * Determine whether a URL contains a YouTube playlist identifier.
   */
  public isPlaylistUrl(url: string): boolean {
    if (!url || typeof url !== 'string') return false;
    return this.extractPlaylistId(url.trim()) !== null;
  }

  /**
   * Extract the 11-character video ID from a YouTube URL or return the ID if already bare.
   */
  public extractVideoId(url: string): string | null {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (YouTubeUrlUtils._BARE_ID_REGEX.test(trimmed)) {
      return trimmed;
    }
    const match = trimmed.match(YouTubeUrlUtils._VIDEO_ID_REGEX);
    return match ? match[1] : null;
  }

  /**
   * Extract the playlist ID parameter from a YouTube URL.
   */
  public extractPlaylistId(url: string): string | null {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    const match = trimmed.match(YouTubeUrlUtils._PLAYLIST_ID_REGEX);
    return match ? match[1] : null;
  }

  /**
   * Build a canonical watch URL from an 11-character video ID.
   */
  public buildVideoUrl(videoId: string): string {
    const trimmed = (videoId || '').trim();
    if (!YouTubeUrlUtils._BARE_ID_REGEX.test(trimmed)) {
      throw new Error(`Invalid YouTube video ID format: ${videoId}`);
    }
    return `${YouTubeUrlUtils._CANONICAL_WATCH_URL}${trimmed}`;
  }
}

export const youtubeUrlUtils = new YouTubeUrlUtils();
