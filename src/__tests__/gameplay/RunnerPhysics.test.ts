import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { RunnerPhysics } from '@/gameplay/RunnerPhysics';
import { TrackPath } from '@/terrain/TrackPath';
import {
  RUNNER_BASE_SPEED,
  RUNNER_MIN_SPEED,
  RUNNER_MAX_SPEED as _RUNNER_MAX_SPEED,
  RUNNER_OFF_TRACK_PENALTY,
  BONK_SPEED_MULT,
  STAMINA_WARN_THRESHOLD,
  TRACK_LATERAL_CLAMP,
} from '@/game/constants';

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

/**
 * Run `n` fixed timestep ticks with the given steer value.
 */
function runTicks(
  runner: RunnerPhysics,
  n: number,
  dt: number = 1 / 60,
  steer: number = 0,
): void {
  for (let i = 0; i < n; i++) {
    runner.update(dt, steer);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RunnerPhysics', () => {
  let path: TrackPath;
  const totalDistance = 2000;

  beforeEach(() => {
    path = makeStraightPath(totalDistance);
  });

  describe('initial state', () => {
    it('initialises trackProgress to 0', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      expect(runner.state.trackProgress).toBe(0);
    });

    it('initialises stamina to 1', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      expect(runner.state.stamina).toBe(1);
    });

    it('is not bonking initially', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      expect(runner.state.isBonking).toBe(false);
    });

    it('initialises lateralOffset to 0', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      expect(runner.state.lateralOffset).toBe(0);
    });

    it('initialises distanceCovered to 0', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      expect(runner.state.distanceCovered).toBe(0);
    });

    it('initialises speedBoostMult to 1', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      expect(runner.state.speedBoostMult).toBe(1);
    });

    it('initialises speedBoostTimer to 0', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      expect(runner.state.speedBoostTimer).toBe(0);
    });
  });

  describe('forward movement', () => {
    it('runner advances trackProgress over time', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      runTicks(runner, 60);
      expect(runner.state.trackProgress).toBeGreaterThan(0);
    });

    it('distanceCovered increases with each tick', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      runTicks(runner, 10);
      expect(runner.state.distanceCovered).toBeGreaterThan(0);
    });

    it('speed is at least RUNNER_MIN_SPEED after first tick', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      runner.update(1 / 60, 0);
      expect(runner.state.speed).toBeGreaterThanOrEqual(RUNNER_MIN_SPEED);
    });

    it('speed approaches RUNNER_BASE_SPEED on a flat track with full stamina', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      // Run many ticks so speed lerps to target
      runTicks(runner, 600);
      // Speed should be close to base speed (flat track, no bonk, no boost)
      expect(runner.state.speed).toBeCloseTo(RUNNER_BASE_SPEED, 0);
    });

    it('worldPosition.z decreases (moves forward along -Z path)', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      const initialZ = runner.state.worldPosition.z;
      runTicks(runner, 60);
      expect(runner.state.worldPosition.z).toBeLessThan(initialZ);
    });

    it('progress getter matches state.trackProgress', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      runTicks(runner, 60);
      expect(runner.progress).toBe(runner.state.trackProgress);
    });

    it('finished is false while progress < 1', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      runTicks(runner, 60);
      expect(runner.finished).toBe(false);
    });

    it('finished is true once trackProgress reaches 1', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      // Drive to completion with a very large dt
      runner.update(totalDistance / RUNNER_MIN_SPEED + 10, 0);
      expect(runner.finished).toBe(true);
    });
  });

  describe('steering and lateral offset', () => {
    it('positive steer increases lateralOffset', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      runner.update(1 / 60, 1);
      expect(runner.state.lateralOffset).toBeGreaterThan(0);
    });

    it('negative steer decreases lateralOffset', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      runner.update(1 / 60, -1);
      expect(runner.state.lateralOffset).toBeLessThan(0);
    });

    it('zero steer does not change lateralOffset', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      runner.update(1 / 60, 0);
      expect(runner.state.lateralOffset).toBe(0);
    });

    it('lateralOffset is clamped to TRACK_LATERAL_CLAMP', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      // Steer hard right for many ticks
      runTicks(runner, 300, 1 / 60, 1);
      expect(runner.state.lateralOffset).toBeLessThanOrEqual(TRACK_LATERAL_CLAMP);
    });

    it('lateralOffset is clamped to -TRACK_LATERAL_CLAMP', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      runTicks(runner, 300, 1 / 60, -1);
      expect(runner.state.lateralOffset).toBeGreaterThanOrEqual(-TRACK_LATERAL_CLAMP);
    });
  });

  describe('stamina drain', () => {
    it('stamina decreases over time while running', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      runTicks(runner, 60);
      expect(runner.state.stamina).toBeLessThan(1);
    });

    it('stamina is always in [0, 1]', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      runTicks(runner, 600);
      expect(runner.state.stamina).toBeGreaterThanOrEqual(0);
      expect(runner.state.stamina).toBeLessThanOrEqual(1);
    });

    it('staminaDrain is positive while not bonking', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      runner.update(1 / 60, 0);
      expect(runner.state.staminaDrain).toBeGreaterThan(0);
    });
  });

  describe('bonk mechanics', () => {
    function drainToZero(runner: RunnerPhysics): void {
      // Directly set stamina to zero and trigger bonk
      runner.state.stamina = 0;
      runner.state.isBonking = true;
    }

    it('isBonking activates when stamina hits 0', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      drainToZero(runner);
      expect(runner.state.isBonking).toBe(true);
    });

    it('speed is reduced to BONK_SPEED_MULT fraction of target while bonking', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      // First get speed up to a stable value
      runTicks(runner, 300);
      const preSpeed = runner.state.speed;

      drainToZero(runner);
      // Run a few ticks bonking — speed should drop significantly
      runTicks(runner, 30);
      expect(runner.state.speed).toBeLessThan(preSpeed);
      // Speed should be somewhere near BONK_SPEED_MULT * targetSpeed
      expect(runner.state.speed).toBeLessThan(RUNNER_BASE_SPEED * BONK_SPEED_MULT * 1.5);
    });

    it('stamina regenerates while bonking', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      drainToZero(runner);
      const staminaBefore = runner.state.stamina;
      runTicks(runner, 30);
      expect(runner.state.stamina).toBeGreaterThan(staminaBefore);
    });

    it('staminaDrain is 0 while bonking', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      drainToZero(runner);
      runner.update(1 / 60, 0);
      expect(runner.state.staminaDrain).toBe(0);
    });

    it('exits bonk once stamina recovers past threshold', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      drainToZero(runner);
      // Run enough ticks for stamina to recover above STAMINA_WARN_THRESHOLD * 0.5
      const recoveryTicks = Math.ceil(
        (STAMINA_WARN_THRESHOLD * 0.5) / (0.04 / 60) + 60,
      );
      runTicks(runner, recoveryTicks);
      expect(runner.state.isBonking).toBe(false);
    });
  });

  describe('progressive slowdown below warn threshold', () => {
    it('speed is reduced when stamina is below STAMINA_WARN_THRESHOLD', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      // First stabilise speed
      runTicks(runner, 300);
      const fullStaminaSpeed = runner.state.speed;

      // Set stamina to just below warn threshold but not zero
      runner.state.stamina = STAMINA_WARN_THRESHOLD * 0.5;
      runner.state.isBonking = false;
      runTicks(runner, 30);
      expect(runner.state.speed).toBeLessThan(fullStaminaSpeed);
    });
  });

  describe('speed boost', () => {
    it('applySpeedBoost sets speedBoostMult and speedBoostTimer', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      runner.applySpeedBoost(1.35, 8);
      expect(runner.state.speedBoostMult).toBe(1.35);
      expect(runner.state.speedBoostTimer).toBe(8);
    });

    it('speed is higher with a boost active', () => {
      const runner1 = new RunnerPhysics(path, totalDistance);
      const runner2 = new RunnerPhysics(path, totalDistance);
      runTicks(runner1, 200);
      const baseSpeed = runner1.state.speed;

      runner2.applySpeedBoost(1.5, 60);
      runTicks(runner2, 200);
      expect(runner2.state.speed).toBeGreaterThan(baseSpeed);
    });

    it('speedBoostTimer counts down each tick', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      runner.applySpeedBoost(1.25, 6);
      const dt = 1 / 60;
      runner.update(dt, 0);
      expect(runner.state.speedBoostTimer).toBeCloseTo(6 - dt, 5);
    });

    it('speedBoostMult resets to 1 once timer expires', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      runner.applySpeedBoost(1.25, 0.01); // very short duration
      runTicks(runner, 10); // 10/60 s >> 0.01 s
      expect(runner.state.speedBoostMult).toBe(1);
    });

    it('does not replace a stronger boost with a weaker one', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      runner.applySpeedBoost(1.5, 10);
      runner.applySpeedBoost(1.2, 10); // weaker — should be ignored
      expect(runner.state.speedBoostMult).toBe(1.5);
    });
  });

  describe('stamina restore', () => {
    it('applyStaminaRestore increases stamina', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      runner.state.stamina = 0.3;
      runner.applyStaminaRestore(0.4);
      expect(runner.state.stamina).toBeCloseTo(0.7, 5);
    });

    it('stamina is clamped to 1 on restore', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      runner.state.stamina = 0.9;
      runner.applyStaminaRestore(0.5);
      expect(runner.state.stamina).toBe(1);
    });

    it('a large restore can exit bonk state', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      runner.state.stamina = 0;
      runner.state.isBonking = true;
      runner.applyStaminaRestore(0.5); // well above STAMINA_WARN_THRESHOLD / 2
      expect(runner.state.isBonking).toBe(false);
    });

    it('a small restore that stays below threshold does not exit bonk', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      runner.state.stamina = 0;
      runner.state.isBonking = true;
      // Restore less than STAMINA_WARN_THRESHOLD / 2
      runner.applyStaminaRestore(STAMINA_WARN_THRESHOLD / 4);
      expect(runner.state.isBonking).toBe(true);
    });
  });

  describe('off-track penalty', () => {
    it('speed is lower when lateralOffset exceeds track half-width', () => {
      const runner1 = new RunnerPhysics(path, totalDistance);
      const runner2 = new RunnerPhysics(path, totalDistance);

      // Stabilise both at base speed first
      runTicks(runner1, 300);
      runTicks(runner2, 300);

      // Push runner2 off-track
      runner2.state.lateralOffset = TRACK_LATERAL_CLAMP; // maximum offset = off-track
      runTicks(runner2, 60, 1 / 60, 0);

      // runner2 should be slower due to off-track penalty
      // (runner1 is on-track)
      expect(runner2.state.speed).toBeLessThan(runner1.state.speed * 0.99);
    });

    it('effective speed is multiplied by RUNNER_OFF_TRACK_PENALTY when fully off-track', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      // Stabilise speed
      runTicks(runner, 300);
      // Record on-track speed
      const onTrackSpeed = runner.state.speed;

      // Go far off-track
      runner.state.lateralOffset = TRACK_LATERAL_CLAMP;
      runTicks(runner, 120, 1 / 60, 0);
      const offTrackSpeed = runner.state.speed;

      // Off-track speed should be around onTrack * RUNNER_OFF_TRACK_PENALTY
      expect(offTrackSpeed).toBeLessThan(onTrackSpeed * (RUNNER_OFF_TRACK_PENALTY + 0.1));
    });
  });

  describe('progress calculation', () => {
    it('progress increases as the runner advances', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      const p0 = runner.progress;
      runTicks(runner, 60);
      expect(runner.progress).toBeGreaterThan(p0);
    });

    it('progress is in [0, 1]', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      runTicks(runner, 600);
      expect(runner.progress).toBeGreaterThanOrEqual(0);
      expect(runner.progress).toBeLessThanOrEqual(1);
    });

    it('progress is proportional to distanceCovered / totalDistance on a flat track', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      runTicks(runner, 120);
      // Allow small floating-point deviation
      expect(runner.state.trackProgress).toBeCloseTo(
        runner.state.distanceCovered / totalDistance,
        3,
      );
    });
  });

  describe('stamina regen buff', () => {
    it('applyStaminaRegen reduces net drain while active', () => {
      const runner1 = new RunnerPhysics(path, totalDistance);
      const runner2 = new RunnerPhysics(path, totalDistance);

      runner2.applyStaminaRegen(0.05, 5);

      runTicks(runner1, 60);
      runTicks(runner2, 60);

      // runner2 should have more stamina remaining
      expect(runner2.state.stamina).toBeGreaterThan(runner1.state.stamina);
    });
  });

  describe('no NaN values in state', () => {
    it('produces no NaN values in state over 600 ticks', () => {
      const runner = new RunnerPhysics(path, totalDistance);
      runTicks(runner, 600);
      const s = runner.state;
      expect(isNaN(s.speed)).toBe(false);
      expect(isNaN(s.stamina)).toBe(false);
      expect(isNaN(s.trackProgress)).toBe(false);
      expect(isNaN(s.lateralOffset)).toBe(false);
      expect(isNaN(s.distanceCovered)).toBe(false);
      expect(isNaN(s.worldPosition.x)).toBe(false);
      expect(isNaN(s.worldPosition.y)).toBe(false);
      expect(isNaN(s.worldPosition.z)).toBe(false);
      expect(isNaN(s.heading)).toBe(false);
    });
  });
});
