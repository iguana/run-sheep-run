import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { AIRunnerController, type SpeedProfile } from '@/gameplay/AIRunnerController';
import { RunnerPhysics } from '@/gameplay/RunnerPhysics';
import { TrackPath } from '@/terrain/TrackPath';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStraightPath(length = 2000): TrackPath {
  return new TrackPath([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -length / 2),
    new THREE.Vector3(0, 0, -length),
  ]);
}

function makeRunner(path: TrackPath, totalDistance: number): RunnerPhysics {
  return new RunnerPhysics(path, totalDistance);
}

function runAITicks(
  controller: AIRunnerController,
  n: number,
  dt: number = 1 / 60,
): void {
  for (let i = 0; i < n; i++) {
    const raceProgress = Math.min(1, (i * dt) / 50); // synthetic race progress
    controller.update(dt, raceProgress, 0);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AIRunnerController', () => {
  const totalDistance = 2000;
  let path: TrackPath;

  beforeEach(() => {
    path = makeStraightPath(totalDistance);
  });

  describe('basic forward movement', () => {
    const profiles: SpeedProfile[] = ['sprinter', 'endurance', 'balanced', 'steady'];

    for (const profile of profiles) {
      it(`${profile} AI runner advances trackProgress after 120 ticks`, () => {
        const runner = makeRunner(path, totalDistance);
        const controller = new AIRunnerController(runner, profile, 1.0);
        runAITicks(controller, 120);
        expect(runner.state.trackProgress).toBeGreaterThan(0);
      });
    }

    it('AI runner covers distance over time', () => {
      const runner = makeRunner(path, totalDistance);
      const controller = new AIRunnerController(runner, 'balanced', 1.0);
      runAITicks(controller, 180);
      expect(runner.state.distanceCovered).toBeGreaterThan(0);
    });
  });

  describe('difficulty scaling', () => {
    it('higher difficulty AI is faster than lower difficulty AI', () => {
      const runner1 = makeRunner(path, totalDistance);
      const runner2 = makeRunner(path, totalDistance);
      const controller1 = new AIRunnerController(runner1, 'steady', 0.8);
      const controller2 = new AIRunnerController(runner2, 'steady', 1.2);

      // Run both for the same number of ticks
      for (let i = 0; i < 300; i++) {
        const raceProgress = i / 300;
        controller1.update(1 / 60, raceProgress, 0);
        controller2.update(1 / 60, raceProgress, 0);
      }

      expect(runner2.state.distanceCovered).toBeGreaterThan(runner1.state.distanceCovered);
    });

    it('difficulty is clamped to [0.8, 1.2] range', () => {
      // These should not throw regardless of clamping
      expect(() => {
        const runner = makeRunner(path, totalDistance);
        const ctrl = new AIRunnerController(runner, 'steady', 2.0); // clamped to 1.2
        ctrl.update(1 / 60, 0, 0);
      }).not.toThrow();

      expect(() => {
        const runner = makeRunner(path, totalDistance);
        const ctrl = new AIRunnerController(runner, 'steady', 0.1); // clamped to 0.8
        ctrl.update(1 / 60, 0, 0);
      }).not.toThrow();
    });
  });

  describe('speed profiles have different behaviors', () => {
    /**
     * Helper: run a profile for N ticks and return a snapshot of progress
     * at the 1/3, 2/3, and full marks.
     */
    function profileSnapshot(profile: SpeedProfile, ticks: number): {
      earlyProgress: number;
      midProgress: number;
      finalProgress: number;
    } {
      const runner = makeRunner(path, totalDistance);
      const controller = new AIRunnerController(runner, profile, 1.0);

      const third = Math.floor(ticks / 3);
      const two_third = Math.floor((2 * ticks) / 3);

      for (let i = 0; i < third; i++) {
        controller.update(1 / 60, i / ticks, 0);
      }
      const earlyProgress = runner.state.trackProgress;

      for (let i = third; i < two_third; i++) {
        controller.update(1 / 60, i / ticks, 0);
      }
      const midProgress = runner.state.trackProgress;

      for (let i = two_third; i < ticks; i++) {
        controller.update(1 / 60, i / ticks, 0);
      }
      const finalProgress = runner.state.trackProgress;

      return { earlyProgress, midProgress, finalProgress };
    }

    it('all profiles produce increasing progress over time', () => {
      for (const profile of ['sprinter', 'endurance', 'balanced', 'steady'] as SpeedProfile[]) {
        const snap = profileSnapshot(profile, 600);
        expect(snap.midProgress).toBeGreaterThan(snap.earlyProgress);
        expect(snap.finalProgress).toBeGreaterThan(snap.midProgress);
      }
    });

    it('sprinter gains more ground early than endurance', () => {
      const sprinterSnap = profileSnapshot('sprinter', 600);
      const enduranceSnap = profileSnapshot('endurance', 600);
      // Sprinter should be further ahead at the early mark
      expect(sprinterSnap.earlyProgress).toBeGreaterThan(enduranceSnap.earlyProgress);
    });
  });

  describe('no NaN values produced', () => {
    const profiles: SpeedProfile[] = ['sprinter', 'endurance', 'balanced', 'steady'];

    for (const profile of profiles) {
      it(`${profile} AI produces no NaN values after 600 ticks`, () => {
        const runner = makeRunner(path, totalDistance);
        const controller = new AIRunnerController(runner, profile, 1.0);
        runAITicks(controller, 600);

        const s = runner.state;
        expect(isNaN(s.speed)).toBe(false);
        expect(isNaN(s.stamina)).toBe(false);
        expect(isNaN(s.trackProgress)).toBe(false);
        expect(isNaN(s.lateralOffset)).toBe(false);
        expect(isNaN(s.worldPosition.x)).toBe(false);
        expect(isNaN(s.worldPosition.z)).toBe(false);
        expect(isNaN(s.heading)).toBe(false);
      });
    }
  });

  describe('stamina management', () => {
    it('AI does not bonk (stamina is kept positive by passive regen)', () => {
      const runner = makeRunner(path, totalDistance);
      const controller = new AIRunnerController(runner, 'sprinter', 1.2);

      // Run for a long time — AI should not stay in bonk
      for (let i = 0; i < 1800; i++) {
        controller.update(1 / 60, i / 1800, 0);
      }

      // After recovery ticks, it should not be bonking
      expect(runner.state.isBonking).toBe(false);
    });

    it('stamina stays in [0, 1] range throughout', () => {
      const runner = makeRunner(path, totalDistance);
      const controller = new AIRunnerController(runner, 'sprinter', 1.2);

      for (let i = 0; i < 600; i++) {
        controller.update(1 / 60, i / 600, 0);
        expect(runner.state.stamina).toBeGreaterThanOrEqual(0);
        expect(runner.state.stamina).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('lateral steering', () => {
    it('AI lateral offset stays within track bounds', () => {
      const runner = makeRunner(path, totalDistance);
      const controller = new AIRunnerController(runner, 'balanced', 1.0);

      for (let i = 0; i < 600; i++) {
        controller.update(1 / 60, i / 600, 0);
        expect(Math.abs(runner.state.lateralOffset)).toBeLessThanOrEqual(
          path.lateralClamp + 0.01, // tiny tolerance for float rounding
        );
      }
    });
  });

  describe('player progress affects AI pace', () => {
    it('AI paceIntent computation does not throw with any progress combination', () => {
      const runner = makeRunner(path, totalDistance);
      const controller = new AIRunnerController(runner, 'balanced', 1.0);

      // Simulate various race-progress / player-progress combinations
      const cases = [
        { raceProgress: 0, playerProgress: 0 },
        { raceProgress: 0.5, playerProgress: 0.6 },
        { raceProgress: 1, playerProgress: 1 },
        { raceProgress: 0.2, playerProgress: 0 },
      ];

      for (const { raceProgress, playerProgress } of cases) {
        expect(() => controller.update(1 / 60, raceProgress, playerProgress)).not.toThrow();
      }
    });
  });
});
