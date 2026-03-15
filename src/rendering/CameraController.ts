/**
 * CameraController.ts - Smooth chase camera with cinematic extras.
 *
 * Architecture
 * ============
 * The camera is governed by a desired position/look-at pair that is blended
 * toward with exponential-decay lerp each frame.  This keeps the camera silky
 * on variable frame-rates while still tracking the runner tightly.
 *
 * Features
 * --------
 *  - Chase offset behind and above the target.
 *  - Speed-dependent FOV widening.
 *  - Camera banking on turns (Z-axis roll into curves).
 *  - Additive camera shake via a decaying oscillator (one shake at a time;
 *    new shakes override old ones which is fine for our use-cases).
 *  - Dramatic modes for race start and finish cinematics.
 *
 * Coordinate convention: +X right, +Y up, +Z toward camera (Three.js default).
 */

import * as THREE from 'three';
import { CAMERA, RENDER } from '../game/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DramaticMode = 'start' | 'finish' | 'none';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Exponential-decay lerp factor for a given half-life and dt.
 * Result is equivalent to `lerp(a, b, 1 - Math.exp(-k * dt))`.
 * We compute the factor once and let callers inline the lerp.
 */
function lerpFactor(k: number, dt: number): number {
  return 1 - Math.exp(-k * dt);
}

// ---------------------------------------------------------------------------
// CameraController
// ---------------------------------------------------------------------------

export class CameraController {
  private readonly camera: THREE.PerspectiveCamera;

  // Current world-space position and look-at target (smoothed).
  private readonly currentPos: THREE.Vector3 = new THREE.Vector3();
  private readonly currentLookAt: THREE.Vector3 = new THREE.Vector3();

  // Desired position computed each update.
  private readonly desiredPos: THREE.Vector3 = new THREE.Vector3();
  private readonly desiredLookAt: THREE.Vector3 = new THREE.Vector3();

  // Camera banking (Z rotation, radians).
  private currentBank: number = 0;
  private desiredBank: number = 0;

  // FOV (degrees).
  private currentFov: number;

  // Shake state.
  private shakeIntensity: number = 0;
  private shakeDuration: number = 0;
  private shakeTime: number = 0;
  private readonly shakeOffset: THREE.Vector3 = new THREE.Vector3();

  // Dramatic mode.
  private dramaticMode: DramaticMode = 'none';

  // Scratch vectors to avoid allocations in hot path.
  private readonly _euler = new THREE.Euler();
  private readonly _quat = new THREE.Quaternion();

  // Track previous heading for banking computation.
  private prevHeading: number = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.currentFov = camera.fov;

