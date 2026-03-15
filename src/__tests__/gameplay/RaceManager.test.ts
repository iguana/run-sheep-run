import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { RaceManager } from '@/gameplay/RaceManager';
import { TrackPath } from '@/terrain/TrackPath';
import { COMPETITORS, type AnimalType } from '@/data/characters';
import { RACE_COUNTDOWN_DURATION } from '@/game/constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStraightPath(length = 500): TrackPath {
  return new TrackPath([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -length / 2),
    new THREE.Vector3(0, 0, -length),
  ]);
}

const dt = 1 / 60;

/**
 * Advance the manager past the countdown.
 */
function skipCountdown(rm: RaceManager): void {
  const countdownTicks = Math.ceil(RACE_COUNTDOWN_DURATION / dt) + 2;
  for (let i = 0; i < countdownTicks; i++) {
    rm.update(dt, 0);
  }
}

/**
 * Drive the race until it is finished (or the safety limit is hit).
 */
function runToFinish(rm: RaceManager, maxTicks = 300_000): void {
  let tick = 0;
  while (!rm.isFinished && tick < maxTicks) {
    rm.update(dt, 0);
    tick++;
  }
}

// Grab a small set of competitors so tests are fast.
const FEW_COMPETITORS: AnimalType[] = COMPETITORS.slice(0, 3);
const RACE_ID = 'test_race';
const TOTAL_DISTANCE = 200; // short race so tests finish quickly

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RaceManager', () => {
  let path: TrackPath;

  beforeEach(() => {
    path = makeStraightPath(TOTAL_DISTANCE);
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Initialisation
  // -------------------------------------------------------------------------

  describe('initialisation', () => {
    it('creates the correct total number of runners (player + AIs)', () => {
      const rm = new RaceManager(RACE_ID, path, TOTAL_DISTANCE, FEW_COMPETITORS);
      // allRunners = player + 3 AIs
      expect(rm.allRunners).toHaveLength(FEW_COMPETITORS.length + 1);
    });

    it('creates a race with zero competitors correctly', () => {
      const rm = new RaceManager(RACE_ID, path, TOTAL_DISTANCE, []);
      expect(rm.allRunners).toHaveLength(1); // player only
    });

    it('is counting down initially', () => {
      const rm = new RaceManager(RACE_ID, path, TOTAL_DISTANCE, FEW_COMPETITORS);
      expect(rm.isCountingDown).toBe(true);
    });

    it('is not finished initially', () => {
      const rm = new RaceManager(RACE_ID, path, TOTAL_DISTANCE, FEW_COMPETITORS);
      expect(rm.isFinished).toBe(false);
    });

    it('results are null before the race finishes', () => {
      const rm = new RaceManager(RACE_ID, path, TOTAL_DISTANCE, FEW_COMPETITORS);
      expect(rm.getResults()).toBeNull();
    });

    it('playerRunner is accessible and starts at progress 0', () => {
      const rm = new RaceManager(RACE_ID, path, TOTAL_DISTANCE, FEW_COMPETITORS);
      expect(rm.playerRunner.progress).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Countdown
  // -------------------------------------------------------------------------

  describe('countdown', () => {
    it('countdownValue starts at ceil(RACE_COUNTDOWN_DURATION)', () => {
      const rm = new RaceManager(RACE_ID, path, TOTAL_DISTANCE, FEW_COMPETITORS);
      expect(rm.countdownValue).toBe(Math.ceil(RACE_COUNTDOWN_DURATION));
    });

    it('countdownValue decrements as update() is called', () => {
      const rm = new RaceManager(RACE_ID, path, TOTAL_DISTANCE, FEW_COMPETITORS);
      const initial = rm.countdownValue;
      // Advance more than 1 full second (120 ticks) so floating-point
      // accumulation definitely crosses the integer boundary.
      for (let i = 0; i < 120; i++) rm.update(dt, 0);
      expect(rm.countdownValue).toBeLessThan(initial);
    });

    it('runners do not move during countdown', () => {
      const rm = new RaceManager(RACE_ID, path, TOTAL_DISTANCE, FEW_COMPETITORS);
      // Run half the countdown
      const halfTicks = Math.floor(RACE_COUNTDOWN_DURATION / dt / 2);
      for (let i = 0; i < halfTicks; i++) rm.update(dt, 0);

      // Player should still be at start
      expect(rm.playerRunner.progress).toBe(0);
    });

    it('race starts (isCountingDown = false) after countdown expires', () => {
      const rm = new RaceManager(RACE_ID, path, TOTAL_DISTANCE, FEW_COMPETITORS);
      skipCountdown(rm);
      expect(rm.isCountingDown).toBe(false);
    });

    it('runners advance after countdown ends', () => {
      const rm = new RaceManager(RACE_ID, path, TOTAL_DISTANCE, FEW_COMPETITORS);
      skipCountdown(rm);
      // Run a few more ticks
      for (let i = 0; i < 60; i++) rm.update(dt, 0);
      expect(rm.playerRunner.progress).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Position tracking
  // -------------------------------------------------------------------------

  describe('position tracking', () => {
    it('getPositions returns one entry per runner', () => {
      const rm = new RaceManager(RACE_ID, path, TOTAL_DISTANCE, FEW_COMPETITORS);
      skipCountdown(rm);
      const positions = rm.getPositions();
      expect(positions).toHaveLength(FEW_COMPETITORS.length + 1);
    });

    it('getPositions entries have name, progress, and position fields', () => {
      const rm = new RaceManager(RACE_ID, path, TOTAL_DISTANCE, FEW_COMPETITORS);
      skipCountdown(rm);
      const positions = rm.getPositions();
      for (const entry of positions) {
        expect(typeof entry.name).toBe('string');
        expect(typeof entry.progress).toBe('number');
        expect(typeof entry.position).toBe('number');
      }
    });

    it('positions are sorted: position 1 has the highest progress', () => {
      const rm = new RaceManager(RACE_ID, path, TOTAL_DISTANCE, FEW_COMPETITORS);
      skipCountdown(rm);
      for (let i = 0; i < 120; i++) rm.update(dt, 0);
      const positions = rm.getPositions();
      const sorted = [...positions].sort((a, b) => a.position - b.position);
      for (let i = 0; i < sorted.length - 1; i++) {
        expect(sorted[i]!.progress).toBeGreaterThanOrEqual(sorted[i + 1]!.progress);
      }
    });

    it('all position values are unique integers from 1 to n', () => {
      const rm = new RaceManager(RACE_ID, path, TOTAL_DISTANCE, FEW_COMPETITORS);
      skipCountdown(rm);
      for (let i = 0; i < 60; i++) rm.update(dt, 0);
      const positions = rm.getPositions().map((p) => p.position).sort((a, b) => a - b);
      const expected = Array.from({ length: FEW_COMPETITORS.length + 1 }, (_, i) => i + 1);
      expect(positions).toEqual(expected);
    });

    it('getPlayerPosition returns a number between 1 and total runners', () => {
      const rm = new RaceManager(RACE_ID, path, TOTAL_DISTANCE, FEW_COMPETITORS);
      skipCountdown(rm);
      for (let i = 0; i < 60; i++) rm.update(dt, 0);
      const pos = rm.getPlayerPosition();
      expect(pos).toBeGreaterThanOrEqual(1);
      expect(pos).toBeLessThanOrEqual(FEW_COMPETITORS.length + 1);
    });
  });

  // -------------------------------------------------------------------------
  // Race finish and results
  // -------------------------------------------------------------------------

  describe('race completion', () => {
    it('isFinished becomes true once all runners cross the finish', () => {
      const rm = new RaceManager(RACE_ID, path, TOTAL_DISTANCE, FEW_COMPETITORS);
      runToFinish(rm);
      expect(rm.isFinished).toBe(true);
    });

    it('getResults returns a non-null object after the race ends', () => {
      const rm = new RaceManager(RACE_ID, path, TOTAL_DISTANCE, FEW_COMPETITORS);
      runToFinish(rm);
      expect(rm.getResults()).not.toBeNull();
    });

    it('results.raceId matches the id passed to the constructor', () => {
      const rm = new RaceManager(RACE_ID, path, TOTAL_DISTANCE, FEW_COMPETITORS);
      runToFinish(rm);
      expect(rm.getResults()?.raceId).toBe(RACE_ID);
    });

    it('results.runners has one entry per runner', () => {
      const rm = new RaceManager(RACE_ID, path, TOTAL_DISTANCE, FEW_COMPETITORS);
      runToFinish(rm);
      const results = rm.getResults();
      expect(results?.runners).toHaveLength(FEW_COMPETITORS.length + 1);
    });

    it('results include a runner named "You" (the player)', () => {
      const rm = new RaceManager(RACE_ID, path, TOTAL_DISTANCE, FEW_COMPETITORS);
      runToFinish(rm);
      const player = rm.getResults()?.runners.find((r) => r.name === 'You');
      expect(player).toBeDefined();
    });

    it('results.playerPosition is between 1 and total runners', () => {
      const rm = new RaceManager(RACE_ID, path, TOTAL_DISTANCE, FEW_COMPETITORS);
      runToFinish(rm);
      const results = rm.getResults();
      expect(results?.playerPosition).toBeGreaterThanOrEqual(1);
      expect(results?.playerPosition).toBeLessThanOrEqual(FEW_COMPETITORS.length + 1);
    });

    it('all runner finish times are positive', () => {
      const rm = new RaceManager(RACE_ID, path, TOTAL_DISTANCE, FEW_COMPETITORS);
      runToFinish(rm);
      const results = rm.getResults();
      for (const r of results?.runners ?? []) {
        expect(r.time).toBeGreaterThan(0);
      }
    });

    it('runner positions in results cover 1 through N without gaps', () => {
      const rm = new RaceManager(RACE_ID, path, TOTAL_DISTANCE, FEW_COMPETITORS);
      runToFinish(rm);
      const positions = (rm.getResults()?.runners ?? [])
        .map((r) => r.position)
        .sort((a, b) => a - b);
      const expected = Array.from({ length: FEW_COMPETITORS.length + 1 }, (_, i) => i + 1);
      expect(positions).toEqual(expected);
    });

    it('update() is a no-op once the race is finished', () => {
      const rm = new RaceManager(RACE_ID, path, TOTAL_DISTANCE, FEW_COMPETITORS);
      runToFinish(rm);
      const progressAfterFinish = rm.playerRunner.progress;
      rm.update(dt, 0);
      expect(rm.playerRunner.progress).toBe(progressAfterFinish);
    });
  });

  // -------------------------------------------------------------------------
  // Collectible tracking
  // -------------------------------------------------------------------------

  describe('collectible tracking', () => {
    it('recordCollectible increments the internal counter', () => {
      const rm = new RaceManager(RACE_ID, path, TOTAL_DISTANCE, FEW_COMPETITORS);
      runToFinish(rm);
      // Run again with collectibles recorded before the race ends
      const rm2 = new RaceManager(RACE_ID, path, TOTAL_DISTANCE, FEW_COMPETITORS);
      skipCountdown(rm2);
      rm2.recordCollectible();
      rm2.recordCollectible();
      runToFinish(rm2);
      expect(rm2.getResults()?.collectiblesGathered).toBe(2);
    });

    it('collectiblesGathered is 0 when no collectibles were recorded', () => {
      const rm = new RaceManager(RACE_ID, path, TOTAL_DISTANCE, FEW_COMPETITORS);
      runToFinish(rm);
      expect(rm.getResults()?.collectiblesGathered).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // dispose
  // -------------------------------------------------------------------------

  describe('dispose', () => {
    it('does not throw', () => {
      const rm = new RaceManager(RACE_ID, path, TOTAL_DISTANCE, FEW_COMPETITORS);
      expect(() => rm.dispose()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // resolveSpeedProfile static utility
  // -------------------------------------------------------------------------

  describe('RaceManager.resolveSpeedProfile', () => {
    it('returns the speedProfile of the given animal', () => {
      const animal = COMPETITORS[0]!;
      expect(RaceManager.resolveSpeedProfile(animal)).toBe(animal.speedProfile);
    });
  });
});
