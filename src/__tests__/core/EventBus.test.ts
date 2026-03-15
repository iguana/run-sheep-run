import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '@/core/EventBus';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  describe('subscribe and receive events', () => {
    it('calls the callback when the matching event is emitted', () => {
      const handler = vi.fn();
      bus.on('test', handler);
      bus.emit('test', { value: 42 });
      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith({ value: 42 });
    });

    it('does not call the callback for a different event name', () => {
      const handler = vi.fn();
      bus.on('event-a', handler);
      bus.emit('event-b', {});
      expect(handler).not.toHaveBeenCalled();
    });

    it('passes the exact payload object to the callback', () => {
      const received: unknown[] = [];
      bus.on<string>('msg', (data) => received.push(data));
      bus.emit('msg', 'hello');
      expect(received).toEqual(['hello']);
    });
  });

  describe('unsubscribe stops receiving', () => {
    it('stops calling the callback after the returned unsubscribe function is invoked', () => {
      const handler = vi.fn();
      const unsub = bus.on('tick', handler);
      bus.emit('tick', null);
      expect(handler).toHaveBeenCalledOnce();

      unsub();
      bus.emit('tick', null);
      expect(handler).toHaveBeenCalledOnce(); // still once — not called again
    });

    it('off() with the original callback removes only that subscription', () => {
      const a = vi.fn();
      const b = vi.fn();
      bus.on('ev', a);
      bus.on('ev', b);
      bus.off('ev', a);
      bus.emit('ev', null);
      expect(a).not.toHaveBeenCalled();
      expect(b).toHaveBeenCalledOnce();
    });

    it('off() on an event with no listeners is a no-op', () => {
      expect(() => bus.off('nonexistent', vi.fn())).not.toThrow();
    });

    it('off() on a callback not registered on that event is a no-op', () => {
      const a = vi.fn();
      const b = vi.fn();
      bus.on('ev', a);
      expect(() => bus.off('ev', b)).not.toThrow();
      bus.emit('ev', null);
      expect(a).toHaveBeenCalledOnce();
    });
  });

  describe('multiple listeners on same event', () => {
    it('calls all registered callbacks when the event fires', () => {
      const handlers = [vi.fn(), vi.fn(), vi.fn()];
      for (const h of handlers) bus.on('multi', h);
      bus.emit('multi', 'payload');
      for (const h of handlers) {
        expect(h).toHaveBeenCalledOnce();
        expect(h).toHaveBeenCalledWith('payload');
      }
    });

    it('does not double-call a handler registered twice (Set semantics)', () => {
      const handler = vi.fn();
      bus.on('ev', handler);
      bus.on('ev', handler); // same reference — Set deduplicates
      bus.emit('ev', null);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('only removes the one unsubscribed handler when multiple are registered', () => {
      const a = vi.fn();
      const b = vi.fn();
      const unsubA = bus.on('ev', a);
      bus.on('ev', b);
      unsubA();
      bus.emit('ev', null);
      expect(a).not.toHaveBeenCalled();
      expect(b).toHaveBeenCalledOnce();
    });
  });

  describe('clear removes all listeners', () => {
    it('prevents all callbacks from being called after clear()', () => {
      const a = vi.fn();
      const b = vi.fn();
      bus.on('foo', a);
      bus.on('bar', b);
      bus.clear();
      bus.emit('foo', null);
      bus.emit('bar', null);
      expect(a).not.toHaveBeenCalled();
      expect(b).not.toHaveBeenCalled();
    });

    it('allows new subscriptions to work normally after clear()', () => {
      const old = vi.fn();
      bus.on('ev', old);
      bus.clear();

      const fresh = vi.fn();
      bus.on('ev', fresh);
      bus.emit('ev', 'data');
      expect(old).not.toHaveBeenCalled();
      expect(fresh).toHaveBeenCalledWith('data');
    });
  });

  describe('emit with no listeners', () => {
    it('does not throw when emitting an event that has no subscribers', () => {
      expect(() => bus.emit('nothing', {})).not.toThrow();
    });

    it('does not throw after all subscribers have been removed', () => {
      const unsub = bus.on('ev', vi.fn());
      unsub();
      expect(() => bus.emit('ev', {})).not.toThrow();
    });
  });

  describe('mid-dispatch safety', () => {
    it('does not call a subscriber added during dispatch for the current emit', () => {
      const lateHandler = vi.fn();
      bus.on('ev', () => {
        bus.on('ev', lateHandler);
      });
      bus.emit('ev', null);
      expect(lateHandler).not.toHaveBeenCalled(); // snapshot behaviour
    });

    it('does not throw when a subscriber unsubscribes itself during dispatch', () => {
      let unsub: (() => void) | null = null;
      unsub = bus.on('ev', () => {
        unsub?.();
      });
      expect(() => bus.emit('ev', null)).not.toThrow();
    });
  });
});
