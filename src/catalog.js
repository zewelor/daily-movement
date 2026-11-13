const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_HANDLE = /^@[\p{L}\p{N}._-]+$/u;
export const MODES = ['morning', 'day'];
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = value => typeof value === 'string' && value.trim().length > 0;

export function videoIdFromUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid YouTube URL: ${JSON.stringify(value)}`);
  }
  const id = url.hostname === 'youtu.be' ? url.pathname.slice(1)
    : ['www.youtube.com', 'youtube.com'].includes(url.hostname) && url.pathname === '/watch' ? url.searchParams.get('v') : null;
  if (url.protocol !== 'https:' || !VIDEO_ID.test(id ?? '')) {
    throw new Error(`Invalid YouTube video URL: ${JSON.stringify(value)}`);
  }
  return id;
}

export function readVideoList(groups) {
  if (!isObject(groups)) throw new Error('videos.json must map channel handles to arrays of videos.');
  const entries = [];
  const handles = new Set();
  const ids = new Set();
  for (const [channel, videos] of Object.entries(groups)) {
    if (!CHANNEL_HANDLE.test(channel) || !Array.isArray(videos)) throw new Error(`Invalid channel group: ${channel}`);
    if (handles.has(channel.toLowerCase())) throw new Error(`Duplicate channel group: ${channel}`);
    handles.add(channel.toLowerCase());
    for (const video of videos) {
      if (!isObject(video) || Object.keys(video).some(key => !['url', 'modes'].includes(key))) {
        throw new Error(`Each video in ${channel} must contain only url and modes.`);
      }
      const id = videoIdFromUrl(video.url);
      if (ids.has(id)) throw new Error(`Duplicate video ID: ${id}`);
      ids.add(id);
      if (!Array.isArray(video.modes) || !video.modes.length || video.modes.some(mode => !MODES.includes(mode)) || new Set(video.modes).size !== video.modes.length) {
        throw new Error(`Invalid modes for ${id}: choose morning, day, or both without duplicates.`);
      }
      entries.push({ id, channel, modes: [...video.modes] });
    }
  }
  if (!entries.length) throw new Error('videos.json must contain at least one video.');
  return entries;
}

export function validateMetadata(record, { id, channel }) {
  if (!isObject(record)) throw new Error(`Missing metadata for ${id}. Run npm run sync:videos.`);
  if (Object.keys(record).some(key => !['title', 'author', 'channel', 'durationSeconds'].includes(key))) {
    throw new Error(`Unexpected metadata fields for ${id}.`);
  }
  if (!isText(record.title) || !isText(record.author)) throw new Error(`Metadata for ${id} needs a non-empty title and author.`);
  if (typeof record.channel !== 'string' || record.channel.toLowerCase() !== channel.toLowerCase()) {
    throw new Error(`Video ${id} does not belong to channel ${channel}.`);
  }
  if (!Number.isFinite(record.durationSeconds) || record.durationSeconds <= 0) {
    throw new Error(`Metadata duration for ${id} must be a finite number greater than zero.`);
  }
}

export function buildCatalog(groups, metadata) {
  const entries = readVideoList(groups);
  if (!isObject(metadata)) throw new Error('Video metadata must be an object keyed by video ID.');
  const channels = new Map();
  const videos = entries.map(entry => {
    const record = metadata[entry.id];
    validateMetadata(record, entry);
    if (!channels.has(entry.channel)) {
      channels.set(entry.channel, { key: entry.channel, name: record.author, url: `https://www.youtube.com/@${encodeURIComponent(entry.channel.slice(1))}/videos` });
    }
    return { id: entry.id, title: record.title, creator: record.author, creatorKey: entry.channel, durationSeconds: record.durationSeconds, modes: entry.modes };
  });
  return { channels: [...channels.values()], videos };
}

export function formatDuration(seconds) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export function selectRandomVideo(candidates, random = Math.random) {
  const channels = new Map();
  for (const video of candidates) {
    if (!channels.has(video.creatorKey)) channels.set(video.creatorKey, []);
    channels.get(video.creatorKey).push(video);
  }
  const pools = [...channels.values()];
  if (!pools.length) return null;
  const pool = pools[Math.floor(random() * pools.length)];
  return pool[Math.floor(random() * pool.length)];
}
