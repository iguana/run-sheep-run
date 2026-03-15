import { describe, it, expect, beforeEach } from 'vitest';
import { GameState, type GameScene } from '@/game/GameState';

describe('GameState', () => {
  let state: GameState;

  beforeEach(() => {
    state = new GameState();
  });

  // ---------------------------------------------------------------------------
  // Initial state
  // ---------------------------------------------------------------------------

  describe('initial state', () => {
    it('starts in the loading scene', () => {
      expect(state.currentScene).toBe('loading');
    });

    it('has no active race state', () => {
      expect(state.raceState).toBeNull();
    });

    it('is not paused', () => {
      expect(state.paused).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Valid transitions
  // ---------------------------------------------------------------------------

  describe('valid transitions', () => {
    it('loading → menu', () => {
      state.transition('menu');
      expect(state.currentScene).toBe('menu');
    });

    it('menu → raceSelect', () => {
      state.transition('menu');
      state.transition('raceSelect');
      expect(state.currentScene).toBe('raceSelect');
    });

    it('menu → settings', () => {
      state.transition('menu');
      state.transition('settings');
      expect(state.currentScene).toBe('settings');
    });

    it('raceSelect → racing (via startRace)', () => {
      state.transition('menu');
      state.transition('raceSelect');
      state.startRace('test_race', 1000, 5);
      expect(state.currentScene).toBe('racing');
    });

    it('raceSelect → menu', () => {
      state.transition('menu');
      state.transition('raceSelect');
      state.transition('menu');
      expect(state.currentScene).toBe('menu');
    });

    it('racing → results', () => {
      state.transition('menu');
      state.transition('raceSelect');
      state.startRace('r', 100, 2);
      state.transition('results');
      expect(state.currentScene).toBe('results');
    });

    it('racing → menu', () => {
      state.transition('menu');
      state.transition('raceSelect');
      state.startRace('r', 100, 2);
      state.transition('menu');
      expect(state.currentScene).toBe('menu');
    });

    it('results → raceSelect', () => {
      state.transition('menu');
      state.transition('raceSelect');
      state.startRace('r', 100, 2);
      state.transition('results');
      state.transition('raceSelect');
      expect(state.currentScene).toBe('raceSelect');
    });

    it('results → menu', () => {
      state.transition('menu');
      state.transition('raceSelect');
      state.startRace('r', 100, 2);
      state.transition('results');
      state.transition('menu');
      expect(state.currentScene).toBe('menu');
    });

    it('settings → menu', () => {
      state.transition('menu');
      state.transition('settings');
      state.transition('menu');
      expect(state.currentScene).toBe('menu');
    });

    it('clears paused flag on any valid transition', () => {
      state.paused = true;
      state.transition('menu');
      expect(state.paused).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Invalid transitions
  // ---------------------------------------------------------------------------

  describe('invalid transitions throw', () => {
    const invalidPairs: [GameScene, GameScene][] = [
      ['loading', 'racing'],
      ['loading', 'raceSelect'],
      ['loading', 'results'],
      ['loading', 'settings'],
      ['menu', 'racing'],
      ['menu', 'results'],
      ['menu', 'loading'],
      ['raceSelect', 'results'],
      ['raceSelect', 'loading'],
      ['raceSelect', 'settings'],
      ['settings', 'racing'],
      ['settings', 'raceSelect'],
      ['settings', 'results'],
      ['settings', 'loading'],
    ];

    for (const [from, to] of invalidPairs) {
      it(`${from} → ${to} throws`, () => {
        // Manually set the current scene to test the invalid transition directly.
        state.currentScene = from;
        expect(() => state.transition(to)).toThrow(
          `Invalid scene transition: "${from}" → "${to}"`,
        );
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Race state management
  // ---------------------------------------------------------------------------

  describe('startRace', () => {
    beforeEach(() => {
      state.transition('menu');
      state.transition('raceSelect');
    });

    it('transitions to racing scene', () => {
      state.startRace('meadow', 1000, 6);
      expect(state.currentScene).toBe('racing');
    });

    it('creates a raceState with correct raceId', () => {
      state.startRace('meadow', 1000, 6);
      expect(state.raceState?.raceId).toBe('meadow');
    });

    it('initialises elapsed to 0', () => {
      state.startRace('meadow', 1000, 6);
      expect(state.raceState?.elapsed).toBe(0);
    });

    it('initialises distance to 0', () => {
      state.startRace('meadow', 1000, 6);
      expect(state.raceState?.distance).toBe(0);
    });

    it('stores the total distance', () => {
      state.startRace('meadow', 5000, 8);
      expect(state.raceState?.totalDistance).toBe(5000);
    });

    it('initialises position to totalRunners (back of pack)', () => {
      state.startRace('meadow', 1000, 7);
      expect(state.raceState?.position).toBe(7);
      expect(state.raceState?.totalRunners).toBe(7);
    });

    it('initialises stamina to 1', () => {
      state.startRace('meadow', 1000, 4);
      expect(state.raceState?.stamina).toBe(1);
    });

    it('initialises speed to 0', () => {
      state.startRace('meadow', 1000, 4);
      expect(state.raceState?.speed).toBe(0);
    });

    it('initialises finished to false', () => {
      state.startRace('meadow', 1000, 4);
      expect(state.raceState?.finished).toBe(false);
    });
  });

  describe('updateRace', () => {
    beforeEach(() => {
      state.transition('menu');
      state.transition('raceSelect');
      state.startRace('test', 1000, 4);
    });

    it('updates individual fields via partial object', () => {
      state.updateRace({ elapsed: 15.5, position: 2 });
      expect(state.raceState?.elapsed).toBe(15.5);
      expect(state.raceState?.position).toBe(2);
    });

    it('preserves fields that are not in the partial update', () => {
      state.updateRace({ speed: 4.2 });
      expect(state.raceState?.stamina).toBe(1); // unchanged
      expect(state.raceState?.speed).toBe(4.2);
    });

    it('throws when called with no active race', () => {
      state.endRace();
      expect(() => state.updateRace({ elapsed: 1 })).toThrow(
        'updateRace called with no active race',
      );
    });
  });

  describe('endRace', () => {
    beforeEach(() => {
      state.transition('menu');
      state.transition('raceSelect');
      state.startRace('test', 1000, 4);
    });

    it('sets raceState to null', () => {
      state.endRace();
      expect(state.raceState).toBeNull();
    });

    it('is safe to call when raceState is already null', () => {
      state.endRace();
      expect(() => state.endRace()).not.toThrow();
      expect(state.raceState).toBeNull();
    });
  });
});
