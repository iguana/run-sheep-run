/**
 * CollectibleSystem - Spawn, animate, and collect pickups along the track.
 *
 * Lifecycle:
 *   1. spawnCollectibles() — called once after the track is set up.
 *      Places collectible instances at regular intervals, picking types
 *      from a weighted random pool.
 *   2. animate(dt)        — called every render frame for visual effects
 *      (bob + rotation).
 *   3. update(playerPos)  — called every physics tick.
 *      Performs sphere-overlap pickup detection and returns an array of
 *      CollectiblePickup records for the caller to apply.
 *   4. dispose()          — removes all meshes from the scene.
 *
 * Visuals:
 *   - Regular types: small sphere, vertex-coloured by type.
 *   - dnb_speaker: 1.6× scale, adds a PointLight for the glow effect.
 *   - mountain_token: medium sphere with extra PointLight.
 *   - All collectibles bob vertically and rotate on Y.
 *
 * No physics geometry is created — pickup detection is a simple
 * worldPosition distance check (O(n) but n is small: typically 20–60
 * collectibles per race).
 */

import * as THREE from 'three';
import {
  COLLECTIBLE_CONST,
} from '../game/constants';
import {
  COLLECTIBLES,
  buildWeightedPool,
  type CollectibleType,
  type CollectibleDefinition,
} from '../data/collectibles';
import type { TrackPath } from '../terrain/TrackPath';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Returned by update() for each collectible the player triggered this tick. */
export interface CollectiblePickup {
  type: CollectibleType;
  definition: CollectibleDefinition;
}

// ---------------------------------------------------------------------------
// Internal instance type
// ---------------------------------------------------------------------------

interface CollectibleInstance {
  type: CollectibleType;
  def: CollectibleDefinition;
  mesh: THREE.Mesh;
  light: THREE.PointLight | null;
  /** Base Y position (world). Bobbing offsets from this. */
  baseY: number;
  /** Independent bob phase offset (radians) so items don't all move in sync. */
  bobPhase: number;
  /** Whether the player has already collected this item. */
  collected: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SPAWN_INTERVAL   = COLLECTIBLE_CONST.SPAWN_INTERVAL;
const PICKUP_RADIUS_SQ = COLLECTIBLE_CONST.PICKUP_RADIUS ** 2;

/** Lateral spread: collectibles are offset from centre by this much (metres). */
const MAX_LATERAL_SPREAD = 3.5;

/** Height above the track surface at which collectibles float (metres). */
const FLOAT_HEIGHT = 1.0;

/** Point-light distance and decay for glowing collectibles. */
const GLOW_DISTANCE = 8;
const GLOW_INTENSITY = 1.8;

// ---------------------------------------------------------------------------
// Class
// ---------------------------------------------------------------------------

export class CollectibleSystem {
  private readonly scene: THREE.Scene;
  private readonly trackPath: TrackPath;
  private readonly totalDistance: number;

  private instances: CollectibleInstance[] = [];
  private readonly weightedPool: CollectibleType[];

  /** Shared geometry per collectible shape (sphere). */
  private readonly sphereGeo: THREE.SphereGeometry;
  private readonly largeSphereGeo: THREE.SphereGeometry;

