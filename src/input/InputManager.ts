/**
 * InputManager - Unified input facade combining touch/mouse and keyboard.
 *
 * Priority:
 *   1. Keyboard steering (arrow keys / A D) - digital, so saturates to ±1.
 *   2. Touch/mouse steering from TouchInputManager (analogue, smoothed).
 * If keyboard steering is non-zero it overrides touch entirely so the two
 * never fight each other.
 *
 * Escape toggles the `paused` state; the game loop queries `isPaused()` each
 * frame and halts physics updates when true.
 */

import { TouchInputManager } from './TouchInputManager';

/** Keyboard steer step applied per getSteer() call when a key is held. */
const KEY_STEER_FULL = 1;

/** How quickly keyboard steer returns to zero when no key pressed (per call). */
const KEY_STEER_RELEASE_RATE = 0.15;

/** Keyboard key codes we care about. */
const KEY_LEFT  = ['ArrowLeft',  'a', 'A'] as const;
const KEY_RIGHT = ['ArrowRight', 'd', 'D'] as const;
const KEY_PAUSE = ['Escape'] as const;
const KEY_JUMP  = [' ', 'ArrowUp', 'w', 'W'] as const;

export class InputManager {
  private readonly touch: TouchInputManager;

  private readonly keysDown: Set<string> = new Set();
  private keySteer: number = 0;
  private _paused: boolean = false;
  private _jumpPressed: boolean = false;
  private _jumpConsumed: boolean = false;

  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly onKeyUp: (e: KeyboardEvent) => void;
  constructor(element: HTMLElement) {
    this.touch = new TouchInputManager(element);

    this.onKeyDown = this.handleKeyDown.bind(this);
    this.onKeyUp   = this.handleKeyUp.bind(this);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup',   this.onKeyUp);
    // Double-tap to jump on mobile
    let lastTapTime = 0;
    element.addEventListener('touchend', () => {
      const now = performance.now();
      if (now - lastTapTime < 300) {
        this._jumpPressed = true;
        this._jumpConsumed = false;
      }
      lastTapTime = now;
    }, { passive: true });
  }

  // -------------------------------------------------------------------------
  // Keyboard handlers
  // -------------------------------------------------------------------------

  private handleKeyDown(e: KeyboardEvent): void {
    this.keysDown.add(e.key);

    if ((KEY_PAUSE as readonly string[]).includes(e.key)) {
      this._paused = !this._paused;
    }
    if ((KEY_JUMP as readonly string[]).includes(e.key)) {
      if (!this._jumpConsumed) {
        this._jumpPressed = true;
        this._jumpConsumed = false;
      }
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.keysDown.delete(e.key);
    // Reset jump consumed flag so the next keydown for the same key is accepted.
    if ((KEY_JUMP as readonly string[]).includes(e.key)) {
      this._jumpConsumed = false;
    }
  }

  // -------------------------------------------------------------------------
  // Steer resolution
  // -------------------------------------------------------------------------

  /**
   * Resolve instantaneous keyboard steer direction from held keys.
   * Returns -1 (left), 0 (neutral), or +1 (right).
   */
  private resolveKeyDirection(): -1 | 0 | 1 {
    const left  = (KEY_LEFT  as readonly string[]).some(k => this.keysDown.has(k));
    const right = (KEY_RIGHT as readonly string[]).some(k => this.keysDown.has(k));
    if (left && !right) return -1;
    if (right && !left) return  1;
    return 0;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Returns the combined steer value in [-1, 1].
   *
   * Keyboard: digital snap toward ±KEY_STEER_FULL when a direction key is
   * held; decays toward 0 at KEY_STEER_RELEASE_RATE when released.
   * Touch/mouse: used only when no keyboard direction is active.
   *
   * Call once per frame (e.g. inside fixedUpdate or render).
   */
  getSteer(): number {
    const dir = this.resolveKeyDirection();

    if (dir !== 0) {
      // Drive toward full saturation in the pressed direction.
      this.keySteer += (dir * KEY_STEER_FULL - this.keySteer) * 0.3;
      return Math.max(-1, Math.min(1, this.keySteer));
    }

    // No key held — decay keyboard steer back toward zero.
    if (this.keySteer !== 0) {
      this.keySteer *= 1 - KEY_STEER_RELEASE_RATE;
      if (Math.abs(this.keySteer) < 0.01) this.keySteer = 0;
      // While keyboard steer is still coasting, keep using it so there is no
      // discontinuity when the player lifts a key.
      if (this.keySteer !== 0) {
        return Math.max(-1, Math.min(1, this.keySteer));
      }
    }

    // Fall through to touch/mouse.
    return this.touch.getSteer();
  }

  /**
   * Returns true if the game is currently paused.
   * Toggled by pressing Escape.
   */
  isPaused(): boolean {
    return this._paused;
  }

  /**
   * Returns true once per jump press (space, tap, click).
   * Consumed after reading — subsequent calls return false until next press.
   */
  consumeJump(): boolean {
    if (this._jumpPressed && !this._jumpConsumed) {
      this._jumpConsumed = true;
      this._jumpPressed = false;
      return true;
    }
    return false;
  }

  setPaused(value: boolean): void {
    this._paused = value;
  }

  /**
   * Returns true while a touch/mouse button is actively held.
   * Delegates to the underlying TouchInputManager.
   */
  isTouching(): boolean {
    return this.touch.isTouching();
  }

  /** Remove all event listeners and dispose the underlying touch manager. */
  dispose(): void {
    this.touch.dispose();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup',   this.onKeyUp);
    this.keysDown.clear();
  }
}

// Re-export for convenience so consumers can import everything from one place.
export type { TouchInputManager };
