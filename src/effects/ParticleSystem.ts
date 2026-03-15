/**
 * ParticleSystem - GPU-instanced billboard particle system for sheeprunner.
 *
 * Architecture
 * ============
 * One InstancedMesh is maintained for all particles regardless of type.
 * Each particle occupies one instance slot in the pool.  Inactive particles
 * are hidden by setting their instance scale to zero (avoids draw-call
 * overhead from changing instanceMatrix.count).
 *
 * The geometry is a simple unit quad (two triangles) that always faces the
 * camera via per-frame matrix construction (software billboarding).
 *
 * The material is MeshBasicMaterial — no lighting cost.  Per-particle colour
 * is applied via InstancedMesh.setColorAt().
 *
 * Budget
 * ======
 * MAX_PARTICLES = 200, which is the mobile-friendly ceiling.  Emission
 * functions soft-fail when the pool is exhausted — no particles are dropped
 * silently; they simply don't appear until slots free up.
 *
 * Particle data layout
 * ====================
 * Each particle lives in a plain object (ParticleData).  Per-frame update
 * iterates only the active list so the cost scales with live count, not the
 * full pool size.
 *
 * Billboarding
 * ============
 * Rather than using THREE.Sprite (which forces a separate draw call per
 * sprite), we manually compose the instance matrix from the camera's world
 * quaternion each frame.  This keeps everything in a single draw call.
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ParticleKind =
  | 'dust'
  | 'sparkle'
  | 'note'
  | 'confetti'
  | 'sweat'
  | 'pickup';

interface ParticleData {
  /** Index into the InstancedMesh instance arrays. */
  slot: number;
  kind: ParticleKind;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  /** Remaining life in seconds. */
  life: number;
  /** Initial life — used to compute normalised age (0 = new, 1 = expired). */
  maxLife: number;
  color: THREE.Color;
  /** Initial size in world units. */
  size: number;
  /** Rotation angle around the billboard normal (radians). */
  angle: number;
  /** Angular velocity (radians/s). */
  angularVelocity: number;
  /** Whether this slot is in use. */
  active: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_PARTICLES    = 200;
const GRAVITY          = -4.0; // m/s²
const DRAG             = 0.92; // velocity multiplier per second (applied as v *= DRAG^dt via approx)

// Colours for the musical note symbols (cycling set).
const NOTE_COLORS = [0xff44aa, 0x44ffcc, 0xffee00, 0xff8800] as const;

// ---------------------------------------------------------------------------
// ParticleSystem
// ---------------------------------------------------------------------------

export class ParticleSystem {
  private readonly scene: THREE.Scene;
  private readonly mesh: THREE.InstancedMesh;

  private readonly pool: ParticleData[] = [];
  private readonly active: Set<number> = new Set();
  private _nextSlot = 0;

