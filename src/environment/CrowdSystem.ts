/**
 * CrowdSystem - Spectator crowd along the race track.
 *
 * Design
 * ======
 * Crowd members are very low-poly "stick-figure" bipeds built from standard
 * Three.js primitives:
 *   - Body:  elongated capsule approximated by a CylinderGeometry (5 sides)
 *   - Head:  small SphereGeometry (5 segments) on top
 *   - Arms:  two thin boxes, held either up (cheering) or down (idle)
 *
 * All crowd members of the same "colour class" share one InstancedMesh,
 * giving O(colourClasses) draw calls regardless of total crowd size.
 *
 * Behaviour
 * =========
 * Members cheer (arms-up animation + bob) when the player is within
 * CHEER_RADIUS metres.  Outside that range they idle.  The cheering effect
 * ripples outward from the nearest crowd members so it looks organic.
 *
 * The animation is a vertical position bob and an arm-raise driven by
 * a per-instance phase offset so the crowd undulates rather than all
 * moving in lockstep.
 *
 * Performance
 * ===========
 * - MAX_CROWD_MEMBERS hard cap — mobile-safe.
 * - InstancedMesh per colour class (4 classes = 4 draw calls).
 * - Only instanceMatrix is updated — no per-frame geometry rebuild.
 * - Crowd members beyond CULL_RADIUS from the player are skipped in the
 *   animation pass (their matrix is left at the last animated value).
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of crowd members across the entire track. */
const MAX_CROWD_MEMBERS = 400;

/** Distance (m) between each crowd cluster along the track. */
const CLUSTER_SPACING_M = 60;

/** Number of members per cluster. */
const MEMBERS_PER_CLUSTER = 6;

/** Lateral offset from the track edge where the crowd stands (metres). */
const CROWD_LATERAL_OFFSET_MIN = 7;
const CROWD_LATERAL_OFFSET_MAX = 12;

/** Distance within which crowd members start cheering (metres). */
const CHEER_RADIUS    = 20;
const CHEER_RADIUS_SQ = CHEER_RADIUS * CHEER_RADIUS;

/** Distance beyond which we skip animation updates. */
const CULL_RADIUS    = 80;
const CULL_RADIUS_SQ = CULL_RADIUS * CULL_RADIUS;

/** Cheering bob amplitude (metres). */
const BOB_AMPLITUDE   = 0.18;
/** Cheering bob frequency (radians/s). */
const BOB_FREQUENCY   = 6.0;

