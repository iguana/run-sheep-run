/**
 * EventBus - Typed pub/sub event system.
 *
 * Callbacks are keyed by event name. Each call to `on` returns a dedicated
 * unsubscribe function so callers never need to hold a reference to the
 * original callback just to remove it.
 *
 * Type parameter T on `on`/`off`/`emit` lets call-sites annotate the payload
 * without casting; the bus itself stores callbacks as EventCallback<unknown>
 * and casts once on dispatch, which is the minimal safe cast needed.
 */

type EventCallback<T = unknown> = (data: T) => void;

export class EventBus {
  private readonly listeners: Map<string, Set<EventCallback<unknown>>> =
    new Map();

  /**
   * Subscribe to an event.
   * @returns An unsubscribe function — call it to remove this subscription.
   */
  on<T>(event: string, callback: EventCallback<T>): () => void {
    let set = this.listeners.get(event);
    if (set === undefined) {
      set = new Set();
      this.listeners.set(event, set);
    }
    // Cast once here; safe because emit<T> enforces the same T at the call site.
    const cb = callback as EventCallback<unknown>;
    set.add(cb);
    return () => this.off(event, callback);
  }

  /**
   * Remove a previously registered callback.
   * No-op if the callback was not registered.
   */
  off<T>(event: string, callback: EventCallback<T>): void {
    const set = this.listeners.get(event);
    if (set === undefined) return;
    set.delete(callback as EventCallback<unknown>);
    if (set.size === 0) this.listeners.delete(event);
  }

  /**
   * Dispatch an event to all current subscribers.
   * Subscribers added during dispatch are NOT called for the current emit
   * (iteration snapshot via spread).
   */
  emit<T>(event: string, data: T): void {
    const set = this.listeners.get(event);
    if (set === undefined) return;
    // Snapshot before iteration so mid-dispatch unsubscribes don't throw.
    for (const cb of [...set]) {
      cb(data);
    }
  }

  /** Remove all subscriptions for every event. */
  clear(): void {
    this.listeners.clear();
  }
}
