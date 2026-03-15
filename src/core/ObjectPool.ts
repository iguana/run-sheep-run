/**
 * ObjectPool<T> - Generic, allocation-minimising object pool.
 *
 * Objects are created eagerly up to `initialSize`, then lazily on demand.
 * `acquire` pops from the free list (O(1)); `release` pushes back (O(1)).
 *
 * The caller-supplied `reset` function is invoked inside `release` so objects
 * are always clean before re-use and the pool itself never inspects internals.
 */
export class ObjectPool<T> {
  private readonly free: T[] = [];
  private _activeCount: number = 0;

  constructor(
    private readonly factory: () => T,
    private readonly reset: (obj: T) => void,
    initialSize: number = 0,
  ) {
    for (let i = 0; i < initialSize; i++) {
      this.free.push(this.factory());
    }
  }

  /**
   * Obtain an object from the pool, creating one if the free list is empty.
   * The caller is responsible for calling `release` when done.
   */
  acquire(): T {
    const obj = this.free.length > 0 ? (this.free.pop() as T) : this.factory();
    this._activeCount++;
    return obj;
  }

  /**
   * Return an object to the pool.
   * The `reset` callback is called before the object is re-queued.
   * Releasing an object that was not acquired from this pool is undefined
   * behaviour — no bookkeeping is done to detect it.
   */
  release(obj: T): void {
    if (this._activeCount > 0) this._activeCount--;
    this.reset(obj);
    this.free.push(obj);
  }

  /** Number of objects currently checked out via `acquire`. */
  get activeCount(): number {
    return this._activeCount;
  }

  /** Number of objects sitting idle in the free list. */
  get poolSize(): number {
    return this.free.length;
  }

  /**
   * Discard all pooled objects and reset counters.
   * Any objects currently acquired become orphaned — callers should release
   * them before calling `clear` or stop using them afterwards.
   */
  clear(): void {
    this.free.length = 0;
    this._activeCount = 0;
  }
}