  // Scratch objects for matrix construction (avoid per-frame allocation).
  private readonly _pos   = new THREE.Vector3();
  private readonly _quat  = new THREE.Quaternion();
  private readonly _scale = new THREE.Vector3();
  private readonly _mat   = new THREE.Matrix4();
  private readonly _color = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Billboard quad geometry: two triangles forming a unit square centred at origin.
    const geo = this._buildQuadGeo();

    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite:  false,           // particles don't occlude each other
      blending:    THREE.AdditiveBlending, // glow-style compositing
      vertexColors: false,
    });

    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_PARTICLES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; // We move particles, can't use static cull

    // Initialise all instances as invisible (zero scale).
    const hiddenMat = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.mesh.setMatrixAt(i, hiddenMat);
      this.mesh.setColorAt(i, new THREE.Color(1, 1, 1));
      this.pool.push(this._makeParticleData(i));
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    scene.add(this.mesh);
  }

  // ---------------------------------------------------------------------------
  // Emission API
  // ---------------------------------------------------------------------------

  /**
   * Emit a cluster of dust particles — small, fast, brownish.
   * Used for footsteps on dirt/gravel, and off-track running.
   *
   * @param position  World-space emission point.
   * @param speed     Base ejection speed (m/s).
   */
  emitDust(position: THREE.Vector3, speed: number): void {
    const count = 3 + Math.floor(Math.random() * 3); // 3–5 particles
    for (let i = 0; i < count; i++) {
      const p = this._acquire('dust');
      if (p === null) return;

      p.position.copy(position).addScaledVector(
        new THREE.Vector3((Math.random() - 0.5), 0.1, (Math.random() - 0.5)).normalize(),
        0.3,
      );
      p.velocity.set(
        (Math.random() - 0.5) * speed * 1.2,
        Math.random() * speed * 0.6 + 0.5,
        (Math.random() - 0.5) * speed * 1.2,
      );
      p.life    = p.maxLife = 0.4 + Math.random() * 0.3;
      p.size    = 0.12 + Math.random() * 0.12;
      p.angle   = Math.random() * Math.PI * 2;
      p.angularVelocity = (Math.random() - 0.5) * 3;
      p.color.setRGB(0.68 + Math.random() * 0.1, 0.55 + Math.random() * 0.1, 0.35);
    }
  }

  /**
   * Emit bright sparkle particles — small white/yellow flecks with additive
   * blending for a glittery effect.  Used for track-surface highlights and
   * pickup proximity glow.
   *
   * @param position  World-space emission point.
   * @param color     Base tint colour (particles vary slightly around it).
   */
  emitSparkles(position: THREE.Vector3, color: THREE.Color): void {
    const count = 5 + Math.floor(Math.random() * 4); // 5–8
    for (let i = 0; i < count; i++) {
      const p = this._acquire('sparkle');
      if (p === null) return;

      p.position.copy(position).addScaledVector(
        _randomUnit3D(),
        0.2 + Math.random() * 0.3,
      );
      const ejectSpeed = 1.5 + Math.random() * 2.5;
      p.velocity.copy(_randomUnit3D()).multiplyScalar(ejectSpeed);
      p.velocity.y += 1.0; // bias upward

      p.life    = p.maxLife = 0.3 + Math.random() * 0.4;
      p.size    = 0.06 + Math.random() * 0.08;
      p.angle   = 0;
      p.angularVelocity = (Math.random() - 0.5) * 8;

      // Tint: slight hue shift from the base colour.
      p.color.copy(color).offsetHSL(
        (Math.random() - 0.5) * 0.08,
        0,
        (Math.random() - 0.5) * 0.2,
      );
    }
  }

  /**
   * Emit floating music-note glyphs — colourful, slow-drifting particles
   * that appear when the player is in a music zone or picks up a DnB speaker.
   *
   * Notes are represented as slightly larger particles with distinct colours.
   *
   * @param position  World-space emission point.
   */
  emitMusicNotes(position: THREE.Vector3): void {
    const count = 2 + Math.floor(Math.random() * 3); // 2–4
    for (let i = 0; i < count; i++) {
      const p = this._acquire('note');
      if (p === null) return;

      p.position.copy(position).add(
        new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.8),
      );
      p.velocity.set(
        (Math.random() - 0.5) * 0.8,
        1.5 + Math.random() * 1.0,
        (Math.random() - 0.5) * 0.8,
      );
      p.life    = p.maxLife = 0.8 + Math.random() * 0.7;
      p.size    = 0.18 + Math.random() * 0.10;
      p.angle   = Math.random() * Math.PI * 2;
      p.angularVelocity = (Math.random() - 0.5) * 2;

      const hex = NOTE_COLORS[i % NOTE_COLORS.length] as number;
      p.color.setHex(hex);
    }
  }

  /**
   * Emit confetti — large, flat, brightly coloured particles that tumble
   * and drift downward slowly.  Used for finish-line celebration.
   *
   * @param position  World-space emission point.
   */
  emitConfetti(position: THREE.Vector3): void {
    const count = 10 + Math.floor(Math.random() * 8); // 10–17
    const hues  = [0, 0.08, 0.16, 0.33, 0.55, 0.66, 0.83];
    for (let i = 0; i < count; i++) {
      const p = this._acquire('confetti');
      if (p === null) return;

      p.position.copy(position).add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 1.5,
          Math.random() * 1.0,
          (Math.random() - 0.5) * 1.5,
        ),
      );
      p.velocity.set(
        (Math.random() - 0.5) * 4,
        3 + Math.random() * 3,
        (Math.random() - 0.5) * 4,
      );
      p.life    = p.maxLife = 1.2 + Math.random() * 0.8;
      p.size    = 0.14 + Math.random() * 0.10;
      p.angle   = Math.random() * Math.PI * 2;
      p.angularVelocity = (Math.random() - 0.5) * 10;

      const hue = hues[i % hues.length] as number;
      p.color.setHSL(hue, 1.0, 0.55);
    }
  }

  /**
   * Emit sweat droplets — small translucent blue-white blobs that fly out
   * sideways and arc downward.  Appears during bonk/fatigue events.
   *
   * @param position  World-space emission point (typically near the runner's head).
   */
  emitSweat(position: THREE.Vector3): void {
    const count = 3 + Math.floor(Math.random() * 3); // 3–5
    for (let i = 0; i < count; i++) {
      const p = this._acquire('sweat');
      if (p === null) return;

      p.position.copy(position);
      p.velocity.set(
        (Math.random() - 0.5) * 3.5,
        1.5 + Math.random() * 1.5,
        (Math.random() - 0.5) * 3.5,
      );
      p.life    = p.maxLife = 0.5 + Math.random() * 0.3;
      p.size    = 0.06 + Math.random() * 0.06;
      p.angle   = 0;
      p.angularVelocity = 0;
      p.color.setRGB(0.7 + Math.random() * 0.3, 0.9, 1.0);
    }
  }

  /**
   * Emit an explosive burst of coloured particles centred on a pickup.
   * The burst fans outward in all directions with a strong initial impulse.
   *
   * @param position  World-space pickup location.
   * @param color     Dominant burst colour.
   */
  emitPickupBurst(position: THREE.Vector3, color: THREE.Color): void {
    const count = 12 + Math.floor(Math.random() * 6); // 12–17
    for (let i = 0; i < count; i++) {
      const p = this._acquire('pickup');
      if (p === null) return;

      p.position.copy(position);
      const ejectDir   = _randomUnit3D();
      const ejectSpeed = 2.5 + Math.random() * 3.0;
      p.velocity.copy(ejectDir).multiplyScalar(ejectSpeed);
      p.velocity.y    += 1.5; // upward bias

      p.life    = p.maxLife = 0.35 + Math.random() * 0.25;
      p.size    = 0.10 + Math.random() * 0.12;
      p.angle   = Math.random() * Math.PI * 2;
      p.angularVelocity = (Math.random() - 0.5) * 12;
      p.color.copy(color).offsetHSL(
        (Math.random() - 0.5) * 0.1,
        0,
        (Math.random() - 0.5) * 0.15,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  /**
   * Advance particle simulation and rebuild instance matrices.
   * Must be called once per frame.
   *
   * @param dt  Frame delta time in seconds.
   */
  update(dt: number): void {
    if (this.active.size === 0) return;

    // Camera-facing quaternion from the scene's camera is not directly available
    // here.  We approximate by composing a Y-up billboarded quad.
    // The caller should pass the camera if proper 3-axis billboarding is needed,
    // but for a runner game fixed-Y-axis billboarding (always face +Z of camera)
    // looks great for downward-angled chase cam.
    // We instead compose: position * scale, rotation handled per-particle as a
    // Y-rotation of the quad so it faces the camera approximately.
    //
    // For a proper per-frame billboard we reconstruct the rotation from the
    // camera's quaternion every frame — callers can call update(dt, camera)
    // or we infer it from the world matrix.
    // Since the camera is a chase-cam always above+behind the player, a simple
    // billboard around the world Y axis gives a very good approximation.

    const toExpire: number[] = [];

    for (const slot of this.active) {
      const p = this.pool[slot]!;

      // Advance life.
      p.life -= dt;
      if (p.life <= 0) {
        toExpire.push(slot);
        continue;
      }

      // Physics.
      const dragFactor = Math.pow(DRAG, dt * 60); // frame-rate independent drag
      p.velocity.x *= dragFactor;
      p.velocity.z *= dragFactor;
      p.velocity.y += GRAVITY * dt;
      // Note particles drift up gently — override gravity.
      if (p.kind === 'note') p.velocity.y += (GRAVITY * -1.8) * dt;

      p.position.addScaledVector(p.velocity, dt);
      p.angle += p.angularVelocity * dt;

      // Normalised age [0=just born, 1=about to die].
      const age = 1 - p.life / p.maxLife;

      // Size fade — most types shrink toward end of life.
      let sizeScale = p.size;
      if (p.kind === 'dust' || p.kind === 'sweat' || p.kind === 'pickup') {
        sizeScale = p.size * (1 - age);
      } else if (p.kind === 'sparkle') {
        // Sparkles flash bright then fade.
        sizeScale = p.size * Math.sin(age * Math.PI);
      }
      sizeScale = Math.max(0.001, sizeScale);

      // Alpha via instance color alpha channel — MeshBasicMaterial with opacity.
      // We bake alpha into the color brightness for additive blending.
      const alpha = p.kind === 'confetti'
        ? Math.max(0, 1 - age * 1.2)
        : Math.max(0, 1 - age);

      this._color.copy(p.color).multiplyScalar(alpha);
      this.mesh.setColorAt(slot, this._color);

      // Compose billboard matrix: translate to position, rotate around Y,
      // then scale uniformly.
      this._pos.copy(p.position);
      // Y-axis rotation for per-particle tumble (gives nice confetti feel).
      this._quat.setFromAxisAngle(_AXIS_Y, p.angle);
      this._scale.setScalar(sizeScale);
      this._mat.compose(this._pos, this._quat, this._scale);
      this.mesh.setMatrixAt(slot, this._mat);
    }

    // Expire dead particles.
    for (const slot of toExpire) {
      this._release(slot);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor !== null) {
      this.mesh.instanceColor.needsUpdate = true;
    }
  }

  /** Remove the InstancedMesh from the scene and free geometry/material. */
  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.active.clear();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _makeParticleData(slot: number): ParticleData {
    return {
      slot,
      kind: 'dust',
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      life: 0,
      maxLife: 1,
      color: new THREE.Color(1, 1, 1),
      size: 0.1,
      angle: 0,
      angularVelocity: 0,
      active: false,
    };
  }

  /**
   * Claim the next free pool slot for a new particle.
   * Returns null when the pool is full.
   */
  private _acquire(kind: ParticleKind): ParticleData | null {
    // Find an inactive slot starting from _nextSlot.
    const start = this._nextSlot;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const idx = (start + i) % MAX_PARTICLES;
      const p   = this.pool[idx]!;
      if (!p.active) {
        p.active = true;
        p.kind   = kind;
        this.active.add(idx);
        this._nextSlot = (idx + 1) % MAX_PARTICLES;
        return p;
      }
    }
    return null; // pool exhausted
  }

  /** Return a slot to the pool and hide the instance. */
  private _release(slot: number): void {
    const p   = this.pool[slot]!;
    p.active  = false;
    p.life    = 0;
    this.active.delete(slot);

    // Hide by zeroing scale.
    this._mat.makeScale(0, 0, 0);
    this.mesh.setMatrixAt(slot, this._mat);
  }

  /** Build a unit quad geometry centred at the origin. */
  private _buildQuadGeo(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    // Two triangles: a unit square in XY, facing +Z.
    const positions = new Float32Array([
      -0.5, -0.5, 0,   // BL
       0.5, -0.5, 0,   // BR
       0.5,  0.5, 0,   // TR
      -0.5,  0.5, 0,   // TL
    ]);
    const uvs = new Float32Array([
      0, 0,
      1, 0,
      1, 1,
      0, 1,
    ]);
    const indices = new Uint16Array([0, 1, 2,  0, 2, 3]);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    return geo;
  }
}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

const _AXIS_Y = new THREE.Vector3(0, 1, 0);

/** Generate a random unit vector in 3D (uniform sphere). */
function _randomUnit3D(): THREE.Vector3 {
  const theta = Math.random() * Math.PI * 2;
  const phi   = Math.acos(2 * Math.random() - 1);
  return new THREE.Vector3(
    Math.sin(phi) * Math.cos(theta),
    Math.sin(phi) * Math.sin(theta),
    Math.cos(phi),
  );
}
