/**
 * RunnerPhysics - Core movement simulation for any runner (player or AI).
 *
 * Speed is automatic — the runner always tries to move forward. The caller
 * supplies only a lateral steer input in [-1, 1]. Physics rules:
 *
 *  Speed pipeline (each multiplier stacks):
 *    1. Base speed from topSpeed
 *    2. Slope modifier    — uphill slows, downhill accelerates slightly
 *    3. Off-track penalty — lateral overshoot is penalised
 *    4. Stamina modifier  — below warn threshold: linear slowdown; at 0: bonk
 *    5. Active boosts     — time-limited speed multipliers from collectibles
 *
 *  Stamina drain:
 *    drain/s = BASE_DRAIN + SPEED_COEFF * max(0, currentSpeed - BASE_SPEED)^2
 *    This gives exponentially higher drain at sprint speeds.
 *
 *  Bonk:
 *    When stamina hits 0 the runner enters a bonk state. Speed drops to
 *    BONK_SPEED_MULT of targetSpeed. Stamina slowly recovers at BONK_REGEN
 *    rate. Bonk ends once stamina climbs back above STAMINA_WARN_THRESHOLD / 2.
 *
 *  Stamina regen buff (water station):
 *    A time-limited passive regen rate is added on top of normal drain.
 *
 *  Leg phase / body bob:
 *    legPhase advances proportionally to speed (radians per metre travelled).
 *    bodyBob is sin(legPhase) * amplitude — consumed by the renderer.
 */

import * as THREE from 'three';
import {
  RUNNER_BASE_SPEED,
  RUNNER_MAX_SPEED,
  RUNNER_MIN_SPEED,
  RUNNER_LATERAL_SPEED,
  RUNNER_OFF_TRACK_PENALTY,
  RUNNER_SLOPE_FACTOR,
  STAMINA_WARN_THRESHOLD,
  BONK_SPEED_MULT,
  STAMINA_DRAIN_BASE,
  STAMINA_DRAIN_SPEED_COEFF,
  BONK_STAMINA_REGEN,
  LEG_PHASE_RATE,
  BODY_BOB_AMPLITUDE,
  TRACK_LATERAL_CLAMP,
} from '../game/constants';
import type { TrackPath } from '../terrain/TrackPath';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RunnerState {
  /** Normalised progress along the track [0, 1]. */
  trackProgress: number;
  /** Metres from track centre, positive = right. */
  lateralOffset: number;
  /** World-space position, updated each tick. */
  worldPosition: THREE.Vector3;
  /** Yaw in radians (world Y-axis rotation). */
  heading: number;
  /** Current forward speed in m/s. */
  speed: number;
  /** Desired (uncapped, unbuffed) forward speed in m/s. */
  targetSpeed: number;
  /** Stamina in [0, 1]. */
  stamina: number;
  /** Current stamina drain rate (fraction/s) — informational. */
  staminaDrain: number;
  /** True while the runner is in a bonk (stamina == 0 slowdown). */
  isBonking: boolean;
  /** Running leg animation phase (radians). */
  legPhase: number;
  /** Vertical body bob value (metres, consumed by renderer). */
  bodyBob: number;
  /** Cumulative metres covered this race. */
  distanceCovered: number;
  /** Remaining seconds of the active speed boost (0 = none). */
  speedBoostTimer: number;
  /** Active speed boost multiplier (1 = none). */
  speedBoostMult: number;
  /** Vertical jump velocity (m/s). */
  jumpVelocity: number;
  /** Current jump height above ground (m). */
  jumpHeight: number;
  /** True while airborne. */
  isJumping: boolean;
  /** True while an auto-sprint boost is active. */
  isSprinting: boolean;
  /** Remaining seconds of the current sprint. */
  sprintTimer: number;
  /** Remaining seconds until sprint can be used again. */
  sprintCooldown: number;
}

// ---------------------------------------------------------------------------
// Internal state (not exposed)
// ---------------------------------------------------------------------------

interface InternalBuffs {
  /** Remaining seconds of stamina regen buff. */
  regenTimer: number;
  /** Extra stamina regen rate from the buff (fraction/s). */
  regenRate: number;
}

// ---------------------------------------------------------------------------
// Class
// ---------------------------------------------------------------------------

export class RunnerPhysics {
  state: RunnerState;

  private readonly trackPath: TrackPath;
  private readonly totalDistance: number;
  private buffs: InternalBuffs = { regenTimer: 0, regenRate: 0 };