    // Seed current pos/lookat so first-frame lerp doesn't jump.
    this.currentPos.copy(camera.position);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Update the camera to follow `targetPosition`.
   *
   * @param targetPosition  World position of the runner.
   * @param targetHeading   Runner's yaw in radians (0 = +Z, increases clockwise).
   * @param speed           Runner's current speed in m/s.
   * @param dt              Frame delta time in seconds.
   */
  update(
    targetPosition: THREE.Vector3,
    targetHeading: number,
    speed: number,
    dt: number,
  ): void {
    // -- Choose offset config based on dramatic mode --------------------
    const backDist = this.dramaticMode === 'start'
      ? CAMERA.DRAMATIC_START_BACK
      : this.dramaticMode === 'finish'
        ? CAMERA.DRAMATIC_FINISH_BACK
        : CAMERA.OFFSET_BACK;

    const upDist = this.dramaticMode === 'start'
      ? CAMERA.DRAMATIC_START_UP
      : this.dramaticMode === 'finish'
        ? CAMERA.DRAMATIC_FINISH_UP
        : CAMERA.OFFSET_UP;

    // -- Compute desired camera position ---------------------------------
    // Offset is in the runner's local frame, then rotated to world.
    const sinH = Math.sin(targetHeading);
    const cosH = Math.cos(targetHeading);

    // Desired position: behind (−Z in local) and above.
    this.desiredPos.set(
      targetPosition.x + sinH * backDist,
      targetPosition.y + upDist,
      targetPosition.z + cosH * backDist,
    );

    // Desired look-at: slightly ahead of the runner (not at their feet).
    this.desiredLookAt.set(
      targetPosition.x - sinH * 2,
      targetPosition.y + 1.0,
      targetPosition.z - cosH * 2,
    );

    // -- Smooth to desired ---------------------------------------------------
    const posF = lerpFactor(CAMERA.POSITION_LERP, dt);
    const latF = lerpFactor(CAMERA.LOOKAT_LERP, dt);

    this.currentPos.lerp(this.desiredPos, posF);
    this.currentLookAt.lerp(this.desiredLookAt, latF);

    // -- Apply shake ---------------------------------------------------------
    this._computeShake(dt);

    this.camera.position.copy(this.currentPos).add(this.shakeOffset);
    this.camera.lookAt(
      this.currentLookAt.x + this.shakeOffset.x * 0.3,
      this.currentLookAt.y + this.shakeOffset.y * 0.3,
      this.currentLookAt.z + this.shakeOffset.z * 0.3,
    );

    // -- Camera banking on turns -------------------------------------------
    const headingDelta = _angleDiff(targetHeading, this.prevHeading);
    const turnRate = dt > 0 ? headingDelta / dt : 0;
    this.prevHeading = targetHeading;

    this.desiredBank = -turnRate * CAMERA.BANK_FACTOR * (Math.PI / 180);
    this.desiredBank = Math.max(-0.25, Math.min(0.25, this.desiredBank));
    this.currentBank += (this.desiredBank - this.currentBank) * lerpFactor(6, dt);

    // Apply bank via quaternion multiplication on top of lookAt orientation.
    this._euler.set(0, 0, this.currentBank);
    this._quat.setFromEuler(this._euler);
    this.camera.quaternion.multiply(this._quat);

    // -- FOV -----------------------------------------------------------------
    const speedNorm = Math.min(speed / RENDER.FOV_MAX_SPEED, 1);
    const targetFov =
      RENDER.FOV_BASE + (RENDER.FOV_MAX - RENDER.FOV_BASE) * speedNorm * speedNorm;

    this.currentFov += (targetFov - this.currentFov) * lerpFactor(CAMERA.FOV_LERP, dt);
    this.camera.fov = this.currentFov;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Trigger a camera shake.
   * @param intensity  Peak displacement in world units (e.g. 0.3 for a bump).
   * @param duration   How long the shake lasts in seconds.
   */
  shake(intensity: number, duration: number): void {
    this.shakeIntensity = intensity;
    this.shakeDuration = duration;
    this.shakeTime = 0;
  }

  /**
   * Switch between cinematic modes.
   * 'start' — pulled back for a wide field-of-view reveal.
   * 'finish' — low-angle hero shot.
   * 'none'  — normal chase.
   */
  setDramaticMode(mode: DramaticMode): void {
    this.dramaticMode = mode;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _computeShake(dt: number): void {
    if (this.shakeTime >= this.shakeDuration) {
      this.shakeOffset.set(0, 0, 0);
      return;
    }

    this.shakeTime += dt;
    const t = this.shakeTime / this.shakeDuration;
    const decay = 1 - t;            // linear fade-out
    const freq = 28;                // oscillation frequency
    const amp = this.shakeIntensity * decay;

    this.shakeOffset.set(
      Math.sin(this.shakeTime * freq * 1.3) * amp,
      Math.sin(this.shakeTime * freq) * amp,
      Math.sin(this.shakeTime * freq * 0.7) * amp * 0.5,
    );
  }
}

// ---------------------------------------------------------------------------
// Module-level util (no allocation)
// ---------------------------------------------------------------------------

/** Shortest signed angle difference from `prev` to `curr` in radians. */
function _angleDiff(curr: number, prev: number): number {
  let d = curr - prev;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
