/**
 * GameLoop - Fixed-timestep loop with interpolation alpha.
 *
 * Uses the semi-fixed accumulator pattern (Hunt 2004 / Fix Your Timestep):
 *   - Physics / game logic runs in deterministic fixed steps (`fixedUpdate`).
 *   - Rendering receives an interpolation alpha in [0, 1] so it can smoothly
 *     blend between the previous and current physics state (`render`).
 *
 * The accumulator is capped to prevent the "spiral of death" where a slow
 * frame causes the next frame to simulate even longer, making things worse.
 * Cap = 5 fixed steps worth of time.
 */
export class GameLoop {
  private _running: boolean = false;
  private rafId: number = 0;
  private accumulator: number = 0;
  private lastTime: number = 0;
  private tick: number = 0;

  /** Duration of one fixed step in seconds, derived from tickRate. */
  private readonly fixedDt: number;
  /** Maximum simulated time per frame to prevent spiral-of-death. */
  private readonly maxAccumulator: number;

  constructor(
    private readonly fixedUpdate: (dt: number, tick: number) => void,
    private readonly render: (alpha: number) => void,
    /** Number of physics steps per second. */
    tickRate: number = 60,
  ) {
    this.fixedDt = 1 / tickRate;
    this.maxAccumulator = this.fixedDt * 5;
  }

  /** Read-back of the configured tick rate, derived from fixedDt. */
  get tickRate(): number {
    return 1 / this.fixedDt;
  }

  start(): void {
    if (this._running) return;
    this._running = true;
    this.lastTime = performance.now() * 0.001;
    this.accumulator = 0;
    this.tick = 0;
    this.rafId = requestAnimationFrame(this.loop);
  }

  stop(): void {
    if (!this._running) return;
    this._running = false;
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  get isRunning(): boolean {
    return this._running;
  }

  /**
   * The main rAF callback. Arrow function so `this` is always the instance
   * regardless of how the browser invokes it.
   */
  private readonly loop = (nowMs: number): void => {
    if (!this._running) return;

    const nowSec = nowMs * 0.001;
    let frameTime = nowSec - this.lastTime;
    this.lastTime = nowSec;

    // Clamp to avoid spiral-of-death on very slow frames (e.g. tab hidden).
    if (frameTime > this.maxAccumulator) frameTime = this.maxAccumulator;

    this.accumulator += frameTime;

    while (this.accumulator >= this.fixedDt) {
      this.fixedUpdate(this.fixedDt, this.tick++);
      this.accumulator -= this.fixedDt;
    }

    // alpha tells the renderer how far between the last two physics states we are.
    const alpha = this.accumulator / this.fixedDt;
    this.render(alpha);

    this.rafId = requestAnimationFrame(this.loop);
  };
}
