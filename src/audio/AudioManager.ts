/**
 * AudioManager - Web Audio API wrapper for sheeprunner.
 *
 * All sound effects are procedurally generated via oscillators and noise.
 * No external audio files are required for SFX.
 *
 * Architecture
 * ============
 * A single AudioContext is created lazily on the first call to init().
 * The graph is:
 *
 *   sfxGain ──┐
 *             ├──► masterGain ──► ctx.destination
 *   musicGain ─┘
 *
 * SFX nodes are created per-sound and self-disconnect on completion.
 * Music is fed through musicGain which is exposed for the SoundtrackPlayer.
 *
 * Browser autoplay policy
 * =======================
 * init() must be called from a user-gesture handler (click, tap, keydown).
 * Subsequent calls are no-ops once the context is running.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OscWave = OscillatorType;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Footstep pitch varies each step to avoid mechanical sameness. */
const FOOTSTEP_PITCHES  = [140, 160, 130, 155, 145] as const;

/** Quick envelope shaper — attack time in seconds. */
const SNAP_ATTACK  = 0.002;

// ---------------------------------------------------------------------------
// AudioManager
// ---------------------------------------------------------------------------

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;

  /** Index into FOOTSTEP_PITCHES for slight variation. */
  private _footstepIdx = 0;

  // ---------------------------------------------------------------------------
  // Initialisation
  // ---------------------------------------------------------------------------

  /**
   * Create the AudioContext and connect the gain chain.
   * Safe to call multiple times — only the first call does real work.
   * Must be triggered from a user gesture per browser autoplay policy.
   */
  async init(): Promise<void> {
    if (this.ctx !== null) return;

    this.ctx = new AudioContext();

    // Resume immediately if the browser left it suspended.
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.8;

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 1.0;

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.6;

    this.sfxGain.connect(this.masterGain);
    this.musicGain.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
  }

  // ---------------------------------------------------------------------------
  // Buffer playback
  // ---------------------------------------------------------------------------

  /**
   * Play a pre-decoded AudioBuffer as a one-shot SFX.
   * @param buffer       Decoded audio data.
   * @param volume       Relative volume scalar (default 1.0).
   * @param playbackRate Pitch multiplier (default 1.0).
   */
  playSFX(buffer: AudioBuffer, volume: number = 1.0, playbackRate: number = 1.0): void {
    if (this.ctx === null || this.sfxGain === null) return;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = playbackRate;

    const gain = this.ctx.createGain();
    gain.gain.value = volume;

    src.connect(gain);
    gain.connect(this.sfxGain);
    src.start();

    // Self-clean when done.
    src.onended = () => {
      try { src.disconnect(); gain.disconnect(); } catch { /* already disposed */ }
    };
  }

  // ---------------------------------------------------------------------------
  // Procedural tone generator
  // ---------------------------------------------------------------------------

  /**
   * Generate and immediately play a simple oscillator tone.
   *
   * @param frequency   Fundamental frequency in Hz.
   * @param duration    Total duration including release tail (seconds).
   * @param type        Oscillator waveform ('sine' | 'square' | 'sawtooth' | 'triangle').
   * @param volume      Peak amplitude [0..1].
   */
  playTone(
    frequency: number,
    duration: number,
    type: OscWave = 'sine',
    volume: number = 0.4,
  ): void {
    if (this.ctx === null || this.sfxGain === null) return;

    const now = this.ctx.currentTime;
    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type      = type;
    osc.frequency.setValueAtTime(frequency, now);

    // Punch envelope: instant attack, exponential release.
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + SNAP_ATTACK);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + duration + 0.01);
    osc.onended = () => {
      try { osc.disconnect(); gain.disconnect(); } catch { /* ok */ }
    };
  }

  // ---------------------------------------------------------------------------
  // Procedural SFX library
  // ---------------------------------------------------------------------------

  /**
   * Running footstep — a short low thud with a slight pitch that rotates
   * through a set of values so each step feels distinct.
   */
  playFootstep(): void {
    if (this.ctx === null || this.sfxGain === null) return;

    const now   = this.ctx.currentTime;
    const pitch = FOOTSTEP_PITCHES[this._footstepIdx % FOOTSTEP_PITCHES.length] as number;
    this._footstepIdx++;

    // Low thump via sine oscillator.
    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.5, now + 0.07);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.1);
    osc.onended = () => { try { osc.disconnect(); gain.disconnect(); } catch { /* ok */ } };

    // Soft high transient noise layer (crunchy terrain feel).
    this._playNoiseBurst(0.08, 0.05, 2800, 400);
  }

  /**
   * Pickup chime — ascending major-third arpeggio on triangle waves.
   * Bright and happy, appropriate for collecting goodies.
   */
  playPickup(): void {
    if (this.ctx === null) return;

    const baseFreq = 880;
    const notes    = [1, 1.26, 1.5]; // root, major-third, fifth
    notes.forEach((ratio, i) => {
      this.playTone(baseFreq * ratio, 0.25, 'triangle', 0.25 - i * 0.04);
      // stagger each note by 60 ms
      const delayed = this.ctx!.currentTime + i * 0.06;
      this._scheduleTone(baseFreq * ratio, delayed, 0.20, 'triangle', 0.25 - i * 0.04);
    });
  }

  /**
   * Countdown beep — a crisp sine ping used for the 3, 2, 1 phase.
   */
  playCountdownBeep(): void {
    this.playTone(660, 0.18, 'sine', 0.5);
  }

  /**
   * GO signal — ascending two-tone fanfare that cuts through.
   * Higher pitched and longer than the countdown beep.
   */
  playCountdownGo(): void {
    if (this.ctx === null) return;
    const now = this.ctx.currentTime;
    this._scheduleTone(880,  now,        0.15, 'sawtooth', 0.45);
    this._scheduleTone(1320, now + 0.12, 0.35, 'sawtooth', 0.40);
    // Warm sine underneath.
    this._scheduleTone(440,  now,        0.40, 'sine',     0.30);
  }

  /**
   * Race finish — triumphant ascending arpeggio.
   */
  playFinish(): void {
    if (this.ctx === null) return;
    const now = this.ctx.currentTime;
    const pattern = [440, 554, 659, 880, 1108];
    pattern.forEach((f, i) => {
      const t = now + i * 0.10;
      this._scheduleTone(f, t, 0.3 + i * 0.04, 'triangle', 0.35);
    });
    // Big sine boom.
    this._scheduleTone(110, now, 0.6, 'sine', 0.5);
  }

  /**
   * Bonk — the classic low-frequency "oof" when stamina runs out.
   * Two low oscillators pitch-bending down hard.
   */
  playBonk(): void {
    if (this.ctx === null || this.sfxGain === null) return;
    const now  = this.ctx.currentTime;

    const mkBonk = (freq: number, vol: number) => {
      const osc  = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.3, now + 0.25);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now);
      osc.stop(now + 0.32);
      osc.onended = () => { try { osc.disconnect(); gain.disconnect(); } catch { /* ok */ } };
    };

    mkBonk(220, 0.5);
    mkBonk(180, 0.35);
    this._playNoiseBurst(0.12, 0.08, 600, 300);
  }

  /**
   * Bass hit — punchy sub-bass thump used when the player is near a speaker.
   * Sine oscillator with a steep pitch envelope to mimic a 808-style kick.
   */
  playBassHit(): void {
    if (this.ctx === null || this.sfxGain === null) return;
    const now  = this.ctx.currentTime;

    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.15);

    gain.gain.setValueAtTime(0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    // Light distortion via waveshaper.
    const shaper = this._makeDistortion(8);
    osc.connect(shaper);
    shaper.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.25);
    osc.onended = () => {
      try { osc.disconnect(); shaper.disconnect(); gain.disconnect(); } catch { /* ok */ }
    };
  }

  // ---------------------------------------------------------------------------
  // Volume controls
  // ---------------------------------------------------------------------------

  /** Set master output volume [0..1]. */
  setMasterVolume(v: number): void {
    if (this.masterGain === null) return;
    this.masterGain.gain.setTargetAtTime(
      Math.max(0, Math.min(1, v)),
      this.ctx?.currentTime ?? 0,
      0.05,
    );
  }

  /** Set SFX bus volume [0..1]. */
  setSFXVolume(v: number): void {
    if (this.sfxGain === null) return;
    this.sfxGain.gain.setTargetAtTime(
      Math.max(0, Math.min(1, v)),
      this.ctx?.currentTime ?? 0,
      0.05,
    );
  }

  /** Set music bus volume [0..1]. */
  setMusicVolume(v: number): void {
    if (this.musicGain === null) return;
    this.musicGain.gain.setTargetAtTime(
      Math.max(0, Math.min(1, v)),
      this.ctx?.currentTime ?? 0,
      0.05,
    );
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  /** The underlying AudioContext, or null before init(). */
  get context(): AudioContext | null {
    return this.ctx;
  }

  /**
   * The music gain node. Expose so SoundtrackPlayer can route its HTMLAudio
   * through the Web Audio graph for unified volume control.
   */
  get musicNode(): GainNode | null {
    return this.musicGain;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Close the AudioContext and release all resources. */
  dispose(): void {
    if (this.ctx === null) return;
    void this.ctx.close();
    this.ctx        = null;
    this.masterGain = null;
    this.sfxGain    = null;
    this.musicGain  = null;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Schedule a tone to play at an absolute AudioContext time.
   * Used internally for multi-note sounds that need precise timing.
   */
  private _scheduleTone(
    frequency: number,
    startTime: number,
    duration: number,
    type: OscWave,
    volume: number,
  ): void {
    if (this.ctx === null || this.sfxGain === null) return;

    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, startTime);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + SNAP_ATTACK);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
    osc.onended = () => {
      try { osc.disconnect(); gain.disconnect(); } catch { /* ok */ }
    };
  }

  /**
   * Create a short burst of filtered white noise — useful for transient
   * "character" on footsteps and other percussive hits.
   *
   * @param duration     Total noise duration (seconds).
   * @param attackTime   Fade-in time (seconds).
   * @param highpass     High-pass filter cutoff (Hz) — removes muddiness.
   * @param lowpass      Low-pass filter cutoff (Hz) — tightens the noise band.
   */
  private _playNoiseBurst(
    duration: number,
    attackTime: number,
    highpass: number,
    lowpass: number,
  ): void {
    if (this.ctx === null || this.sfxGain === null) return;

    const sampleRate  = this.ctx.sampleRate;
    const frameCount  = Math.ceil(sampleRate * duration);
    const buffer      = this.ctx.createBuffer(1, frameCount, sampleRate);
    const data        = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) data[i] = Math.random() * 2 - 1;

    const src  = this.ctx.createBufferSource();
    src.buffer = buffer;

    const hp   = this.ctx.createBiquadFilter();
    hp.type    = 'highpass';
    hp.frequency.value = highpass;

    const lp   = this.ctx.createBiquadFilter();
    lp.type    = 'lowpass';
    lp.frequency.value = lowpass;

    const gain = this.ctx.createGain();
    const now  = this.ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + attackTime);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    src.connect(hp);
    hp.connect(lp);
    lp.connect(gain);
    gain.connect(this.sfxGain);

    src.start(now);
    src.onended = () => {
      try { src.disconnect(); hp.disconnect(); lp.disconnect(); gain.disconnect(); } catch { /* ok */ }
    };
  }

  /**
   * Build a soft-clip WaveShaper for mild distortion.
   * @param amount  Distortion coefficient — higher = more crunch.
   */
  private _makeDistortion(amount: number): WaveShaperNode {
    const ctx    = this.ctx!;
    const shaper = ctx.createWaveShaper();
    const curve  = new Float32Array(256);
    const k      = amount;
    for (let i = 0; i < 256; i++) {
      const x   = (i * 2) / 256 - 1;
      curve[i]  = ((Math.PI + k) * x) / (Math.PI + k * Math.abs(x));
    }
    shaper.curve  = curve;
    shaper.oversample = '2x';
    return shaper;
  }
}