/** The four crowd colour classes. */
const CROWD_COLORS = [
  0xe74c3c, // red jersey
  0x3498db, // blue jersey
  0xf1c40f, // yellow jersey
  0x2ecc71, // green jersey
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CrowdMember {
  /** World-space standing position at rest. */
  basePosition: THREE.Vector3;
  /** Colour class index (0–3) — determines which InstancedMesh this is in. */
  colorClass: number;
  /** Slot within the colour-class InstancedMesh. */
  slot: number;
  /** Per-member phase offset for the bob animation. */
  phase: number;
  /** Current cheer intensity [0, 1] — blends between idle and cheer pose. */
  cheerIntensity: number;
}

interface CrowdClass {
  mesh: THREE.InstancedMesh;
  members: CrowdMember[]; // members that belong to this colour class
}

// ---------------------------------------------------------------------------
// CrowdSystem
// ---------------------------------------------------------------------------

export class CrowdSystem {
  private readonly scene: THREE.Scene;
  private classes: CrowdClass[] = [];
  private allMembers: CrowdMember[] = [];

  // Scratch.
  private readonly _pos   = new THREE.Vector3();
  private readonly _quat  = new THREE.Quaternion();
  private readonly _scale = new THREE.Vector3(1, 1, 1);
  private readonly _mat   = new THREE.Matrix4();

  /** Accumulated animation clock. */
  private _clock = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Instantiate crowd members along the track.
   *
   * @param trackPoints  World-space spine points of the track.
   * @param density      Multiplier on MEMBERS_PER_CLUSTER (1 = normal).
   */
  spawnCrowd(trackPoints: THREE.Vector3[], density: number): void {
    this.dispose();

    if (trackPoints.length < 2) return;

    // Build one InstancedMesh per colour class.
    const geo = this._buildCrowdMemberGeo();

    for (let c = 0; c < CROWD_COLORS.length; c++) {
      const color = CROWD_COLORS[c] as number;
      const mat   = new THREE.MeshLambertMaterial({ color });
      const mesh  = new THREE.InstancedMesh(geo, mat, Math.ceil(MAX_CROWD_MEMBERS / CROWD_COLORS.length));
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.classes.push({ mesh, members: [] });
      this.scene.add(mesh);
    }

    // Scatter crowd members at cluster intervals.
    const trackLen   = trackPoints.length - 1;
    const spacing    = Math.max(1, Math.floor(trackLen / (trackLen / (CLUSTER_SPACING_M / 2))));
    const perCluster = Math.max(1, Math.round(MEMBERS_PER_CLUSTER * density));
    const dir        = new THREE.Vector3();
    const perp       = new THREE.Vector3();

    for (let i = spacing; i < trackLen - spacing; i += spacing) {
      const p0 = trackPoints[i]!;
      const p1 = trackPoints[Math.min(i + 1, trackLen)]!;

      dir.subVectors(p1, p0).normalize();
      perp.set(-dir.z, 0, dir.x);

      for (let m = 0; m < perCluster; m++) {
        if (this.allMembers.length >= MAX_CROWD_MEMBERS) break;

        // Alternate sides with jitter.
        const side        = m % 2 === 0 ? 1 : -1;
        const lateralDist = CROWD_LATERAL_OFFSET_MIN +
          Math.random() * (CROWD_LATERAL_OFFSET_MAX - CROWD_LATERAL_OFFSET_MIN);
        const longJitter  = (Math.random() - 0.5) * spacing * 1.5;

        const basePos = new THREE.Vector3(
          p0.x + perp.x * side * lateralDist + dir.x * longJitter,
          p0.y,
          p0.z + perp.z * side * lateralDist + dir.z * longJitter,
        );

        const colorClass  = Math.floor(Math.random() * CROWD_COLORS.length);
        const classData   = this.classes[colorClass]!;
        const slot        = classData.mesh.count;
        classData.mesh.count++;

        const member: CrowdMember = {
          basePosition:   basePos,
          colorClass,
          slot,
          phase:          Math.random() * Math.PI * 2,
          cheerIntensity: 0,
        };

        classData.members.push(member);
        this.allMembers.push(member);

        // Write initial idle matrix.
        this._writeMemberMatrix(member, 0, false);
        classData.mesh.setMatrixAt(slot, this._mat);
      }
    }

    for (const cls of this.classes) {
      cls.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * Update crowd animation.  Call every frame.
   *
   * @param dt              Frame delta time in seconds.
   * @param playerPosition  Current world-space player position.
   */
  update(dt: number, playerPosition: THREE.Vector3): void {
    this._clock += dt;

    let anyDirty = false;

    for (let i = 0; i < this.allMembers.length; i++) {
      const m  = this.allMembers[i]!;

      // Cull: skip members far from the player.
      const dx = playerPosition.x - m.basePosition.x;
      const dz = playerPosition.z - m.basePosition.z;
      const distSq = dx * dx + dz * dz;

      if (distSq > CULL_RADIUS_SQ) continue;

      // Cheer intensity: smoothly ramp up when player is close, fade out when far.
      const inCheer   = distSq < CHEER_RADIUS_SQ;
      const targetInt = inCheer ? 1.0 : 0.0;
      m.cheerIntensity += (targetInt - m.cheerIntensity) * Math.min(1, dt * 4);

      if (m.cheerIntensity < 0.005) continue; // no animation needed for fully idle

      this._writeMemberMatrix(m, this._clock, true);
      this.classes[m.colorClass]!.mesh.setMatrixAt(m.slot, this._mat);
      anyDirty = true;
    }

    if (anyDirty) {
      for (const cls of this.classes) {
        cls.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  /** Remove all crowd meshes and free GPU resources. */
  dispose(): void {
    for (const cls of this.classes) {
      this.scene.remove(cls.mesh);
      cls.mesh.geometry.dispose();
      (cls.mesh.material as THREE.Material).dispose();
    }
    this.classes    = [];
    this.allMembers = [];
    this._clock     = 0;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Build the combined geometry for one crowd member.
   * Geometry is shared across all InstancedMesh instances.
   *
   *   head   : small sphere at top
   *   body   : cylinder
   *   arms   : two thin boxes, will be animated via matrix transforms
   *            (NOTE: since we use InstancedMesh we can only move the whole
   *            figure, not individual limbs.  Arms are baked into the
   *            geometry at two poses and we lerp bob height instead.)
   */
  private _buildCrowdMemberGeo(): THREE.BufferGeometry {
    // Body cylinder.
    const body  = new THREE.CylinderGeometry(0.18, 0.22, 0.8, 5);
    body.translate(0, 0.4, 0); // base at y=0, top at y=0.8

    // Head sphere.
    const head  = new THREE.SphereGeometry(0.18, 5, 4);
    head.translate(0, 0.9, 0); // sits on body top

    // Arms: baked into raised position (cheering pose).
    const armL  = new THREE.BoxGeometry(0.08, 0.4, 0.08);
    armL.rotateZ(-Math.PI * 0.75);       // raised left arm
    armL.translate(-0.32, 0.85, 0);

    const armR  = new THREE.BoxGeometry(0.08, 0.4, 0.08);
    armR.rotateZ(Math.PI * 0.75);        // raised right arm
    armR.translate(0.32, 0.85, 0);

    return _mergeBufferGeos([body, head, armL, armR]);
  }

  /**
   * Compose and write the instance matrix for a crowd member.
   *
   * When cheering the member bobs up and down.
   * The cheerIntensity [0–1] blends between idle (flat) and cheer (bob).
   *
   * @param m          The crowd member data.
   * @param clock      Accumulated time in seconds.
   * @param animate    Whether to apply cheering animation.
   */
  private _writeMemberMatrix(m: CrowdMember, clock: number, animate: boolean): void {
    let yOffset = 0;

    if (animate && m.cheerIntensity > 0) {
      const bob  = Math.sin(clock * BOB_FREQUENCY + m.phase) * BOB_AMPLITUDE;
      yOffset    = bob * m.cheerIntensity;
    }

    this._pos.set(m.basePosition.x, m.basePosition.y + yOffset, m.basePosition.z);
    this._quat.identity();
    this._scale.set(1, 1, 1);
    this._mat.compose(this._pos, this._quat, this._scale);
  }
}

// ---------------------------------------------------------------------------
// Module-level geometry merger (minimal — position + normal only)
// ---------------------------------------------------------------------------

function _mergeBufferGeos(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  for (const g of geos) g.computeVertexNormals();

  let totalVerts = 0;
  let totalIdxs  = 0;

  for (const g of geos) {
    const pos = g.attributes['position'] as THREE.BufferAttribute;
    totalVerts += pos.count;
    if (g.index !== null) totalIdxs += g.index.count;
    else totalIdxs += pos.count;
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals   = new Float32Array(totalVerts * 3);
  const indices   = new Uint32Array(totalIdxs);

  let vOff = 0;
  let iOff = 0;

  for (const g of geos) {
    const pos = g.attributes['position'] as THREE.BufferAttribute;
    const nor = g.attributes['normal']   as THREE.BufferAttribute | undefined;
    const vc  = pos.count;

    positions.set(pos.array as Float32Array, vOff * 3);
    if (nor !== undefined) normals.set(nor.array as Float32Array, vOff * 3);

    if (g.index !== null) {
      const src = g.index.array;
      for (let i = 0; i < src.length; i++) {
        indices[iOff + i] = (src[i] as number) + vOff;
      }
      iOff += src.length;
    } else {
      for (let i = 0; i < vc; i++) indices[iOff + i] = vOff + i;
      iOff += vc;
    }

    vOff += vc;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal',   new THREE.BufferAttribute(normals, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));

  for (const g of geos) g.dispose();
  return merged;
}
