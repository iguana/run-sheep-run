import { describe, it, expect } from 'vitest';
import { RACES, type RaceDefinition } from '@/data/races';

describe('RACES data', () => {
  describe('structural integrity', () => {
    it('RACES is a non-empty array', () => {
      expect(Array.isArray(RACES)).toBe(true);
      expect(RACES.length).toBeGreaterThan(0);
    });

    it('all races have required fields', () => {
      const requiredStringFields: (keyof RaceDefinition)[] = [
        'id', 'name', 'distanceLabel', 'location', 'country',
        'description', 'trackColor',
      ];
      const requiredNumberFields: (keyof RaceDefinition)[] = [
        'distance', 'competitors', 'timeOfDay',
      ];

      for (const race of RACES) {
        for (const field of requiredStringFields) {
          expect(typeof race[field], `${race.id}.${field} should be string`).toBe('string');
          expect((race[field] as string).length, `${race.id}.${field} should be non-empty`).toBeGreaterThan(0);
        }
        for (const field of requiredNumberFields) {
          expect(typeof race[field], `${race.id}.${field} should be number`).toBe('number');
          expect(isNaN(race[field] as number), `${race.id}.${field} should not be NaN`).toBe(false);
        }
      }
    });

    it('every race has a valid terrainType', () => {
      const validTerrains = new Set(['urban', 'trail', 'mountain', 'desert', 'coastal', 'park']);
      for (const race of RACES) {
        expect(validTerrains.has(race.terrainType), `${race.id} has invalid terrainType: ${race.terrainType}`).toBe(true);
      }
    });

    it('every race has a valid weatherPreset', () => {
      const validWeathers = new Set(['clear', 'overcast', 'rain', 'fog', 'snow', 'hot']);
      for (const race of RACES) {
        expect(validWeathers.has(race.weather), `${race.id} has invalid weather: ${race.weather}`).toBe(true);
      }
    });

    it('every race has an envColors object with ground, accent, and sky fields', () => {
      for (const race of RACES) {
        expect(race.envColors, `${race.id} missing envColors`).toBeDefined();
        expect(typeof race.envColors.ground).toBe('string');
        expect(typeof race.envColors.accent).toBe('string');
        expect(typeof race.envColors.sky).toBe('string');
      }
    });

    it('every race has a non-empty elevationProfile array', () => {
      for (const race of RACES) {
        expect(Array.isArray(race.elevationProfile), `${race.id} elevationProfile should be array`).toBe(true);
        expect(race.elevationProfile.length, `${race.id} elevationProfile should not be empty`).toBeGreaterThan(0);
      }
    });

    it('all elevation values are in [0, 1]', () => {
      for (const race of RACES) {
        for (const val of race.elevationProfile) {
          expect(val, `${race.id} elevation value ${val} out of range`).toBeGreaterThanOrEqual(0);
          expect(val, `${race.id} elevation value ${val} out of range`).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  describe('unique IDs', () => {
    it('all race IDs are unique', () => {
      const ids = RACES.map((r) => r.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('all race IDs are non-empty strings', () => {
      for (const race of RACES) {
        expect(typeof race.id).toBe('string');
        expect(race.id.length).toBeGreaterThan(0);
      }
    });
  });

  describe('distance progression', () => {
    it('all distances are positive', () => {
      for (const race of RACES) {
        expect(race.distance, `${race.id}.distance should be positive`).toBeGreaterThan(0);
      }
    });

    it('the first unlocked race is the shortest', () => {
      const alwaysUnlocked = RACES.filter((r) => r.unlockRequirement === null);
      const locked = RACES.filter((r) => r.unlockRequirement !== null);
      const shortestAlwaysUnlocked = Math.min(...alwaysUnlocked.map((r) => r.distance));
      for (const lr of locked) {
        expect(lr.distance).toBeGreaterThanOrEqual(shortestAlwaysUnlocked);
      }
    });

    it('competitors count is positive for all races', () => {
      for (const race of RACES) {
        expect(race.competitors, `${race.id}.competitors should be >= 1`).toBeGreaterThanOrEqual(1);
      }
    });

    it('timeOfDay is in the [0, 24] range', () => {
      for (const race of RACES) {
        expect(race.timeOfDay, `${race.id}.timeOfDay out of range`).toBeGreaterThanOrEqual(0);
        expect(race.timeOfDay, `${race.id}.timeOfDay out of range`).toBeLessThanOrEqual(24);
      }
    });
  });

  describe('unlock chain validity', () => {
    const raceIdSet = new Set(RACES.map((r) => r.id));

    it('all unlockRequirement.raceId values reference existing races', () => {
      for (const race of RACES) {
        if (race.unlockRequirement === null) continue;
        expect(
          raceIdSet.has(race.unlockRequirement.raceId),
          `${race.id} references unknown unlock race: ${race.unlockRequirement.raceId}`,
        ).toBe(true);
      }
    });

    it('all unlockRequirement.maxPosition values are positive integers', () => {
      for (const race of RACES) {
        if (race.unlockRequirement === null) continue;
        const pos = race.unlockRequirement.maxPosition;
        expect(Number.isInteger(pos), `${race.id}.unlockRequirement.maxPosition should be integer`).toBe(true);
        expect(pos, `${race.id}.unlockRequirement.maxPosition should be >= 1`).toBeGreaterThanOrEqual(1);
      }
    });

    it('a race does not require itself to unlock', () => {
      for (const race of RACES) {
        if (race.unlockRequirement === null) continue;
        expect(
          race.unlockRequirement.raceId,
          `${race.id} should not require itself`,
        ).not.toBe(race.id);
      }
    });

    it('there is at least one always-unlocked race (unlockRequirement === null)', () => {
      const alwaysUnlocked = RACES.filter((r) => r.unlockRequirement === null);
      expect(alwaysUnlocked.length).toBeGreaterThanOrEqual(1);
    });

    it('the unlock chain does not contain a race that requires a locked race as its immediate prereq without that prereq being reachable', () => {
      // Build a reachability set starting from always-unlocked races.
      const reachable = new Set(
        RACES.filter((r) => r.unlockRequirement === null).map((r) => r.id),
      );
      let changed = true;
      while (changed) {
        changed = false;
        for (const race of RACES) {
          if (reachable.has(race.id)) continue;
          if (race.unlockRequirement !== null && reachable.has(race.unlockRequirement.raceId)) {
            reachable.add(race.id);
            changed = true;
          }
        }
      }
      // All races in the data should be reachable.
      for (const race of RACES) {
        expect(reachable.has(race.id), `${race.id} is not reachable via the unlock chain`).toBe(true);
      }
    });
  });

  describe('hex color format', () => {
    const hexPattern = /^#[0-9a-fA-F]{3,8}$/;

    it('trackColor is a valid hex string', () => {
      for (const race of RACES) {
        expect(hexPattern.test(race.trackColor), `${race.id}.trackColor invalid: ${race.trackColor}`).toBe(true);
      }
    });

    it('envColors fields are valid hex strings', () => {
      for (const race of RACES) {
        for (const [key, val] of Object.entries(race.envColors)) {
          expect(hexPattern.test(val), `${race.id}.envColors.${key} invalid: ${val}`).toBe(true);
        }
      }
    });
  });
});
