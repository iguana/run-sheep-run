/**
 * TrackPath - Spline-based race route.
 *
 * Wraps a THREE.CatmullRomCurve3 and exposes distance-based queries so the
 * rest of the game never has to think in [0,1] parameter space directly.
 *
 * All public distance values are in metres. The curve is arc-length
 * re-parameterised on construction (via getLengths) so that uniform sampling
 * is available cheaply at runtime.
 *
 * Bank angle is estimated from the lateral curvature of the path so the
 * camera and character can tilt naturally through corners.
 */

import * as THREE from 'three';
import { TRACK_WIDTH_DEFAULT, TRACK_LATERAL_CLAMP } from '../game/constants';

/** How many arc-length divisions to pre-compute (higher = more accurate). */
const ARC_DIVISIONS = 1000;

/** Small epsilon used for tangent/normal finite-difference estimation (metres). */
const TANGENT_EPSILON = 0.05;

/** Maximum bank angle in radians for tight corners. */
const MAX_BANK_RADIANS = 0.35;

export class TrackPath {
  private readonly curve: THREE.CatmullRomCurve3;
  readonly totalLength: number;

  /**
   * @param controlPoints  World-space control points defining the race route.
   *                       A minimum of 2 points is required.
   */
  constructor(controlPoints: THREE.Vector3[]) {
    if (controlPoints.length < 2) {
      throw new Error('TrackPath requires at least 2 control points');
    }
    this.curve = new THREE.CatmullRomCurve3(
      controlPoints,
      false, // not closed — race has distinct start and finish
      'catmullrom',
      0.5,   // tension
    );
    // getLengths pre-computes a look-up table used by getPointAt/getTangentAt.
    this.curve.getLengths(ARC_DIVISIONS);
    this.totalLength = this.curve.getLength();
  }

  // ---------------------------------------------------------------------------
  // Core distance-based queries
  // ---------------------------------------------------------------------------

  /**
   * World position at `distance` metres along the track.
   * Clamps to [0, totalLength].
   */
  getPointAtDistance(distance: number): THREE.Vector3 {
    const t = this._distanceToT(distance);
    return this.curve.getPoint(t);
  }

  /**
   * Unit tangent (forward direction) at `distance` metres along the track.
   */
  getTangentAtDistance(distance: number): THREE.Vector3 {
    const t = this._distanceToT(distance);
    return this.curve.getTangent(t).normalize();
  }

  /**
   * Convert progress [0-1] and a lateral offset (metres, positive = right of
   * centre) to a world-space position, heading (yaw radians), and bank angle.
   *
   * The bank angle leans into corners: positive when turning right.
   */
  progressToWorld(
    progress: number,
    lateralOffset: number,
  ): { position: THREE.Vector3; heading: number; bankAngle: number } {
    const clampedProgress = Math.max(0, Math.min(1, progress));
    const distance = clampedProgress * this.totalLength;

    const centre = this.getPointAtDistance(distance);
    const tangent = this.getTangentAtDistance(distance);

    // Right vector = tangent × world-up, normalised.
    const right = new THREE.Vector3()
      .crossVectors(tangent, new THREE.Vector3(0, 1, 0))
      .normalize();

    const position = centre
      .clone()
      .addScaledVector(right, lateralOffset);

    // Three.js meshes face -Z by default; atan2(-tx, -tz) aligns the mesh's
    // forward (-Z) with the tangent direction.
    const heading = Math.atan2(-tangent.x, -tangent.z);
    const bankAngle = this._bankAngleAtDistance(distance, lateralOffset);

    return { position, heading, bankAngle };
  }

  /**
   * Terrain slope at `distance` metres (positive = uphill, negative = downhill).
   * Returns a value roughly in [-1, 1] derived from the vertical component of
   * the tangent.
   */
  getSlopeAtDistance(distance: number): number {
    const tangent = this.getTangentAtDistance(distance);
    // tangent.y is sin(pitch angle); clamp for sanity.
    return Math.max(-1, Math.min(1, tangent.y));
  }

  /**
   * Return `segments + 1` evenly spaced world positions for mesh generation.
   */
  getSampledPoints(segments: number): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      points.push(this.curve.getPoint(t));
    }
    return points;
  }

  /**
   * Track width at `distance` metres.
   *
   * The base implementation returns a constant default width. Override or
   * extend this method if individual races need variable-width tracks (e.g.
   * narrowing mountain passes, wide beach sections).
   */
  getWidthAtDistance(_distance: number): number {
    return TRACK_WIDTH_DEFAULT;
  }

  /**
   * Half-width including the edge buffer — lateral clamping limit.
   * Convenience accessor used by RunnerPhysics.
   */
  get lateralClamp(): number {
    return TRACK_LATERAL_CLAMP;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Convert a distance in metres to a normalised curve parameter t in [0, 1]. */
  private _distanceToT(distance: number): number {
    const clamped = Math.max(0, Math.min(this.totalLength, distance));
    return this.totalLength > 0 ? clamped / this.totalLength : 0;
  }

  /**
   * Estimate lateral curvature to derive a bank angle.
   * Uses finite differences on the tangent to approximate the change in
   * heading per metre, then maps to a clamped bank angle.
   */
  private _bankAngleAtDistance(distance: number, lateralOffset: number): number {
    const eps = TANGENT_EPSILON;
    const tA = this._distanceToT(Math.max(0, distance - eps));
    const tB = this._distanceToT(Math.min(this.totalLength, distance + eps));

    const headingA = (() => {
      const g = this.curve.getTangent(tA);
      return Math.atan2(g.x, g.z);
    })();
    const headingB = (() => {
      const g = this.curve.getTangent(tB);
      return Math.atan2(g.x, g.z);
    })();

    // Curvature = dHeading/ds (radians per metre)
    const curvature = (headingB - headingA) / (2 * eps);

    // Bank leans into the turn; offset contributes a small correction.
    const bank = -curvature * 4 - lateralOffset * 0.04;
    return Math.max(-MAX_BANK_RADIANS, Math.min(MAX_BANK_RADIANS, bank));
  }
}
