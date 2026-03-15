/**
 * SoundtrackPlayer - MP3 playlist manager for sheeprunner.
 *
 * Loads track filenames from a static JSON manifest at
 * /soundtrack/manifest.json.  Falls back gracefully when the manifest is
 * absent or the soundtrack folder is empty so development continues without
 * any music files present.
 *
 * Routing
 * =======
 * HTMLAudioElement is connected to the Web Audio graph so the music volume
 * control in AudioManager applies uniformly.  The connection is established
 * once via createMediaElementSource — the audio element must NOT be connected
 * a second time (Web Audio requirement).
 *
 * Autoplay
 * ========
 * play() must be called from a user-gesture context (or after the user has
 * already interacted).  The AudioManager's init() satisfies the browser's
 * gesture requirement for the AudioContext; the HTMLAudioElement needs
 * its own user-gesture unlock which happens through the same flow.
 *
 * Track cycling
 * =============
 * Tracks advance automatically at 'ended' and loop the playlist.
 * next() and previous() are available for UI buttons.
 */

import type { AudioManager } from './AudioManager';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Path relative to the web root where the manifest lives. */
const MANIFEST_URL = '/soundtrack/manifest.json';

// ---------------------------------------------------------------------------
// SoundtrackPlayer
// ---------------------------------------------------------------------------

export class SoundtrackPlayer {
  private readonly audio: HTMLAudioElement;
  private tracks: string[] = [];
  private currentIndex: number = 0;

  /** True once createMediaElementSource has been called — must only happen once. */
  private _graphConnected = false;
  private _playing        = false;

  constructor(private readonly audioManager: AudioManager) {
    this.audio            = new Audio();
    this.audio.preload    = 'auto';
    this.audio.loop       = false;

    // Advance to next track when the current one finishes.
    this.audio.addEventListener('ended', this._onTrackEnded);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Load the track list from the public/soundtrack manifest.
   * Must be called before play() — safe to call multiple times.
   * Resolves immediately with an empty list if the folder is absent.
   */
  async loadTracks(): Promise<void> {
    try {
      const res = await fetch(MANIFEST_URL);
      if (!res.ok) {
        console.info('[SoundtrackPlayer] No manifest found — running without music.');
        return;
      }
      const data = (await res.json()) as unknown;
      if (!Array.isArray(data)) {
        console.warn('[SoundtrackPlayer] manifest.json is not an array.');
        return;
      }
      // Accept only string entries that look like audio filenames.
      this.tracks = (data as unknown[])
        .filter((e): e is string => typeof e === 'string')
        .filter((e) => /\.(mp3|ogg|wav|flac)$/i.test(e));

      if (this.tracks.length === 0) {
        console.info('[SoundtrackPlayer] Manifest found but contains no audio tracks.');
        return;
      }

      this.currentIndex = 0;
      console.info(`[SoundtrackPlayer] Loaded ${this.tracks.length} track(s).`);
    } catch (err) {
      // Network error — not fatal.
      console.info('[SoundtrackPlayer] Could not load soundtrack manifest:', err);
    }
  }

  /**
   * Start playback from the current track.
   * Does nothing if there are no tracks or the AudioContext is not ready.
   */
  play(): void {
    if (this.tracks.length === 0) return;
    if (this.audioManager.context === null) return;

    this._connectToGraph();
    this._loadCurrent();
    void this.audio.play().catch((e) => {
      console.warn('[SoundtrackPlayer] Playback blocked:', e);
    });
    this._playing = true;
  }

  /** Pause playback. */
  pause(): void {
    this.audio.pause();
    this._playing = false;
  }

  /** Skip to the next track (wraps to start). */
  next(): void {
    if (this.tracks.length === 0) return;
    this.currentIndex = (this.currentIndex + 1) % this.tracks.length;
    const wasPlaying  = this._playing;
    this._loadCurrent();
    if (wasPlaying) {
      void this.audio.play().catch(() => { /* blocked ok */ });
    }
  }

  /** Go to the previous track (wraps to end). */
  previous(): void {
    if (this.tracks.length === 0) return;
    this.currentIndex =
      (this.currentIndex - 1 + this.tracks.length) % this.tracks.length;
    const wasPlaying = this._playing;
    this._loadCurrent();
    if (wasPlaying) {
      void this.audio.play().catch(() => { /* blocked ok */ });
    }
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  /** Whether a track is currently playing. */
  get isPlaying(): boolean {
    return this._playing && !this.audio.paused;
  }

  /** The filename of the currently loaded track, or empty string if none. */
  get currentTrack(): string {
    return this.tracks[this.currentIndex] ?? '';
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Release the HTMLAudioElement and event listeners. */
  dispose(): void {
    this.audio.removeEventListener('ended', this._onTrackEnded);
    this.audio.pause();
    this.audio.src = '';
    this.tracks    = [];
    this._playing  = false;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Route the HTMLAudioElement through the AudioManager's music gain node.
   * This must only be called once per audio element (Web Audio restriction).
   */
  private _connectToGraph(): void {
    if (this._graphConnected) return;
    if (this.audioManager.context === null) return;
    if (this.audioManager.musicNode === null) return;

    try {
      const src = this.audioManager.context.createMediaElementSource(this.audio);
      src.connect(this.audioManager.musicNode);
      this._graphConnected = true;
    } catch (e) {
      console.warn('[SoundtrackPlayer] Failed to connect audio element to graph:', e);
    }
  }

  /** Set the audio element src to the current track. */
  private _loadCurrent(): void {
    const track = this.tracks[this.currentIndex];
    if (track === undefined) return;
    // Tracks are filenames relative to /soundtrack/.
    const url = track.startsWith('http') ? track : `/soundtrack/${track}`;
    if (this.audio.src !== new URL(url, window.location.href).href) {
      this.audio.src = url;
      this.audio.load();
    }
  }

  /** Auto-advance handler. */
  private readonly _onTrackEnded = (): void => {
    this.next();
    if (!this.audio.paused) {
      // next() already started playback — just keep _playing state accurate.
      this._playing = true;
    }
  };
}