  constructor(trackPath: TrackPath, totalDistance: number) {
    this.trackPath = trackPath;
    this.totalDistance = totalDistance;

    this.state = {
      trackProgress: 0,
      lateralOffset: 0,
      worldPosition: new THREE.Vector3(),
      heading: 0,
      speed: 0,
      targetSpeed: RUNNER_BASE_SPEED,
      stamina: 1,
      staminaDrain: STAMINA_DRAIN_BASE,
      isBonking: false,
      legPhase: 0,
      bodyBob: 0,
      distanceCovered: 0,
      speedBoostTimer: 0,
      speedBoostMult: 1,
      jumpVelocity: 0,
      jumpHeight: 0,
      isJumping: false,
      isSprinting: false,
      sprintTimer: 0,
      sprintCooldown: 0,
    };

    // Snap to start position immediately.
    this._syncWorldPosition();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Advance physics by one fixed timestep.
   *
   * @param dt          Fixed timestep in seconds.
   * @param steerInput  Lateral steer in [-1, 1]. Positive = steer right.
   */
  update(dt: number, steerInput: number): void {
    const s = this.state;

    // 1. Update boost timer.
    if (s.speedBoostTimer > 0) {
      s.speedBoostTimer = Math.max(0, s.speedBoostTimer - dt);
      if (s.speedBoostTimer === 0) {
        s.speedBoostMult = 1;
      }
    }

    // 1b. Update sprint timer and cooldown.
    if (s.sprintCooldown > 0) {
      s.sprintCooldown = Math.max(0, s.sprintCooldown - dt);
    }
    if (s.isSprinting) {
      s.sprintTimer = Math.max(0, s.sprintTimer - dt);
      if (s.sprintTimer === 0) {
        s.isSprinting = false;
        s.sprintCooldown = 10; // 10-second cooldown after sprint expires
      }
    }

    // 2. Compute slope modifier.
    const distance = s.trackProgress * this.totalDistance;
    const slope = this.trackPath.getSlopeAtDistance(distance);
    const slopeModifier = 1 - slope * RUNNER_SLOPE_FACTOR;

    // 3. Lateral movement.
    const lateralDelta = steerInput * RUNNER_LATERAL_SPEED * dt;
    s.lateralOffset = Math.max(
      -TRACK_LATERAL_CLAMP,
      Math.min(TRACK_LATERAL_CLAMP, s.lateralOffset + lateralDelta),
    );

    // 4. Off-track penalty.
    const trackHalfWidth = this.trackPath.getWidthAtDistance(distance) / 2;
    const absLateral = Math.abs(s.lateralOffset);
    const isOffTrack = absLateral > trackHalfWidth;
    const offTrackPenalty = isOffTrack ? RUNNER_OFF_TRACK_PENALTY : 1;

    // 5. Stamina modifier + bonk.
    const { speedMult: staminaMult } = this._updateStamina(dt, s);

    // 6. Resolve actual speed.
    s.targetSpeed = RUNNER_BASE_SPEED * slopeModifier;
    const sprintMult = s.isSprinting ? 1.8 : 1;
    const effectiveSpeed =
      s.targetSpeed * staminaMult * offTrackPenalty * s.speedBoostMult * sprintMult;

    // Smoothly approach target speed (simple lerp — feels more natural than instant).
    const speedLerp = 1 - Math.pow(0.001, dt); // ~fast approach
    s.speed = s.speed + (effectiveSpeed - s.speed) * speedLerp;
    s.speed = Math.max(RUNNER_MIN_SPEED, Math.min(RUNNER_MAX_SPEED, s.speed));

    // 7. Advance along track.
    const metresToTravel = s.speed * dt;
    s.distanceCovered += metresToTravel;
    s.trackProgress = Math.min(
      1,
      s.trackProgress + metresToTravel / this.totalDistance,
    );

    // 8. Animation.
    s.legPhase += metresToTravel * LEG_PHASE_RATE;
    s.bodyBob = Math.sin(s.legPhase) * BODY_BOB_AMPLITUDE;

    // 9. Jump physics.
    if (s.isJumping) {
      s.jumpHeight += s.jumpVelocity * dt;
      s.jumpVelocity -= 15 * dt; // reduced gravity for a floatier, more fun arc
      if (s.jumpHeight <= 0) {
        s.jumpHeight = 0;
        s.jumpVelocity = 0;
        s.isJumping = false;
      }
    }

    // 10. Sync world position from spline.
    this._syncWorldPosition();
  }

  /** Instantly restore `amount` fraction of stamina (clamped to 1). */
  applyStaminaRestore(amount: number): void {
    this.state.stamina = Math.min(1, this.state.stamina + amount);
    // A stamina restore can pull out of bonk if it crosses the recovery threshold.
    if (this.state.stamina > STAMINA_WARN_THRESHOLD / 2) {
      this.state.isBonking = false;
    }
  }

  /**
   * Apply a timed speed boost. Subsequent calls replace the existing boost
   * if the new multiplier is higher or the existing boost is nearly expired.
   */
  applySpeedBoost(multiplier: number, duration: number): void {
    if (multiplier > this.state.speedBoostMult || this.state.speedBoostTimer < 0.5) {
      this.state.speedBoostMult = multiplier;
      this.state.speedBoostTimer = duration;
    }
  }

  /**
   * Activate a 3-second sprint boost (1.8x speed).
   * Ignored while the 10-second cooldown is active.
   */
  activateSprint(): void {
    if (this.state.sprintCooldown > 0) return;
    this.state.isSprinting = true;
    this.state.sprintTimer = 3;
    this.state.speedBoostMult = 1; // sprint uses its own multiplier, clear any weaker boost
  }

  /** Trigger a jump if the runner is on the ground. */
  jump(): void {
    if (!this.state.isJumping) {
      this.state.isJumping = true;
      this.state.jumpVelocity = 6; // upward velocity m/s — lower = more realistic arc
    }
  }

  /** Apply a timed passive stamina regeneration buff (water station effect). */
  applyStaminaRegen(rate: number, duration: number): void {
    // Take the better of the current and incoming buff.
    if (rate > this.buffs.regenRate || this.buffs.regenTimer < 0.5) {
      this.buffs.regenRate = rate;
      this.buffs.regenTimer = duration;
    }
  }

  /** Race completion as a value in [0, 1]. */
  get progress(): number {
    return this.state.trackProgress;
  }

  /** True once the runner has reached the end of the track. */
  get finished(): boolean {
    return this.state.trackProgress >= 1;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Update stamina and the regen buff timer.
   * Returns the speed multiplier that stamina imposes this tick.
   */
  private _updateStamina(dt: number, s: RunnerState): { speedMult: number } {
    // Update regen buff timer.
    if (this.buffs.regenTimer > 0) {
      this.buffs.regenTimer = Math.max(0, this.buffs.regenTimer - dt);
      if (this.buffs.regenTimer === 0) {
        this.buffs.regenRate = 0;
      }
    }

    if (s.isBonking) {
      // Recover slowly while bonking.
      s.stamina = Math.min(1, s.stamina + BONK_STAMINA_REGEN * dt);
      s.staminaDrain = 0;
      // Exit bonk once recovered past half the warn threshold.
      if (s.stamina > STAMINA_WARN_THRESHOLD * 0.5) {
        s.isBonking = false;
      }
      return { speedMult: BONK_SPEED_MULT };
    }

    // Normal drain — exponential with speed.
    const speedExcess = Math.max(0, s.speed - RUNNER_BASE_SPEED);
    const drain = STAMINA_DRAIN_BASE + STAMINA_DRAIN_SPEED_COEFF * speedExcess * speedExcess;
    s.staminaDrain = drain;

    // Passive regen buff partially offsets drain.
    const netDrain = Math.max(0, drain - this.buffs.regenRate);
    s.stamina = Math.max(0, s.stamina - netDrain * dt);

    // Trigger bonk.
    if (s.stamina <= 0) {
      s.stamina = 0;
      s.isBonking = true;
      return { speedMult: BONK_SPEED_MULT };
    }

    // Progressive slowdown below warn threshold.
    if (s.stamina < STAMINA_WARN_THRESHOLD) {
      const warnRatio = s.stamina / STAMINA_WARN_THRESHOLD; // 0 → 1
      // At warnRatio 0 we'd bonk; scale between BONK_SPEED_MULT and 1.
      const speedMult =
        BONK_SPEED_MULT + (1 - BONK_SPEED_MULT) * warnRatio;
      return { speedMult };
    }

    return { speedMult: 1 };
  }

  /** Read from the spline and write worldPosition + heading into state. */
  private _syncWorldPosition(): void {
    const { position, heading } = this.trackPath.progressToWorld(
      this.state.trackProgress,
      this.state.lateralOffset,
    );
    position.y += this.state.jumpHeight;
    this.state.worldPosition.copy(position);
    this.state.heading = heading;
  }
}
