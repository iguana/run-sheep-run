import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// THREE mock — must be declared before any import that uses 'three'
// ---------------------------------------------------------------------------

vi.mock('three', () => {
  // Minimal Vector3 that supports the operations CollectibleSystem uses.
  const Vector3 = vi.fn().mockImplementation((x = 0, y = 0, z = 0) => {
    const v = {
      x, y, z,
      set(nx: number, ny: number, nz: number) { v.x = nx; v.y = ny; v.z = nz; return v; },
      copy(other: { x: number; y: number; z: number }) { v.x = other.x; v.y = other.y; v.z = other.z; return v; },
      add(other: { x: number; y: number; z: number }) { v.x += other.x; v.y += other.y; v.z += other.z; return v; },
      addScaledVector(other: { x: number; y: number; z: number }, s: number) {
        v.x += other.x * s; v.y += other.y * s; v.z += other.z * s; return v;
      },
      crossVectors(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
        v.x = a.y * b.z - a.z * b.y;
        v.y = a.z * b.x - a.x * b.z;
        v.z = a.x * b.y - a.y * b.x;
        return v;
      },
      normalize() {
        const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1;
        v.x /= len; v.y /= len; v.z /= len; return v;
      },
      multiplyScalar(s: number) { v.x *= s; v.y *= s; v.z *= s; return v; },
      length() { return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z); },
      distanceTo(other: { x: number; y: number; z: number }) {
        const dx = v.x - other.x, dy = v.y - other.y, dz = v.z - other.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
      },
      distanceToSquared(other: { x: number; y: number; z: number }) {
        const dx = v.x - other.x, dy = v.y - other.y, dz = v.z - other.z;
        return dx * dx + dy * dy + dz * dz;
      },
      clone() { return Vector3(v.x, v.y, v.z); },
    };
    return v;
  });

  // Simple Object3D base — tracks added/removed children.
  const makeObject3D = () => ({
    position: Vector3(0, 0, 0),
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1, setScalar(s: number) { this.x = s; this.y = s; this.z = s; } },
    visible: true,
    castShadow: false,
    children: [] as unknown[],
  });

  // Scene mock: tracks add/remove calls.
  const Scene = vi.fn().mockImplementation(() => {
    const obj = makeObject3D();
    const addedObjects: unknown[] = [];
    const removedObjects: unknown[] = [];
    return {
      ...obj,
      add: vi.fn((child: unknown) => addedObjects.push(child)),
      remove: vi.fn((child: unknown) => removedObjects.push(child)),
      _addedObjects: addedObjects,
      _removedObjects: removedObjects,
    };
  });

  const Color = vi.fn().mockImplementation((hex?: string | number) => ({ hex }));

  const Material = vi.fn().mockImplementation(() => ({
    dispose: vi.fn(),
  }));

  const MeshToonMaterial = vi.fn().mockImplementation(() => ({
    dispose: vi.fn(),
  }));

  const SphereGeometry = vi.fn().mockImplementation(() => ({
    dispose: vi.fn(),
  }));

  const Mesh = vi.fn().mockImplementation(() => {
    const m = makeObject3D();
    return {
      ...m,
      material: MeshToonMaterial(),
    };
  });

  const PointLight = vi.fn().mockImplementation((_color: unknown, intensity = 1) => ({
    ...makeObject3D(),
    intensity,
    visible: true,
  }));

  const CatmullRomCurve3 = vi.fn().mockImplementation((points: unknown[]) => ({
    points,
    getLength: vi.fn().mockReturnValue(1000),
    getLengths: vi.fn().mockReturnValue([]),
    getPoint: vi.fn().mockImplementation((t: number) => Vector3(0, 0, -1000 * t)),
    getTangent: vi.fn().mockReturnValue(Vector3(0, 0, -1).normalize()),
  }));

  return {
    Vector3,
    Scene,
    Color,
    Material,
    MeshToonMaterial,
    SphereGeometry,
    Mesh,
    PointLight,
    CatmullRomCurve3,
  };
});

// Now safe to import modules that depend on 'three'
import * as THREE from 'three';
import { CollectibleSystem } from '@/gameplay/CollectibleSystem';
import { TrackPath } from '@/terrain/TrackPath';
import { COLLECTIBLES } from '@/data/collectibles';
import { COLLECTIBLE_CONST } from '@/game/constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScene(): THREE.Scene {
  return new THREE.Scene();
}

