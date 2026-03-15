/**
 * TouchInputManager - Touch and mouse steering input.
 *
 * Maps horizontal pointer displacement from the touch/click start point to a
 * steer value in [-1, 1].  A dead zone near centre suppresses micro-jitter.
 * Exponential smoothing (low-pass filter) on the output prevents jarring
 * frame-to-frame jumps.
 *
 * All event listeners are registered as `passive: true` so the browser never
 * blocks scrolling on the main thread waiting for preventDefault.
 *
 * Call `dispose()` when the element is unmounted to avoid listener leaks.
 */

/** Displacement in pixels that maps to full steer saturation (±1). */
const STEER_RANGE_PX = 120;

/** Displacement within this many pixels from centre reads as zero steer. */
const DEAD_ZONE_PX = 8;

/**
 * Exponential smoothing factor in [0, 1].
 * Higher = more responsive, lower = smoother.
 * At 60 fps, 0.2 gives ~100 ms rise time.
 */
const SMOOTH_FACTOR = 0.2;

export class TouchInputManager {
  private steerValue: number = 0;
  private rawSteer: number = 0;
  private touchActive: boolean = false;
  private touchStartX: number = 0;
  private screenWidth: number;

  // Keep bound references so removeEventListener can match them exactly.
  private readonly onTouchStart: (e: TouchEvent) => void;
  private readonly onTouchMove: (e: TouchEvent) => void;
  private readonly onTouchEnd: () => void;
  private readonly onMouseDown: (e: MouseEvent) => void;
  private readonly onMouseMove: (e: MouseEvent) => void;
  private readonly onMouseUp: () => void;

  constructor(private readonly element: HTMLElement) {
    this.screenWidth = element.clientWidth || window.innerWidth;

    this.onTouchStart = this.handleTouchStart.bind(this);
    this.onTouchMove  = this.handleTouchMove.bind(this);
    this.onTouchEnd   = this.handleTouchEnd.bind(this);
    this.onMouseDown  = this.handleMouseDown.bind(this);
    this.onMouseMove  = this.handleMouseMove.bind(this);
    this.onMouseUp    = this.handleMouseUp.bind(this);

    const opts: AddEventListenerOptions = { passive: true };

    element.addEventListener('touchstart',  this.onTouchStart, opts);
    element.addEventListener('touchmove',   this.onTouchMove,  opts);
    element.addEventListener('touchend',    this.onTouchEnd,   opts);
    element.addEventListener('touchcancel', this.onTouchEnd,   opts);

    // Mouse events for desktop testing; mouseup/mousemove go on window so
    // dragging outside the element doesn't get stuck.
    element.addEventListener('mousedown', this.onMouseDown, opts);
    window.addEventListener('mousemove',  this.onMouseMove,  opts);
    window.addEventListener('mouseup',    this.onMouseUp,    opts);
  }

  // -------------------------------------------------------------------------
  // Touch handlers
  // -------------------------------------------------------------------------

  private handleTouchStart(e: TouchEvent): void {
    const touch = e.changedTouches[0];
    if (touch === undefined) return;
    this.touchStartX = touch.clientX;
    this.touchActive = true;
    this.screenWidth = this.element.clientWidth || window.innerWidth;
  }

  private handleTouchMove(e: TouchEvent): void {
    if (!this.touchActive) return;
    const touch = e.changedTouches[0];
    if (touch === undefined) return;
    this.rawSteer = this.computeSteer(touch.clientX - this.touchStartX);
  }

  private handleTouchEnd(): void {
    this.touchActive = false;
    this.rawSteer = 0;
  }

  // -------------------------------------------------------------------------
  // Mouse handlers (desktop fallback)
  // -------------------------------------------------------------------------

  private handleMouseDown(e: MouseEvent): void {
    this.touchStartX = e.clientX;
    this.touchActive = true;
    this.screenWidth = this.element.clientWidth || window.innerWidth;
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.touchActive) return;
    this.rawSteer = this.computeSteer(e.clientX - this.touchStartX);
  }

  private handleMouseUp(): void {
    this.touchActive = false;
    this.rawSteer = 0;
  }

  // -------------------------------------------------------------------------
  // Steer computation
  // -------------------------------------------------------------------------

  /**
   * Convert raw pixel delta to a normalised steer value.
   * Applies dead zone then maps to [-1, 1] with clamping.
   */
  private computeSteer(deltaPx: number): number {
    void this.screenWidth; // reserved for future screen-relative scaling

    const absDelta = Math.abs(deltaPx);
    if (absDelta < DEAD_ZONE_PX) return 0;

    // Shrink the range by the dead zone so the response starts exactly at 0
    // once the dead zone threshold is crossed.
    const sign = deltaPx > 0 ? 1 : -1;
    const adjusted = (absDelta - DEAD_ZONE_PX) / (STEER_RANGE_PX - DEAD_ZONE_PX);
    return sign * Math.min(adjusted, 1);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Returns the current steering value in [-1, 1], exponentially smoothed.
   * Intended to be called once per render frame; smoothing is applied here
   * so that the internal raw state accumulates at whatever rate events fire.
   */
  getSteer(): number {
    this.steerValue += (this.rawSteer - this.steerValue) * SMOOTH_FACTOR;
    // Snap to zero when very close to avoid permanent low-level drift.
    if (Math.abs(this.steerValue) < 0.005) this.steerValue = 0;
    return this.steerValue;
  }

  /** Returns true while a touch/mouse button is actively held down. */
  isTouching(): boolean {
    return this.touchActive;
  }

  /** Remove all event listeners. Call when the element is removed from the DOM. */
  dispose(): void {
    const opts: EventListenerOptions = { capture: false };

    this.element.removeEventListener('touchstart',  this.onTouchStart, opts);
    this.element.removeEventListener('touchmove',   this.onTouchMove,  opts);
    this.element.removeEventListener('touchend',    this.onTouchEnd,   opts);
    this.element.removeEventListener('touchcancel', this.onTouchEnd,   opts);
    this.element.removeEventListener('mousedown',   this.onMouseDown,  opts);
    window.removeEventListener('mousemove', this.onMouseMove, opts);
    window.removeEventListener('mouseup',   this.onMouseUp,   opts);
  }
}
