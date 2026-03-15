import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// localStorage mock — must be in place before ProgressionManager is imported
// so that the constructor's load() call uses the mock.
// ---------------------------------------------------------------------------

const localStorageStore: Map<string, string> = new Map();

const localStorageMock = {
  getItem: vi.fn((key: string) => localStorageStore.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => { localStorageStore.set(key, value); }),
  removeItem: vi.fn((key: string) => { localStorageStore.delete(key); }),
  clear: vi.fn(() => { localStorageStore.clear(); }),
};

vi.stubGlobal('localStorage', localStorageMock);

// Now safe to import
import { ProgressionManager } from '@/gameplay/ProgressionManager';
import { RACES } from '@/data/races';
import { STORAGE_KEY_PREFIX } from '@/game/constants';

const STORAGE_KEY = `${STORAGE_KEY_PREFIX}progression`;

// Races that are always available (unlockRequirement === null)
const ALWAYS_UNLOCKED_IDS = RACES.filter((r) => r.unlockRequirement === null).map((r) => r.id);

// The first race that requires completing another race
const FIRST_LOCKED_RACE = RACES.find((r) => r.unlockRequirement !== null)!;
const UNLOCK_REQUIREMENT = FIRST_LOCKED_RACE.unlockRequirement!;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProgressionManager', () => {
  beforeEach(() => {
    localStorageStore.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  describe('initial state (empty localStorage)', () => {
    it('always-unlocked races are unlocked from the start', () => {
      const pm = new ProgressionManager();
      for (const id of ALWAYS_UNLOCKED_IDS) {
        expect(pm.isRaceUnlocked(id)).toBe(true);
      }
    });

    it('locked races are not unlocked initially', () => {
      const pm = new ProgressionManager();
      expect(pm.isRaceUnlocked(FIRST_LOCKED_RACE.id)).toBe(false);
    });

    it('getBestTime returns null for a race not yet completed', () => {
      const pm = new ProgressionManager();
      expect(pm.getBestTime(ALWAYS_UNLOCKED_IDS[0]!)).toBeNull();
    });

    it('getBestPosition returns null for a race not yet completed', () => {
      const pm = new ProgressionManager();
      expect(pm.getBestPosition(ALWAYS_UNLOCKED_IDS[0]!)).toBeNull();
    });

    it('getCompletedRaces returns an empty array initially', () => {
      const pm = new ProgressionManager();
      expect(pm.getCompletedRaces()).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // unlockRace
  // -------------------------------------------------------------------------

  describe('unlockRace', () => {
    it('unlocks a race that was previously locked', () => {
      const pm = new ProgressionManager();
      expect(pm.isRaceUnlocked(FIRST_LOCKED_RACE.id)).toBe(false);
      pm.unlockRace(FIRST_LOCKED_RACE.id);
      expect(pm.isRaceUnlocked(FIRST_LOCKED_RACE.id)).toBe(true);
    });

    it('is idempotent — calling twice does not cause issues', () => {
      const pm = new ProgressionManager();
      pm.unlockRace(FIRST_LOCKED_RACE.id);
      pm.unlockRace(FIRST_LOCKED_RACE.id);
      expect(pm.isRaceUnlocked(FIRST_LOCKED_RACE.id)).toBe(true);
    });

    it('unlocking a non-existent race id does not throw', () => {
      const pm = new ProgressionManager();
      expect(() => pm.unlockRace('imaginary_race')).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // recordRaceResult — unlocking mechanics
  // -------------------------------------------------------------------------

  describe('recordRaceResult — unlock chain', () => {
    it('recording a result that meets unlock criteria unlocks the dependent race', () => {
      const pm = new ProgressionManager();
      pm.recordRaceResult(
        UNLOCK_REQUIREMENT.raceId,
        UNLOCK_REQUIREMENT.maxPosition, // exactly meets requirement
        120,
      );
      expect(pm.isRaceUnlocked(FIRST_LOCKED_RACE.id)).toBe(true);
    });

    it('does not unlock the next race when position is worse than maxPosition', () => {
      const pm = new ProgressionManager();
      pm.recordRaceResult(
        UNLOCK_REQUIREMENT.raceId,
        UNLOCK_REQUIREMENT.maxPosition + 1, // one worse
        120,
      );
      expect(pm.isRaceUnlocked(FIRST_LOCKED_RACE.id)).toBe(false);
    });

    it('a position better than maxPosition still unlocks the next race', () => {
      const pm = new ProgressionManager();
      if (UNLOCK_REQUIREMENT.maxPosition > 1) {
        pm.recordRaceResult(
          UNLOCK_REQUIREMENT.raceId,
          1, // first place — better than any maxPosition > 1
          90,
        );
        expect(pm.isRaceUnlocked(FIRST_LOCKED_RACE.id)).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // recordRaceResult — personal bests
  // -------------------------------------------------------------------------

  describe('recordRaceResult — personal bests', () => {
    const raceId = ALWAYS_UNLOCKED_IDS[0]!;

    it('stores the first result as the best time and position', () => {
      const pm = new ProgressionManager();
      pm.recordRaceResult(raceId, 3, 200);
      expect(pm.getBestTime(raceId)).toBe(200);
      expect(pm.getBestPosition(raceId)).toBe(3);
    });

    it('updates best time when a faster time is recorded', () => {
      const pm = new ProgressionManager();
      pm.recordRaceResult(raceId, 3, 200);
      pm.recordRaceResult(raceId, 4, 180); // faster time, worse position
      expect(pm.getBestTime(raceId)).toBe(180);
    });

    it('keeps existing best time when a slower time is recorded', () => {
      const pm = new ProgressionManager();
      pm.recordRaceResult(raceId, 1, 150);
      pm.recordRaceResult(raceId, 1, 200); // slower
      expect(pm.getBestTime(raceId)).toBe(150);
    });

    it('updates best position when a better position is recorded', () => {
      const pm = new ProgressionManager();
      pm.recordRaceResult(raceId, 4, 200);
      pm.recordRaceResult(raceId, 2, 210); // better position
      expect(pm.getBestPosition(raceId)).toBe(2);
    });

    it('keeps existing best position when a worse position is recorded', () => {
      const pm = new ProgressionManager();
      pm.recordRaceResult(raceId, 1, 200);
      pm.recordRaceResult(raceId, 5, 180);
      expect(pm.getBestPosition(raceId)).toBe(1);
    });

    it('records multiple different races independently', () => {
      const pm = new ProgressionManager();
      pm.recordRaceResult(raceId, 1, 100);
      pm.recordRaceResult('other_race', 3, 500);
      expect(pm.getBestTime(raceId)).toBe(100);
      expect(pm.getBestTime('other_race')).toBe(500);
    });

    it('getCompletedRaces includes races that have been recorded', () => {
      const pm = new ProgressionManager();
      pm.recordRaceResult(raceId, 1, 100);
      expect(pm.getCompletedRaces()).toContain(raceId);
    });
  });

  // -------------------------------------------------------------------------
  // Persistence — save / load round-trip
  // -------------------------------------------------------------------------

  describe('save and load round-trip', () => {
    const raceId = ALWAYS_UNLOCKED_IDS[0]!;

    it('save() writes to localStorage', () => {
      const pm = new ProgressionManager();
      pm.recordRaceResult(raceId, 1, 123);
      pm.save();
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        STORAGE_KEY,
        expect.any(String),
      );
    });

    it('load() restores saved results', () => {
      const pm1 = new ProgressionManager();
      pm1.recordRaceResult(raceId, 2, 456);
      pm1.save();

      // Create a new instance — it will call load() in the constructor
      const pm2 = new ProgressionManager();
      expect(pm2.getBestTime(raceId)).toBe(456);
      expect(pm2.getBestPosition(raceId)).toBe(2);
    });

    it('load() restores unlocked races', () => {
      const pm1 = new ProgressionManager();
      pm1.unlockRace(FIRST_LOCKED_RACE.id);
      pm1.save();

      const pm2 = new ProgressionManager();
      expect(pm2.isRaceUnlocked(FIRST_LOCKED_RACE.id)).toBe(true);
    });

    it('load() is safe when localStorage is empty', () => {
      expect(() => new ProgressionManager()).not.toThrow();
    });

    it('load() is safe when localStorage contains corrupted JSON', () => {
      localStorageStore.set(STORAGE_KEY, 'NOT_VALID_JSON{{{{');
      expect(() => new ProgressionManager()).not.toThrow();
    });

    it('load() is safe when localStorage entry has wrong schema', () => {
      localStorageStore.set(STORAGE_KEY, JSON.stringify({ unexpected: 'shape' }));
      const pm = new ProgressionManager();
      // Should still have always-unlocked races
      expect(pm.isRaceUnlocked(ALWAYS_UNLOCKED_IDS[0]!)).toBe(true);
    });

    it('load() ignores results entries that are missing required fields', () => {
      localStorageStore.set(
        STORAGE_KEY,
        JSON.stringify({
          unlockedRaces: [],
          results: { bad_race: { notBestTime: 99 } }, // wrong shape
        }),
      );
      const pm = new ProgressionManager();
      expect(pm.getBestTime('bad_race')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // reset
  // -------------------------------------------------------------------------

  describe('reset', () => {
    it('clears all recorded results', () => {
      const pm = new ProgressionManager();
      pm.recordRaceResult(ALWAYS_UNLOCKED_IDS[0]!, 1, 100);
      pm.reset();
      expect(pm.getBestTime(ALWAYS_UNLOCKED_IDS[0]!)).toBeNull();
    });

    it('re-locks races that were unlocked via results', () => {
      const pm = new ProgressionManager();
      pm.unlockRace(FIRST_LOCKED_RACE.id);
      pm.reset();
      expect(pm.isRaceUnlocked(FIRST_LOCKED_RACE.id)).toBe(false);
    });

    it('always-unlocked races remain accessible after reset', () => {
      const pm = new ProgressionManager();
      pm.reset();
      for (const id of ALWAYS_UNLOCKED_IDS) {
        expect(pm.isRaceUnlocked(id)).toBe(true);
      }
    });

    it('calls save() so the reset persists across instances', () => {
      const pm = new ProgressionManager();
      pm.recordRaceResult(ALWAYS_UNLOCKED_IDS[0]!, 1, 99);
      pm.save();
      pm.reset();

      const pm2 = new ProgressionManager();
      expect(pm2.getBestTime(ALWAYS_UNLOCKED_IDS[0]!)).toBeNull();
    });
  });
});
