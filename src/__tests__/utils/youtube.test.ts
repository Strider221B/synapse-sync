import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { YouTubeUrlUtils } from '../../lib/utils/youtube';

describe('YouTubeUrlUtils', () => {
  const utils = new YouTubeUrlUtils();
  const sampleVideoId = 'jGwO_UgTS7I';
  const samplePlaylistId = 'PLoROMvodv4rMiGQp3WXShtMGgzqpfVfbU';
  const watchUrl = `https://www.youtube.com/watch?v=${sampleVideoId}`;
  const shortUrl = `https://youtu.be/${sampleVideoId}`;
  const embedUrl = `https://www.youtube.com/embed/${sampleVideoId}`;
  const shortsUrl = `https://www.youtube.com/shorts/${sampleVideoId}`;
  const playlistUrl = `https://www.youtube.com/playlist?list=${samplePlaylistId}`;

  it('validates video URLs correctly', () => {
    assert.equal(utils.isVideoUrl(watchUrl), true);
    assert.equal(utils.isVideoUrl(shortUrl), true);
    assert.equal(utils.isVideoUrl(embedUrl), true);
    assert.equal(utils.isVideoUrl(shortsUrl), true);
    assert.equal(utils.isVideoUrl(sampleVideoId), true);
    assert.equal(utils.isVideoUrl(playlistUrl), false);
    assert.equal(utils.isVideoUrl('https://example.com'), false);
    assert.equal(utils.isVideoUrl(''), false);
  });

  it('validates playlist URLs correctly', () => {
    assert.equal(utils.isPlaylistUrl(playlistUrl), true);
    assert.equal(utils.isPlaylistUrl(`${watchUrl}&list=${samplePlaylistId}`), true);
    assert.equal(utils.isPlaylistUrl(watchUrl), false);
    assert.equal(utils.isPlaylistUrl(''), false);
  });

  it('extracts video ID across multiple URL patterns', () => {
    assert.equal(utils.extractVideoId(watchUrl), sampleVideoId);
    assert.equal(utils.extractVideoId(shortUrl), sampleVideoId);
    assert.equal(utils.extractVideoId(embedUrl), sampleVideoId);
    assert.equal(utils.extractVideoId(shortsUrl), sampleVideoId);
    assert.equal(utils.extractVideoId(sampleVideoId), sampleVideoId);
    assert.equal(utils.extractVideoId('not-a-video-url'), null);
    assert.equal(utils.extractVideoId('https://google.com/test'), null);
  });

  it('extracts playlist ID from query parameters', () => {
    assert.equal(utils.extractPlaylistId(playlistUrl), samplePlaylistId);
    assert.equal(utils.extractPlaylistId(watchUrl), null);
    assert.equal(utils.extractPlaylistId(''), null);
  });

  it('builds canonical watch URL', () => {
    assert.equal(utils.buildVideoUrl(sampleVideoId), watchUrl);
  });

  it('throws error when building video URL with invalid ID', () => {
    assert.throws(
      () => utils.buildVideoUrl('invalid-id'),
      /Invalid YouTube video ID format/
    );
  });
});