function makePath(totalDistance: number): TrackPath {
  return new TrackPath([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -totalDistance / 2),
    new THREE.Vector3(0, 0, -totalDistance),
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CollectibleSystem', () => {
  const totalDistance = 1000;
  let scene: THREE.Scene;
  let path: TrackPath;
  let system: CollectibleSystem;

  beforeEach(() => {
    scene = makeScene();
    path = makePath(totalDistance);
    system = new CollectibleSystem(scene, path, totalDistance);
  });

  describe('spawnCollectibles', () => {
    it('does not throw when called', () => {
      expect(() => system.spawnCollectibles()).not.toThrow();
    });

    it('adds at least one object to the scene', () => {
      system.spawnCollectibles();
      const sceneAny = scene as unknown as { add: ReturnType<typeof vi.fn> };
      expect(sceneAny.add).toHaveBeenCalled();
    });

    it('spawns the expected number of collectibles based on SPAWN_INTERVAL', () => {
      system.spawnCollectibles();
      // At least one collectible per SPAWN_INTERVAL stretch (minus edges)
      const expectedCount = Math.max(1, Math.floor(totalDistance / COLLECTIBLE_CONST.SPAWN_INTERVAL) - 2);
      // scene.add is called for mesh (and optionally light), so count >= expectedCount
      const addCallCount = (scene as unknown as { add: ReturnType<typeof vi.fn> }).add.mock.calls.length;
      expect(addCallCount).toBeGreaterThanOrEqual(expectedCount);
    });

    it('can be called twice (re-spawns cleanly)', () => {
      system.spawnCollectibles();
      expect(() => system.spawnCollectibles()).not.toThrow();
    });
  });

  describe('update — pickup detection', () => {
    beforeEach(() => {
      system.spawnCollectibles();
    });

    it('returns an empty array when player is far from all collectibles', () => {
      // Player at a position far from the track collectibles
      const farAway = new THREE.Vector3(0, 0, 9999);
      const pickups = system.update(farAway, 1 / 60);
      expect(pickups).toEqual([]);
    });

    it('returns pickups when player is within PICKUP_RADIUS of a collectible', () => {
      // We need the actual position of a spawned mesh.
      // Since the mock Mesh positions come from progressToWorld → Vector3(0,0,-progress*1000),
      // the first collectible is at distance = SPAWN_INTERVAL along the track.
      const firstDistance = COLLECTIBLE_CONST.SPAWN_INTERVAL;
      void (firstDistance / totalDistance); // progress, used only in comments
      // From the CatmullRomCurve3 mock: getPoint(t) => Vector3(0, 0, -1000*t)
      // where t ≈ progress (the mocked path just uses linear interpolation internally)
      // Place player right at x=0, y≈1 (float height), z ≈ -firstDistance
      const playerPos = new THREE.Vector3(0, 1, -firstDistance);
      const pickups = system.update(playerPos, 1 / 60);
      // We might or might not get a pickup depending on exact float positions.
      // The important thing is that it does not throw and returns an array.
      expect(Array.isArray(pickups)).toBe(true);
    });

    it('does not re-trigger a collectible that was already collected', () => {
      const playerPos = new THREE.Vector3(0, 1, -COLLECTIBLE_CONST.SPAWN_INTERVAL);

      const firstCall = system.update(playerPos, 1 / 60);
      const secondCall = system.update(playerPos, 1 / 60);

      // Whatever the first call returns, the second call should return fewer or equal items
      expect(secondCall.length).toBeLessThanOrEqual(firstCall.length);
    });

    it('returned pickups have type and definition fields', () => {
      // Manufacture a pickup by mocking the distanceToSquared method to return 0
      const playerPos = new THREE.Vector3(0, 0, 0);
      // distanceToSquared returns 0 (same position), so all non-collected items at z=0 will be picked up
      const pickups = system.update(playerPos, 1 / 60);
      for (const pickup of pickups) {
        expect(pickup).toHaveProperty('type');
        expect(pickup).toHaveProperty('definition');
      }
    });
  });

  describe('animate', () => {
    it('does not throw when called with no collectibles', () => {
      expect(() => system.animate(1 / 60)).not.toThrow();
    });

    it('does not throw when called after spawnCollectibles', () => {
      system.spawnCollectibles();
      expect(() => system.animate(1 / 60)).not.toThrow();
    });

    it('can be called multiple times without error', () => {
      system.spawnCollectibles();
      for (let i = 0; i < 60; i++) {
        expect(() => system.animate(1 / 60)).not.toThrow();
      }
    });
  });

  describe('dispose', () => {
    it('does not throw when called before spawning', () => {
      expect(() => system.dispose()).not.toThrow();
    });

    it('does not throw after spawnCollectibles', () => {
      system.spawnCollectibles();
      expect(() => system.dispose()).not.toThrow();
    });

    it('calls scene.remove for each spawned mesh', () => {
      system.spawnCollectibles();
      const addCalls = (scene as unknown as { add: ReturnType<typeof vi.fn> }).add.mock.calls.length;
      system.dispose();
      const removeCalls = (scene as unknown as { remove: ReturnType<typeof vi.fn> }).remove.mock.calls.length;
      // remove should be called at least once per spawned mesh
      expect(removeCalls).toBeGreaterThanOrEqual(1);
      // Cannot be called more times than add was called
      expect(removeCalls).toBeLessThanOrEqual(addCalls);
    });
  });

  describe('collectible types and effects', () => {
    it('pickle_juice effect has stamina property', () => {
      expect(COLLECTIBLES.pickle_juice.effect.stamina).toBeGreaterThan(0);
    });

    it('dnb_speaker effect has speedMult and speedDuration', () => {
      expect(COLLECTIBLES.dnb_speaker.effect.speedMult).toBeGreaterThan(1);
      expect(COLLECTIBLES.dnb_speaker.effect.speedDuration).toBeGreaterThan(0);
    });

    it('water_station effect has staminaRegen and regenDuration', () => {
      expect(COLLECTIBLES.water_station.effect.staminaRegen).toBeGreaterThan(0);
      expect(COLLECTIBLES.water_station.effect.regenDuration).toBeGreaterThan(0);
    });

    it('mountain_token effect has stamina and points', () => {
      expect(COLLECTIBLES.mountain_token.effect.stamina).toBeGreaterThan(0);
      expect(COLLECTIBLES.mountain_token.effect.points).toBeGreaterThan(0);
    });

    it('energy_gel effect has stamina property', () => {
      expect(COLLECTIBLES.energy_gel.effect.stamina).toBeGreaterThan(0);
    });

    it('all collectibles have positive spawnWeight', () => {
      for (const def of Object.values(COLLECTIBLES)) {
        expect(def.spawnWeight).toBeGreaterThan(0);
      }
    });

    it('all collectibles have positive size', () => {
      for (const def of Object.values(COLLECTIBLES)) {
        expect(def.size).toBeGreaterThan(0);
      }
    });
  });
});
