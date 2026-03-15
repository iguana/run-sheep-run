/**
 * ProgressionManager - Race unlock and personal-best persistence.
 *
 * All data is stored in localStorage under a namespaced key so it survives
 * page refreshes and browser sessions.
 *
 * Data model (JSON in localStorage):
 * {
 *   "unlockedRaces": ["meadow_sprint", "dirt_dash"],
 *   "results": {
 *     "meadow_sprint": { bestTime: 142.3, bestPosition: 1 },
 *     ...
 *   }
 * }
 *
 * Design notes:
 *   - save() is called explicitly; no auto-save on every write so callers
 *     can batch multiple updates before persisting.
 *   - load() is safe to call even if localStorage is empty or corrupted;
 *     it falls back to a clean default state.
 *   - The first race (meadow_sprint) is always unlocked so new players can
 *     start without completing prerequisites.
 */

import { STORAGE_KEY_PREFIX } from '../game/constants';
import { RACES } from '../data/races';

// ---------------------------------------------------------------------------
// Storage schema
// ---------------------------------------------------------------------------

interface RaceRecord {
  bestTime: number;
  bestPosition: number;
}

interface SaveData {
  unlockedRaces: string[];
  results: Record<string, RaceRecord>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = `${STORAGE_KEY_PREFIX}progression`;

/** raceId values that are always available regardless of save data. */
const ALWAYS_UNLOCKED: readonly string[] = RACES
  .filter((r) => r.unlockRequirement === null)
  .map((r) => r.id);

// ---------------------------------------------------------------------------
// Class
// ---------------------------------------------------------------------------

export class ProgressionManager {
  private unlockedRaces: Set<string>;
  private records: Map<string, RaceRecord>;

  constructor() {
    this.unlockedRaces = new Set(ALWAYS_UNLOCKED);
    this.records = new Map();
    this.load();
  }

  // ---------------------------------------------------------------------------
  // Query API
  // ---------------------------------------------------------------------------

  isRaceUnlocked(raceId: string): boolean {
    return this.unlockedRaces.has(raceId);
  }

  unlockRace(raceId: string): void {
    this.unlockedRaces.add(raceId);
  }

  /**
   * Record a race result.
   * Updates the personal best if the new time/position is better.
   * Also evaluates whether the result unlocks any dependent races.
   */
  recordRaceResult(raceId: string, position: number, time: number): void {
    const existing = this.records.get(raceId);

    const newRecord: RaceRecord = {
      bestTime:     existing !== undefined ? Math.min(existing.bestTime, time) : time,
      bestPosition: existing !== undefined ? Math.min(existing.bestPosition, position) : position,
    };

    this.records.set(raceId, newRecord);

    // Check if this result satisfies any unlock requirement.
    for (const race of RACES) {
      if (race.unlockRequirement === null) continue;
      if (race.unlockRequirement.raceId !== raceId) continue;
      if (this.unlockedRaces.has(race.id)) continue;

      if (position <= race.unlockRequirement.maxPosition) {
        this.unlockedRaces.add(race.id);
      }
    }
  }

  /** Best finishing time in seconds for a race, or null if never completed. */
  getBestTime(raceId: string): number | null {
    return this.records.get(raceId)?.bestTime ?? null;
  }

  /** Best finishing position for a race, or null if never completed. */
  getBestPosition(raceId: string): number | null {
    return this.records.get(raceId)?.bestPosition ?? null;
  }

  /** List of raceIds the player has at least one recorded result for. */
  getCompletedRaces(): string[] {
    return [...this.records.keys()];
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  save(): void {
    try {
      const data: SaveData = {
        unlockedRaces: [...this.unlockedRaces],
        results: Object.fromEntries(this.records),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // localStorage can throw in private-browsing mode or when quota is exceeded.
      // Silently ignore — the in-memory state is still valid for the session.
    }
  }

  load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return;

      const data = JSON.parse(raw) as Partial<SaveData>;

      if (Array.isArray(data.unlockedRaces)) {
        for (const id of data.unlockedRaces) {
          if (typeof id === 'string') {
            this.unlockedRaces.add(id);
          }
        }
      }

      if (data.results !== null && typeof data.results === 'object') {
        for (const [id, rec] of Object.entries(data.results)) {
          if (
            rec !== null &&
            typeof rec === 'object' &&
            'bestTime' in rec &&
            'bestPosition' in rec &&
            typeof (rec as RaceRecord).bestTime === 'number' &&
            typeof (rec as RaceRecord).bestPosition === 'number'
          ) {
            this.records.set(id, rec as RaceRecord);
          }
        }
      }
    } catch {
      // Corrupted JSON or missing keys — leave state as default.
      // Already initialised with ALWAYS_UNLOCKED in the constructor.
    }
  }

  /** Wipe all progress and reset to initial state. Saves immediately. */
  reset(): void {
    this.unlockedRaces = new Set(ALWAYS_UNLOCKED);
    this.records = new Map();
    this.save();
  }
}
