/**
 * AIRunnerController - Autonomous steering and pace management for AI runners.
 *
 * Each AI runner has a speed profile that determines how its target pace varies
 * across the race, combined with a difficulty multiplier that scales its base
 * top speed.
 *
 * Speed profiles:
 *   sprinter  — pushes hard at the start, fades in the second half
 *   endurance — conservative early, accelerates from 60% progress onward
 *   balanced  — consistent effort with small oscillations for realism
 *   steady    — near-perfect pace, never bonks, but never surges
 *
 * Lateral behaviour:
 *   AI runners steer with low-frequency sinusoidal drift plus a weak
 *   centre-return force so they naturally wander across the track without
 *   going off it.
 *
 * Randomness:
 *   All profiles add small pseudo-random perturbations seeded from the
 *   runner instance so different runners diverge even at the same difficulty.
 */

import type { RunnerPhysics } from './RunnerPhysics';
import {
  RUNNER_BASE_SPEED,
  RUNNER_MAX_SPEED,
  AI_STEER_NOISE,
  AI_CENTRE_PULL,
} from '../game/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SpeedProfile = 'sprinter' | 'endurance' | 'balanced' | 'steady';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Seconds between random pace decisions ("thinking" frequency). */
const PACE_DECISION_INTERVAL = 3.0;

/** Maximum stamina restore fraction the AI grants itself per second (cheats slightly). */
const AI_STAMINA_REGEN = 0.025;

/** How strongly the AI drifts laterally (multiplied by sin wave). */
const LATERAL_DRIFT_AMPLITUDE = 1.4; // metres

/** Frequency of the lateral drift sine wave (radians per second). */
const LATERAL_DRIFT_FREQ = 0.35;

// ---------------------------------------------------------------------------
// Class
// ---------------------------------------------------------------------------

export class AIRunnerController {
  private readonly runner: RunnerPhysics;
  private readonly profile: SpeedProfile;
  private readonly difficulty: number;

  /** Accumulated time for the pace decision timer. */
  private decisionTimer: number = 0;

  /** Current pace intention: fraction of max speed the AI is targeting (0–1). */
  private paceIntent: number = 0.85;

  /** Phase offset for the lateral drift sine wave (radians). Unique per instance. */
  private readonly lateralPhaseOffset: number;

  /** Accumulator for lateral drift time. */
  private lateralTime: number = 0;

  /** Unique random seed offset derived at construction time. */
  private readonly seed: number;

