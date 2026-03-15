/**
 * MusicEventSystem - Drum-and-bass speaker stacks along the race track.
 *
 * Purpose
 * =======
 * Places speaker-stack props at musically-interesting points along the track.
 * When the player runs close to a speaker stack the system:
 *   - Increases a proximity intensity value (0–1) that callers can use for
 *     camera effects, UI highlights, etc.
 *   - Fires bass-hit SFX through AudioManager on a tempo-locked interval.
 *   - Pulses each speaker's PointLights in time with the beat.
 *
 * Visuals
 * =======
 * Each speaker stack consists of:
 *   - Two tall speaker cabinet boxes (stacked, slightly different sizes)
 *   - A subwoofer box at the base
 *   - One coloured PointLight that pulses on the beat
 *   - A weak always-on ambient PointLight for scene fill
 *
 * All geometry is built with standard Three.js primitives.  No external
 * assets are required.
 *
 * Performance
 * ===========
 * Speaker meshes are not instanced (count is low: typically 4–8 per race).
 * PointLights are the main cost; they are kept at low shadow-free intensity
 * and given a limited distance so the GPU fill rate stays manageable.
 */

import * as THREE from 'three';
import type { AudioManager } from './AudioManager';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SpeakerStack {
  /** World-space position of the stack base. */
  position: THREE.Vector3;
  /** Group containing all mesh children. */
  group: THREE.Group;
  /** The main beat-synced point light. */
  beatLight: THREE.PointLight;
  /** Ambient fill light — dim, always on. */
  fillLight: THREE.PointLight;
  /** Hue used for the beat light (0–1). */
  hue: number;
  /** Phase offset so stacks don't all flash at the same moment. */
  phaseOffset: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Approximate DnB tempo in BPM — used to time bass hits. */
const DnB_BPM           = 174;
const BEAT_INTERVAL_SEC = 60 / DnB_BPM;       // ~0.345 s

/** How far apart (track distance, metres) speaker stacks are placed. */
const STACK_SPACING_M   = 200;

/** Influence radius — player must be within this distance to trigger audio. */
const TRIGGER_RADIUS_M  = 18;
const TRIGGER_RADIUS_SQ = TRIGGER_RADIUS_M * TRIGGER_RADIUS_M;

/** Min intensity at the edge of the trigger zone. */
const MIN_INTENSITY     = 0.0;

/** Beat light peak intensity. */
const BEAT_LIGHT_PEAK   = 4.0;
/** Ambient fill light intensity. */
const FILL_LIGHT_INTENS = 0.4;
/** Light reach in world units. */
const LIGHT_DISTANCE    = 12;

/** Gap between consecutive bass hit events (seconds) — prevents spam. */
const BASS_HIT_COOLDOWN = BEAT_INTERVAL_SEC * 4; // every 4 beats

// ---------------------------------------------------------------------------
// MusicEventSystem
// ---------------------------------------------------------------------------

export class MusicEventSystem {
  private readonly scene: THREE.Scene;
  private readonly audioManager: AudioManager;

  private stacks: SpeakerStack[] = [];

  /** Accumulated time since last bass hit, per stack (keyed by index). */
  private _bassTimers: number[] = [];

  /** Global beat clock — drives light pulses even outside audio range. */
  private _beatClock = 0;

  /** Shared geometries — built once, shared across all stacks. */
  private _cabinetGeo: THREE.BoxGeometry | null = null;
  private _subGeo: THREE.BoxGeometry | null = null;
  private _cabinetMat: THREE.MeshLambertMaterial | null = null;
  private _grilleMat: THREE.MeshLambertMaterial | null = null;

  // Scratch reuse.
  private readonly _scratchVec = new THREE.Vector3();

  constructor(scene: THREE.Scene, audioManager: AudioManager) {
    this.scene        = scene;
    this.audioManager = audioManager;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Instantiate speaker stacks along the track at regular intervals.
   *
   * @param trackPoints     World-space spine points of the track.
   * @param totalDistance   Full track length in metres.
   */
  spawnSpeakers(trackPoints: THREE.Vector3[], totalDistance: number): void {
    this.dispose(); // clear previous race's stacks

    if (trackPoints.length < 2) return;

    this._buildSharedGeometry();

    const numStacks = Math.max(2, Math.floor(totalDistance / STACK_SPACING_M));
    const hues      = [0.58, 0.83, 0.13, 0.95, 0.33, 0.70]; // blue, magenta, yellow, red, green, purple

    for (let i = 0; i < numStacks; i++) {
      // Place at even intervals along the track spine, slightly ahead of start.
      const t     = (i + 0.5) / numStacks;
      const idx   = Math.min(Math.floor(t * (trackPoints.length - 1)), trackPoints.length - 2);
      const p0    = trackPoints[idx]!;
      const p1    = trackPoints[idx + 1]!;

      // Direction perpendicular to the track in XZ — put speakers to the right side.
      const dir  = this._scratchVec.subVectors(p1, p0).normalize();
      const perp = new THREE.Vector3(-dir.z, 0, dir.x); // right of forward direction

      const sideSign = i % 2 === 0 ? 1 : -1; // alternate sides
      const offset   = 8 + Math.random() * 3; // 8-11 m from centre

      const pos = new THREE.Vector3(
        p0.x + perp.x * sideSign * offset,
        p0.y,
        p0.z + perp.z * sideSign * offset,
      );

      const hue   = hues[i % hues.length] as number;
      const stack = this._buildStack(pos, hue, i * (Math.PI * 0.4));
      this.stacks.push(stack);
      this._bassTimers.push(Math.random() * BASS_HIT_COOLDOWN); // stagger initial hit
    }
  }

  /**
   * Per-frame update.  Call from the game loop.
   *
   * Returns proximity data that callers can use for camera/UI effects.
   *
   * @param playerPosition  Current world-space player position.
   * @param dt              Frame delta time in seconds.
   */
  update(
    playerPosition: THREE.Vector3,
    dt: number,
  ): { inMusicZone: boolean; intensity: number } {
    this._beatClock += dt;

    let maxIntensity = 0;
    let inZone       = false;

    for (let i = 0; i < this.stacks.length; i++) {
      const stack = this.stacks[i]!;

      // Squared-distance check (avoids sqrt).
      const dx    = playerPosition.x - stack.position.x;
      const dz    = playerPosition.z - stack.position.z;
      const distSq = dx * dx + dz * dz;

      if (distSq < TRIGGER_RADIUS_SQ) {
        const dist      = Math.sqrt(distSq);
        const t         = 1 - dist / TRIGGER_RADIUS_M;   // 0 at edge, 1 at centre
        const intensity = Math.max(MIN_INTENSITY, t);

        if (intensity > maxIntensity) maxIntensity = intensity;
        inZone = true;

        // Bass hit on beat when player is in range.
        this._bassTimers[i] = (this._bassTimers[i] ?? 0) + dt;
        if (this._bassTimers[i]! >= BASS_HIT_COOLDOWN * (1.0 - intensity * 0.5)) {
          this._bassTimers[i] = 0;
          this.audioManager.playBassHit();
        }
      }
    }

    return { inMusicZone: inZone, intensity: maxIntensity };
  }

  /**
   * Animate speaker light pulses.  Can be called separately from update()
   * so visual flair is decoupled from proximity-detection logic.
   *
   * @param dt  Frame delta time in seconds.
   */
  animate(dt: number): void {
    // Beat phase (0–1 per beat).
    const beatPhase = (this._beatClock % BEAT_INTERVAL_SEC) / BEAT_INTERVAL_SEC;
    // Sharp on-beat pulse: rises quickly, decays exponentially.
    const beatPulse = Math.exp(-beatPhase * 6);

    for (const stack of this.stacks) {
      const phase  = (this._beatClock + stack.phaseOffset) % BEAT_INTERVAL_SEC / BEAT_INTERVAL_SEC;
      const pulse  = Math.exp(-phase * 6);
      const intens = FILL_LIGHT_INTENS + pulse * BEAT_LIGHT_PEAK;

      stack.beatLight.intensity = intens;

      // Colour cycles slowly through hue variants.
      const hue = (stack.hue + beatPhase * 0.05 + dt * 0.02) % 1;
      stack.beatLight.color.setHSL(hue, 1.0, 0.55);

      // Unused variable suppression — beatPulse drives a global fallback.
      void beatPulse;
    }
  }

  /** Remove all speaker meshes and lights from the scene. */
  dispose(): void {
    for (const stack of this.stacks) {
      this.scene.remove(stack.group);
      // Dispose all children.
      stack.group.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            (mesh.material as THREE.Material).dispose();
          }
        }
      });
      this.scene.remove(stack.beatLight);
      this.scene.remove(stack.fillLight);
    }

    this.stacks      = [];
    this._bassTimers = [];

    if (this._cabinetGeo  !== null) { this._cabinetGeo.dispose();  this._cabinetGeo  = null; }
    if (this._subGeo      !== null) { this._subGeo.dispose();      this._subGeo      = null; }
    if (this._cabinetMat  !== null) { this._cabinetMat.dispose();  this._cabinetMat  = null; }
    if (this._grilleMat   !== null) { this._grilleMat.dispose();   this._grilleMat   = null; }
  }

  // ---------------------------------------------------------------------------
  // Private — geometry construction
  // ---------------------------------------------------------------------------

  private _buildSharedGeometry(): void {
    // Cabinet box: tall mid/high speaker enclosure.
    this._cabinetGeo = new THREE.BoxGeometry(0.8, 1.4, 0.6);
    // Subwoofer: wider, shorter box.
    this._subGeo     = new THREE.BoxGeometry(1.0, 0.9, 0.7);

    this._cabinetMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    this._grilleMat  = new THREE.MeshLambertMaterial({ color: 0x222222 });
  }

  /**
   * Build one speaker stack group and add it to the scene.
   */
  private _buildStack(
    pos: THREE.Vector3,
    hue: number,
    phaseOffset: number,
  ): SpeakerStack {
    const group = new THREE.Group();
    group.position.copy(pos);

    // Subwoofer at ground level.
    const sub = new THREE.Mesh(this._subGeo!, this._cabinetMat!);
    sub.position.set(0, 0.45, 0);
    sub.castShadow    = true;
    sub.receiveShadow = true;

    // Lower mid cabinet on top of sub.
    const mid = new THREE.Mesh(this._cabinetGeo!, this._cabinetMat!);
    mid.position.set(0, 0.9 + 0.70, 0);
    mid.castShadow = true;

    // Upper cabinet (slightly smaller for a tapered look).
    const high = new THREE.Mesh(this._cabinetGeo!, this._grilleMat!);
    high.position.set(0, 0.9 + 1.40 + 0.70, 0);
    high.scale.set(0.88, 0.88, 0.88);
    high.castShadow = true;

    // Small indicator LED box on the top cabinet.
    const ledGeo = new THREE.BoxGeometry(0.12, 0.06, 0.05);
    const color  = new THREE.Color().setHSL(hue, 1, 0.5);
    const ledMat = new THREE.MeshBasicMaterial({ color });
    const led    = new THREE.Mesh(ledGeo, ledMat);
    led.position.set(0, 0.9 + 1.40 + 1.42, 0.31);

    group.add(sub, mid, high, led);
    this.scene.add(group);

    // Beat-synced coloured point light.
    const beatColor = new THREE.Color().setHSL(hue, 1.0, 0.55);
    const beatLight = new THREE.PointLight(beatColor, FILL_LIGHT_INTENS, LIGHT_DISTANCE, 2);
    beatLight.position.set(pos.x, pos.y + 3.5, pos.z);
    this.scene.add(beatLight);

    // Ambient fill — soft white, always on.
    const fillLight = new THREE.PointLight(0xffffff, FILL_LIGHT_INTENS * 0.5, LIGHT_DISTANCE * 0.6, 2);
    fillLight.position.set(pos.x, pos.y + 1.5, pos.z);
    this.scene.add(fillLight);

    return {
      position: pos.clone(),
      group,
      beatLight,
      fillLight,
      hue,
      phaseOffset,
    };
  }
}