  constructor(scene: THREE.Scene, trackPath: TrackPath, totalDistance: number) {
    this.scene = scene;
    this.trackPath = trackPath;
    this.totalDistance = totalDistance;
    this.weightedPool = buildWeightedPool();

    // Pre-create shared geometries — all instances share one geometry per size.
    this.sphereGeo      = new THREE.SphereGeometry(0.35, 10, 8);
    this.largeSphereGeo = new THREE.SphereGeometry(0.55, 12, 10);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Place all collectibles along the track.
   * Call once after generate(); safe to call again to reset the race.
   */
  spawnCollectibles(): void {
    // Remove previous instances if re-spawning.
    this._clearInstances();

    let distance = SPAWN_INTERVAL; // skip the very start

    while (distance < this.totalDistance - SPAWN_INTERVAL) {
      const type = this._pickType();
      this._spawnAt(distance, type);
      distance += SPAWN_INTERVAL;
    }
  }

  /**
   * Sphere-overlap pickup test.
   * Returns one entry per collectible that the player triggered this tick.
   * Collected items are hidden immediately; subsequent calls won't re-trigger them.
   *
   * @param playerPosition  Current world-space position of the player.
   * @param _dt             Delta time (reserved for future time-gated effects).
   */
  update(playerPosition: THREE.Vector3, _dt: number): CollectiblePickup[] {
    const results: CollectiblePickup[] = [];

    for (const inst of this.instances) {
      if (inst.collected) continue;

      const distSq = playerPosition.distanceToSquared(inst.mesh.position);
      if (distSq <= PICKUP_RADIUS_SQ) {
        inst.collected = true;
        inst.mesh.visible = false;
        if (inst.light !== null) inst.light.visible = false;

        results.push({ type: inst.type, definition: inst.def });
      }
    }

    return results;
  }

  /**
   * Animate all visible collectibles.
   * Call every render frame (or fixed tick — both are fine).
   *
   * @param dt  Elapsed time since last call (seconds).
   */
  animate(dt: number): void {
    for (const inst of this.instances) {
      if (inst.collected) continue;

      // Bob.
      inst.bobPhase += inst.def.bobSpeed * dt;
      const bobY = Math.sin(inst.bobPhase) * 0.20;
      inst.mesh.position.y = inst.baseY + bobY;

      // Rotate.
      inst.mesh.rotation.y += inst.def.rotateSpeed * dt;

      // Pulse light intensity for glowing items.
      if (inst.light !== null) {
        const pulse = 0.8 + Math.sin(inst.bobPhase * 2) * 0.3;
        inst.light.intensity = GLOW_INTENSITY * pulse;
      }
    }
  }

  dispose(): void {
    this._clearInstances();
    this.sphereGeo.dispose();
    this.largeSphereGeo.dispose();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _pickType(): CollectibleType {
    const idx = Math.floor(Math.random() * this.weightedPool.length);
    return this.weightedPool[idx] as CollectibleType;
  }

  private _spawnAt(trackDistance: number, type: CollectibleType): void {
    const def = COLLECTIBLES[type];
    const progress = trackDistance / this.totalDistance;

    // Slight random lateral spread so collectibles don't form a boring line.
    const lateral = (Math.random() * 2 - 1) * MAX_LATERAL_SPREAD;

    const { position } = this.trackPath.progressToWorld(progress, lateral);
    const worldPos = position.clone();
    worldPos.y += FLOAT_HEIGHT;

    // Choose geometry based on scale.
    const isLarge = def.size >= 0.70;
    const geo = isLarge ? this.largeSphereGeo : this.sphereGeo;

    const mat = new THREE.MeshToonMaterial({
      color: new THREE.Color(def.color),
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(worldPos);
    mesh.castShadow = true;

    // Scale the mesh by the definition's size relative to our base sphere radius.
    const baseRadius = isLarge ? 0.55 : 0.35;
    const scaleFactor = (def.size * 0.5) / baseRadius;
    mesh.scale.setScalar(scaleFactor);

    this.scene.add(mesh);

    // Optional glow light for special collectibles.
    let light: THREE.PointLight | null = null;
    if (def.glowColor !== '' && (type === 'dnb_speaker' || type === 'mountain_token')) {
      light = new THREE.PointLight(
        new THREE.Color(def.glowColor),
        GLOW_INTENSITY,
        GLOW_DISTANCE,
        2, // decay
      );
      light.position.copy(worldPos);
      this.scene.add(light);
    }

    this.instances.push({
      type,
      def,
      mesh,
      light,
      baseY: worldPos.y,
      bobPhase: Math.random() * Math.PI * 2,
      collected: false,
    });
  }

  private _clearInstances(): void {
    for (const inst of this.instances) {
      this.scene.remove(inst.mesh);
      (inst.mesh.material as THREE.Material).dispose();
      if (inst.light !== null) {
        this.scene.remove(inst.light);
      }
    }
    this.instances = [];
  }
}