  constructor(
    runner: RunnerPhysics,
    speedProfile: SpeedProfile,
    difficulty: number,
  ) {
    this.runner = runner;
    this.profile = speedProfile;
    this.difficulty = Math.max(0.8, Math.min(1.2, difficulty));

    // Deterministic-ish unique offset so concurrent AI runners diverge.
    this.seed = Math.random();
    this.lateralPhaseOffset = this.seed * Math.PI * 2;
    this.paceIntent = this._initialPaceIntent();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Advance AI decision-making by one fixed timestep.
   *
   * @param dt              Fixed timestep in seconds.
   * @param raceProgress    Fraction of the race completed [0, 1] — by time or distance.
   * @param playerProgress  Player's current race progress [0, 1].
   */
  update(dt: number, raceProgress: number, playerProgress: number): void {
    // 1. Periodically reconsider pace.
    this.decisionTimer += dt;
    if (this.decisionTimer >= PACE_DECISION_INTERVAL) {
      this.decisionTimer -= PACE_DECISION_INTERVAL;
      this.paceIntent = this._computePaceIntent(raceProgress, playerProgress);
    }

    // 2. Apply AI stamina cheat — AIs never truly bonk (simplifies tuning).
    //    We give them a mild passive regen. Difficulty scales how much they rely on it.
    const regenRate = AI_STAMINA_REGEN * (2 - this.difficulty);
    this.runner.applyStaminaRegen(regenRate, PACE_DECISION_INTERVAL + dt);

    // 3. Compute lateral steer input.
    const steer = this._computeSteer(dt);

    // 4. Drive the physics update.
    //    Artificially cap the physics "base speed" via the boost multiplier so
    //    AIs move at difficulty-scaled speeds without rewriting RunnerPhysics.
    const targetMult = this.paceIntent * this.difficulty;
    this.runner.applySpeedBoost(
      targetMult * (RUNNER_MAX_SPEED / RUNNER_BASE_SPEED),
      PACE_DECISION_INTERVAL + dt,
    );

    this.runner.update(dt, steer);
  }

  // ---------------------------------------------------------------------------
  // Private: pace computation
  // ---------------------------------------------------------------------------

  private _initialPaceIntent(): number {
    switch (this.profile) {
      case 'sprinter':   return 0.92 + this.seed * 0.06;
      case 'endurance':  return 0.72 + this.seed * 0.06;
      case 'balanced':   return 0.82 + this.seed * 0.06;
      case 'steady':     return 0.78 + this.seed * 0.04;
    }
  }

  /**
   * Compute a new pace intent based on race position and runner profile.
   * Values are fractions of max-speed capacity (0–1).
   */
  private _computePaceIntent(
    raceProgress: number,
    playerProgress: number,
  ): number {
    const baseIntent = this._profilePace(raceProgress);

    // Small random noise so each AI feels slightly different.
    const noise = (this.seed * 2 - 1) * 0.06 * Math.sin(raceProgress * 7.3 + this.seed);

    // Competitive pressure: close to player → nudge up pace slightly.
    const gap = this.runner.progress - playerProgress;
    const competitiveBump = Math.abs(gap) < 0.05 ? 0.04 : 0;

    // If significantly behind player, AIs try a little harder (avoids boring runaway).
    const chaseBump = gap < -0.08 ? 0.06 * (1 - raceProgress) : 0;

    return Math.max(0.4, Math.min(1.0, baseIntent + noise + competitiveBump + chaseBump));
  }

  /** Profile-specific pace curve as a function of race progress [0, 1]. */
  private _profilePace(progress: number): number {
    switch (this.profile) {
      case 'sprinter': {
        // High early, fades linearly after 40%.
        if (progress < 0.40) return 0.95 - progress * 0.1;
        return 0.91 - (progress - 0.40) * 0.60;
      }
      case 'endurance': {
        // Negative split: slow start, strong finish from 60% onward.
        if (progress < 0.60) return 0.72 + progress * 0.10;
        return 0.78 + (progress - 0.60) * 0.55;
      }
      case 'balanced': {
        // Smooth bell — peaks in the middle, slight taper at the end.
        const peak = Math.sin(progress * Math.PI) * 0.12;
        return 0.82 + peak;
      }
      case 'steady': {
        // Nearly flat — slight natural fade at the very end.
        return 0.80 - progress * 0.05;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private: lateral steering
  // ---------------------------------------------------------------------------

  /**
   * Returns a steer value [-1, 1] for this tick.
   *
   * Combines:
   *   - Sinusoidal drift (wanders naturally across the track)
   *   - Centre-return pull (prevents drifting off-track)
   *   - Small random noise tick-by-tick
   */
  private _computeSteer(dt: number): number {
    this.lateralTime += dt;

    const drift =
      Math.sin(this.lateralTime * LATERAL_DRIFT_FREQ + this.lateralPhaseOffset) *
      LATERAL_DRIFT_AMPLITUDE;

    // Soft return to centre proportional to current offset.
    const centrePull =
      -this.runner.state.lateralOffset * AI_CENTRE_PULL;

    // Tick-level noise.
    const noise = (Math.random() * 2 - 1) * AI_STEER_NOISE;

    const raw = drift + centrePull + noise;

    // Clamp to steer range.
    return Math.max(-1, Math.min(1, raw));
  }
}
