import { MODES, selectRandomVideo, formatDuration } from './catalog.js';

let videos = [];
let channels = [];

const mode = document.body.dataset.mode;
const byId = id => document.getElementById(id);
const state = { current: null, creator: 'all', expanded: false, player: null, ready: false, unavailable: new Set(), loadVersion: 0 };
const modeVideos = () => videos.filter(video => Array.isArray(video.modes) && video.modes.includes(mode));
const eligible = () => modeVideos().filter(video => !state.unavailable.has(video.id) && (state.creator === 'all' || video.creatorKey === state.creator));

function renderModeNavigation() {
  for (const link of document.querySelectorAll('.mode-nav a[data-mode]')) {
    if (link.dataset.mode === mode) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

function renderLibrary() {
  const list = eligible();
  const grid = byId('video-grid');
  grid.replaceChildren();
  byId('empty-state').hidden = list.length !== 0;
  byId('shuffle').disabled = list.length === 0;
  const more = byId('library-more');
  more.hidden = list.length <= 8;
  more.textContent = state.expanded ? 'Show less' : `Show all ${list.length} videos`;
  more.setAttribute('aria-expanded', String(state.expanded));
  for (const video of (state.expanded ? list : list.slice(0, 8))) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'video-card' + (state.current?.id === video.id ? ' selected' : '');
    card.dataset.videoId = video.id;
    card.setAttribute('aria-label', `Play: ${video.title}, ${video.creator}, ${formatDuration(video.durationSeconds)}`);
    card.setAttribute('aria-pressed', String(state.current?.id === video.id));

    const imageWrap = document.createElement('span');
    imageWrap.className = 'card-image';
    const thumbnail = document.createElement('img');
    thumbnail.src = `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;
    thumbnail.alt = '';
    thumbnail.loading = 'lazy';
    thumbnail.referrerPolicy = 'strict-origin-when-cross-origin';
    thumbnail.addEventListener('error', () => { thumbnail.hidden = true; }, { once: true });
    imageWrap.append(thumbnail);
    const duration = document.createElement('span');
    duration.className = 'card-duration';
    duration.textContent = formatDuration(video.durationSeconds);
    imageWrap.append(duration);
    if (state.current?.id === video.id) {
      const now = document.createElement('span');
      now.className = 'card-now';
      now.textContent = 'SELECTED';
      imageWrap.append(now);
    }
    const play = document.createElement('span');
    play.className = 'card-play';
    play.setAttribute('aria-hidden', 'true');
    play.innerHTML = '<svg viewBox="0 0 20 20"><path d="M5 3 17 10 5 17Z"/></svg>';
    imageWrap.append(play);
    const body = document.createElement('span');
    body.className = 'card-body';
    for (const [className, text] of [['card-creator', video.creator], ['card-title', video.title]]) {
      const element = document.createElement('span');
      element.className = className;
      element.textContent = text;
      body.append(element);
    }
    card.append(imageWrap, body);
    card.addEventListener('click', () => {
      chooseVideo(video);
      byId('watch').focus({ preventScroll: true });
      byId('today').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    });
    grid.append(card);
  }
}

function updateSelected(video) {
  byId('current-title').textContent = video.title;
  byId('current-author').textContent = video.creator;
  renderLibrary();
}

function iframeFor(video) {
  const frame = document.createElement('iframe');
  frame.id = 'youtube-player';
  frame.title = `${video.title} — ${video.creator}`;
  const url = new URL(`https://www.youtube-nocookie.com/embed/${video.id}`);
  url.search = new URLSearchParams({ autoplay: '1', mute: '1', playsinline: '1', hl: 'en', enablejsapi: '1', rel: '0', origin: location.origin });
  frame.src = url.toString();
  frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
  frame.allowFullscreen = true;
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  return frame;
}

function chooseVideo(video) {
  if (!video || !video.modes.includes(mode) || state.unavailable.has(video.id)) return;
  state.current = video;
  updateSelected(video);
  if (state.player && state.ready) {
    const frame = state.player.getIframe();
    frame.title = `${video.title} — ${video.creator}`;
    // Reuse the player so its native sound and volume settings are preserved.
    state.player.loadVideoById({ videoId: video.id });
    return;
  }
  // The plain iframe remains usable if a blocker prevents the optional Player API.
  if (state.player) { state.player.destroy(); state.player = null; }
  state.ready = false;
  state.loadVersion += 1;
  byId('video-frame').replaceChildren(iframeFor(video));
  if (window.YT?.Player) attachPlayer();
}

function validatePlayerVideo() {
  if (!state.ready || !state.player || !state.current) return true;
  const actualId = state.player.getVideoData()?.video_id;
  if (actualId && actualId !== state.current.id) {
    // Suggestions selected inside YouTube must not bypass our curated catalogue.
    state.player.pauseVideo();
    return false;
  }
  return true;
}

function attachPlayer() {
  const frame = byId('youtube-player');
  if (!window.YT?.Player || !frame || state.player) return;
  const version = state.loadVersion;
  state.player = new window.YT.Player(frame, {
    host: 'https://www.youtube-nocookie.com',
    events: {
      onReady(event) {
        if (version !== state.loadVersion) return;
        state.ready = true;
        event.target.mute();
        if (validatePlayerVideo()) event.target.playVideo();
      },
      onStateChange(event) {
        if (version !== state.loadVersion) return;
        if (event.data === 1) validatePlayerVideo();
      },
      onError(event) {
        if (version !== state.loadVersion || ![100, 101, 150].includes(event.data)) return;
        const failedId = event.target.getVideoData()?.video_id;
        if (failedId && videos.some(video => video.id === failedId)) {
          state.unavailable.add(failedId);
          renderLibrary();
        }
      }
    }
  });
}

byId('shuffle').addEventListener('click', () => {
  const video = selectRandomVideo(eligible());
  if (video) chooseVideo(video);
});
byId('library-more').addEventListener('click', () => {
  state.expanded = !state.expanded;
  renderLibrary();
});

function renderChannels() {
  const filters = byId('creator-filters');
  const currentModeVideos = modeVideos();
  const currentModeChannels = channels.filter(channel => currentModeVideos.some(video => video.creatorKey === channel.key));
  filters.replaceChildren();
  for (const channel of [{ key: 'all', name: 'All' }, ...currentModeChannels]) {
    const chip = document.createElement('div');
    chip.className = 'channel-chip' + (channel.key === state.creator ? ' active' : '');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'filter' + (channel.key === state.creator ? ' active' : '');
    button.dataset.creator = channel.key;
    button.textContent = channel.name;
    button.setAttribute('aria-pressed', String(channel.key === state.creator));
    button.addEventListener('click', () => {
      state.creator = channel.key;
      state.expanded = false;
      for (const item of filters.querySelectorAll('button')) {
        const active = item === button;
        item.classList.toggle('active', active);
        item.parentElement.classList.toggle('active', active);
        item.setAttribute('aria-pressed', String(active));
      }
      renderLibrary();
    });
    chip.append(button);
    if (channel.url) {
      const link = document.createElement('a');
      link.className = 'channel-link';
      link.href = channel.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', `Open ${channel.name} on YouTube (opens in a new tab)`);
      link.title = `Open ${channel.name} on YouTube`;
      const arrow = document.createElement('span');
      arrow.textContent = '↗';
      arrow.setAttribute('aria-hidden', 'true');
      link.append(arrow);
      chip.append(link);
    }
    filters.append(chip);
  }
}

async function init() {
  try {
    if (!MODES.includes(mode)) throw new Error('The page mode is invalid.');
    const response = await fetch(new URL('./catalog.json', import.meta.url), { cache: 'no-cache' });
    if (!response.ok) throw new Error('The video catalogue could not be fetched.');
    const catalog = await response.json();
    if (!Array.isArray(catalog?.videos) || !Array.isArray(catalog?.channels)) throw new Error('The video catalogue has an invalid format.');
    ({ videos, channels } = catalog);
    if (!videos.length) throw new Error('The video catalogue is empty.');
    renderModeNavigation();
    renderChannels();
    renderLibrary();
    const firstVideo = selectRandomVideo(eligible());
    if (!firstVideo) {
      byId('watch').hidden = true;
      return;
    }
    chooseVideo(firstVideo);
    if (!window.YT?.Player) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.append(script);
    }
  } catch (error) {
    console.error('Unable to load the video catalogue:', error);
    byId('shuffle').disabled = true;
    byId('video-frame').closest('.watch-section').hidden = true;
    byId('catalog-error').hidden = false;
  }
}

window.onYouTubeIframeAPIReady = attachPlayer;
renderModeNavigation();
init();
