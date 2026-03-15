import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObjectPool } from '@/core/ObjectPool';

interface PoolItem {
  id: number;
  active: boolean;
}

describe('ObjectPool', () => {
  let factoryCallCount: number;
  let resetCallCount: number;
  let factory: () => PoolItem;
  let reset: (obj: PoolItem) => void;
  let pool: ObjectPool<PoolItem>;

  beforeEach(() => {
    factoryCallCount = 0;
    resetCallCount = 0;
    factory = vi.fn(() => ({ id: ++factoryCallCount, active: false }));
    reset = vi.fn((obj: PoolItem) => {
      resetCallCount++;
      obj.active = false;
    });
    pool = new ObjectPool(factory, reset, 0);
  });

  describe('acquire returns objects', () => {
    it('returns a new object when the pool is empty', () => {
      const obj = pool.acquire();
      expect(obj).toBeDefined();
      expect(typeof obj.id).toBe('number');
    });

    it('calls the factory when the free list is empty', () => {
      pool.acquire();
      expect(factory).toHaveBeenCalledOnce();
    });

    it('acquires multiple distinct objects', () => {
      const a = pool.acquire();
      const b = pool.acquire();
      expect(a).not.toBe(b);
    });
  });

  describe('release returns to pool', () => {
    it('calls the reset function on release', () => {
      const obj = pool.acquire();
      pool.release(obj);
      expect(reset).toHaveBeenCalledWith(obj);
    });

    it('grows the free list after release', () => {
      const obj = pool.acquire();
      expect(pool.poolSize).toBe(0);
      pool.release(obj);
      expect(pool.poolSize).toBe(1);
    });
  });

  describe('reuses released objects', () => {
    it('returns the same object instance on the next acquire after release', () => {
      const first = pool.acquire();
      pool.release(first);
      const second = pool.acquire();
      expect(second).toBe(first);
    });

    it('does not call the factory again when the free list is non-empty', () => {
      const obj = pool.acquire();
      pool.release(obj);
      pool.acquire(); // should reuse, not create
      expect(factory).toHaveBeenCalledOnce(); // only the initial acquire
    });
  });

  describe('factory creates new when pool empty', () => {
    it('calls factory each time the free list is empty', () => {
      pool.acquire();
      pool.acquire();
      pool.acquire();
      expect(factory).toHaveBeenCalledTimes(3);
    });

    it('calls factory once more when only one object is available and two are needed', () => {
      const a = pool.acquire(); // factory call 1
      pool.release(a);          // back to free list
      pool.acquire();            // reuses a — no new factory call
      pool.acquire();            // free list empty — factory call 2
      expect(factory).toHaveBeenCalledTimes(2);
    });
  });

  describe('reset is called on release', () => {
    it('invokes reset with the released object', () => {
      const obj = pool.acquire();
      obj.active = true;
      pool.release(obj);
      expect(reset).toHaveBeenCalledWith(obj);
      expect(obj.active).toBe(false); // reset zeroed it
    });

    it('does not call reset on acquire', () => {
      pool.acquire();
      expect(reset).not.toHaveBeenCalled();
    });

    it('calls reset each time an object is released, even if released multiple times', () => {
      const obj = pool.acquire();
      pool.release(obj);
      const same = pool.acquire();
      pool.release(same);
      expect(reset).toHaveBeenCalledTimes(2);
    });
  });

  describe('activeCount and poolSize accuracy', () => {
    it('starts with activeCount 0 and poolSize 0 (no initialSize)', () => {
      expect(pool.activeCount).toBe(0);
      expect(pool.poolSize).toBe(0);
    });

    it('activeCount increments on acquire', () => {
      pool.acquire();
      expect(pool.activeCount).toBe(1);
      pool.acquire();
      expect(pool.activeCount).toBe(2);
    });

    it('activeCount decrements on release', () => {
      const a = pool.acquire();
      const b = pool.acquire();
      pool.release(a);
      expect(pool.activeCount).toBe(1);
      pool.release(b);
      expect(pool.activeCount).toBe(0);
    });

    it('poolSize grows on release and shrinks on acquire', () => {
      const obj = pool.acquire();
      pool.release(obj);
      expect(pool.poolSize).toBe(1);
      pool.acquire();
      expect(pool.poolSize).toBe(0);
    });

    it('activeCount + poolSize equals total objects ever created', () => {
      const a = pool.acquire();
      const b = pool.acquire();
      pool.release(a);
      // total created = 2; active = 1, free = 1
      expect(pool.activeCount + pool.poolSize).toBe(2);
      pool.release(b);
      expect(pool.activeCount + pool.poolSize).toBe(2);
    });

    it('initialSize pre-populates the free list', () => {
      const preloaded = new ObjectPool(factory, reset, 5);
      expect(preloaded.poolSize).toBe(5);
      expect(preloaded.activeCount).toBe(0);
      expect(factory).toHaveBeenCalledTimes(5);
    });

    it('clear resets both counters to zero', () => {
      pool.acquire();
      pool.acquire();
      const third = pool.acquire();
      pool.release(third);
      pool.clear();
      expect(pool.activeCount).toBe(0);
      expect(pool.poolSize).toBe(0);
    });
  });
});
