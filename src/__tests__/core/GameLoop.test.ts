import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameLoop } from '@/game/GameLoop';

// ---------------------------------------------------------------------------
// rAF / cancelAnimationFrame stubs
// ---------------------------------------------------------------------------

type RafCallback = (nowMs: number) => void;

let rafCallbacks: Map<number, RafCallback>;
let rafIdCounter: number;

function setupRafMocks(): void {
  rafCallbacks = new Map();
  rafIdCounter = 0;

  vi.stubGlobal('requestAnimationFrame', (cb: RafCallback): number => {
    const id = ++rafIdCounter;
    rafCallbacks.set(id, cb);
    return id;
  });

  vi.stubGlobal('cancelAnimationFrame', (id: number): void => {
    rafCallbacks.delete(id);
  });

  // performance.now in test environment
  vi.stubGlobal('performance', {
    now: vi.fn().mockReturnValue(0),
  });
}

/**
 * Flush exactly one pending rAF frame at the given simulated time.
 * Returns how many frames were flushed.
 */
function flushRaf(nowMs: number): number {
  const snapshot = [...rafCallbacks.entries()];
  rafCallbacks.clear();
  for (const [, cb] of snapshot) {
    cb(nowMs);
  }
  return snapshot.length;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GameLoop', () => {
  beforeEach(() => {
    setupRafMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('starts and stops', () => {
    it('isRunning is false before start()', () => {
      const loop = new GameLoop(vi.fn(), vi.fn(), 60);
      expect(loop.isRunning).toBe(false);
    });

    it('isRunning is true after start()', () => {
      const loop = new GameLoop(vi.fn(), vi.fn(), 60);
      loop.start();
      expect(loop.isRunning).toBe(true);
      loop.stop();
    });

    it('isRunning is false after stop()', () => {
      const loop = new GameLoop(vi.fn(), vi.fn(), 60);
      loop.start();
      loop.stop();
      expect(loop.isRunning).toBe(false);
    });

    it('start() is idempotent — calling it twice does not double-register rAF', () => {
      const loop = new GameLoop(vi.fn(), vi.fn(), 60);
      loop.start();
      loop.start(); // second call should be ignored
      // Only one rAF callback should be pending
      expect(rafCallbacks.size).toBe(1);
      loop.stop();
    });

    it('stop() is idempotent — calling it when already stopped does not throw', () => {
      const loop = new GameLoop(vi.fn(), vi.fn(), 60);
      expect(() => loop.stop()).not.toThrow();
    });

    it('cancels the pending rAF on stop()', () => {
      const loop = new GameLoop(vi.fn(), vi.fn(), 60);
      loop.start();
      expect(rafCallbacks.size).toBe(1);
      loop.stop();
      expect(rafCallbacks.size).toBe(0);
    });
  });

  describe('tickRate getter', () => {
    it('returns the configured tick rate', () => {
      const loop = new GameLoop(vi.fn(), vi.fn(), 60);
      expect(loop.tickRate).toBeCloseTo(60);
    });

    it('supports arbitrary tick rates', () => {
      const loop = new GameLoop(vi.fn(), vi.fn(), 30);
      expect(loop.tickRate).toBeCloseTo(30);
    });
  });

  describe('calls fixedUpdate at correct rate', () => {
    it('does not call fixedUpdate for a frame with no elapsed time', () => {
      const fixedUpdate = vi.fn();
      const render = vi.fn();
      const loop = new GameLoop(fixedUpdate, render, 60);

      // performance.now returns 0 at start
      loop.start();
      // Flush with nowMs = 0 — same time as lastTime, so dt = 0, accumulator stays 0
      flushRaf(0);

      expect(fixedUpdate).not.toHaveBeenCalled();
      loop.stop();
    });

    it('calls fixedUpdate once for exactly one tick worth of elapsed time', () => {
      const fixedUpdate = vi.fn();
      const render = vi.fn();
      const tickRate = 60;
      const loop = new GameLoop(fixedUpdate, render, tickRate);

      // performance.now returns 0 at start (lastTime = 0)
      loop.start();

      // Advance by exactly 1/60 s = ~16.67 ms
      const oneTickMs = (1 / tickRate) * 1000;
      flushRaf(oneTickMs);

      expect(fixedUpdate).toHaveBeenCalledOnce();
      expect(fixedUpdate).toHaveBeenCalledWith(1 / tickRate, 0);

      loop.stop();
    });

    it('calls fixedUpdate N times for N ticks worth of elapsed time', () => {
      const fixedUpdate = vi.fn();
      const render = vi.fn();
      const tickRate = 60;
      const loop = new GameLoop(fixedUpdate, render, tickRate);

      loop.start();
      const threeTicksMs = (3 / tickRate) * 1000;
      flushRaf(threeTicksMs);

      expect(fixedUpdate).toHaveBeenCalledTimes(3);
      loop.stop();
    });

    it('clamps elapsed time to prevent spiral-of-death (cap = 5 fixed steps)', () => {
      const fixedUpdate = vi.fn();
      const render = vi.fn();
      const tickRate = 60;
      const loop = new GameLoop(fixedUpdate, render, tickRate);

      loop.start();
      // Simulate a massive 10-second freeze
      flushRaf(10_000);

      // Should be capped to 5 * (1/60) seconds of simulation
      expect(fixedUpdate).toHaveBeenCalledTimes(5);
      loop.stop();
    });

    it('passes ascending tick numbers to fixedUpdate', () => {
      const ticks: number[] = [];
      const tickRate = 60;
      const loop = new GameLoop(
        (_dt, tick) => { ticks.push(tick); },
        vi.fn(),
        tickRate,
      );

      loop.start();
      const threeTicksMs = (3 / tickRate) * 1000;
      flushRaf(threeTicksMs);

      expect(ticks).toEqual([0, 1, 2]);
      loop.stop();
    });
  });

  describe('uses requestAnimationFrame', () => {
    it('registers a rAF callback on start()', () => {
      const loop = new GameLoop(vi.fn(), vi.fn(), 60);
      loop.start();
      expect(rafCallbacks.size).toBe(1);
      loop.stop();
    });

    it('re-registers rAF after each frame so the loop continues', () => {
      const render = vi.fn();
      const tickRate = 60;
      const loop = new GameLoop(vi.fn(), render, tickRate);

      loop.start();
      flushRaf((1 / tickRate) * 1000);  // frame 1

      // After frame 1, the loop must have re-registered for frame 2
      expect(rafCallbacks.size).toBe(1);
      flushRaf((2 / tickRate) * 1000);  // frame 2
      expect(render).toHaveBeenCalledTimes(2);

      loop.stop();
    });

    it('calls render with an alpha between 0 and 1', () => {
      const alphas: number[] = [];
      const tickRate = 60;
      const loop = new GameLoop(
        vi.fn(),
        (alpha) => { alphas.push(alpha); },
        tickRate,
      );

      loop.start();
      // Advance by half a tick — alpha should be ~0.5
      flushRaf((0.5 / tickRate) * 1000);

      expect(alphas.length).toBe(1);
      expect(alphas[0]).toBeGreaterThanOrEqual(0);
      expect(alphas[0]).toBeLessThanOrEqual(1);
      loop.stop();
    });

    it('stops issuing rAF callbacks after stop()', () => {
      const render = vi.fn();
      const tickRate = 60;
      const loop = new GameLoop(vi.fn(), render, tickRate);

      loop.start();
      flushRaf((1 / tickRate) * 1000);
      loop.stop();

      // Any queued rAF should have been cancelled; flushing it should do nothing
      flushRaf((2 / tickRate) * 1000);

      expect(render).toHaveBeenCalledOnce(); // only frame 1
    });
  });
});
