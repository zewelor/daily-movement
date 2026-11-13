Math.random = () => 0;
window.testPlayers = [];
window.YT = { Player: class {
  constructor(frame, { events }) {
    this.frame = frame;
    this.events = events;
    this.actualId = new URL(frame.src).pathname.split('/').pop();
    this.requestedId = this.actualId;
    this.pauses = 0;
    this.frame.src = 'about:blank';
    window.testPlayers.push(this);
    queueMicrotask(() => events.onReady({ target: this }));
  }
  getIframe() { return this.frame; }
  getVideoData() { return { video_id: this.actualId }; }
  getDuration() { return 900; }
  mute() {}
  playVideo() {}
  pauseVideo() { this.pauses++; }
  loadVideoById({ videoId }) {
    this.requestedId = videoId;
    if (!this.defer) this.actualId = videoId;
  }
  destroy() { this.frame.remove(); }
} };
