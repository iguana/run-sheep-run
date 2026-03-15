import { describe, it, expect } from 'vitest';
import {
  PLAYER_SHEEP,
  COMPETITORS,
  ALL_RUNNERS,
  type AnimalRunner,
} from '@/data/characters';

// All characters: player + competitors
const ALL_CHARS: AnimalRunner[] = [PLAYER_SHEEP, ...COMPETITORS];

describe('characters data', () => {
  describe('unique IDs', () => {
    it('all character IDs are unique across the full roster', () => {
      const ids = ALL_CHARS.map((c) => c.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });

    it('all character IDs are non-empty strings', () => {
      for (const char of ALL_CHARS) {
        expect(typeof char.id).toBe('string');
        expect(char.id.length).toBeGreaterThan(0);
      }
    });

    it('ALL_RUNNERS map contains every character', () => {
      for (const char of ALL_CHARS) {
        expect(ALL_RUNNERS.has(char.id), `ALL_RUNNERS missing ${char.id}`).toBe(true);
      }
    });

    it('ALL_RUNNERS map size equals total character count', () => {
      expect(ALL_RUNNERS.size).toBe(ALL_CHARS.length);
    });
  });

  describe('player sheep', () => {
    it('PLAYER_SHEEP exists and has id "sheep"', () => {
      expect(PLAYER_SHEEP).toBeDefined();
      expect(PLAYER_SHEEP.id).toBe('sheep');
    });

    it('player sheep has baseSpeedMult of 1.0 (baseline)', () => {
      expect(PLAYER_SHEEP.baseSpeedMult).toBe(1.0);
    });

    it('player sheep is included in ALL_RUNNERS', () => {
      expect(ALL_RUNNERS.get('sheep')).toBe(PLAYER_SHEEP);
    });
  });

  describe('required fields', () => {
    const requiredStringFields: (keyof AnimalRunner)[] = [
      'id', 'name', 'species', 'bodyColor', 'accentColor', 'personality',
    ];

    for (const field of requiredStringFields) {
      it(`all characters have non-empty "${field}"`, () => {
        for (const char of ALL_CHARS) {
          expect(typeof char[field], `${char.id}.${field} type`).toBe('string');
          expect((char[field] as string).length, `${char.id}.${field} length`).toBeGreaterThan(0);
        }
      });
    }

    it('all characters have a valid bodyShape', () => {
      const validShapes = new Set(['round', 'sleek', 'bulky', 'tall', 'compact']);
      for (const char of ALL_CHARS) {
        expect(validShapes.has(char.bodyShape), `${char.id}.bodyShape invalid: ${char.bodyShape}`).toBe(true);
      }
    });

    it('all characters have a valid speedProfile', () => {
      const validProfiles = new Set(['sprinter', 'endurance', 'balanced', 'steady']);
      for (const char of ALL_CHARS) {
        expect(validProfiles.has(char.speedProfile), `${char.id}.speedProfile invalid: ${char.speedProfile}`).toBe(true);
      }
    });

    it('all characters have a bodyScale with x, y, z', () => {
      for (const char of ALL_CHARS) {
        expect(typeof char.bodyScale.x, `${char.id}.bodyScale.x`).toBe('number');
        expect(typeof char.bodyScale.y, `${char.id}.bodyScale.y`).toBe('number');
        expect(typeof char.bodyScale.z, `${char.id}.bodyScale.z`).toBe('number');
      }
    });

    it('all characters have a positive legLength', () => {
      for (const char of ALL_CHARS) {
        expect(char.legLength, `${char.id}.legLength`).toBeGreaterThan(0);
      }
    });
  });

  describe('baseSpeedMult ranges', () => {
    it('all baseSpeedMult values are positive numbers', () => {
      for (const char of ALL_CHARS) {
        expect(typeof char.baseSpeedMult, `${char.id}.baseSpeedMult type`).toBe('number');
        expect(char.baseSpeedMult, `${char.id}.baseSpeedMult must be positive`).toBeGreaterThan(0);
        expect(isNaN(char.baseSpeedMult), `${char.id}.baseSpeedMult NaN check`).toBe(false);
      }
    });

    it('all baseSpeedMult values are in a reasonable gameplay range (0.5 – 2.0)', () => {
      for (const char of ALL_CHARS) {
        expect(
          char.baseSpeedMult,
          `${char.id}.baseSpeedMult too low: ${char.baseSpeedMult}`,
        ).toBeGreaterThanOrEqual(0.5);
        expect(
          char.baseSpeedMult,
          `${char.id}.baseSpeedMult too high: ${char.baseSpeedMult}`,
        ).toBeLessThanOrEqual(2.0);
      }
    });

    it('no competitor has a baseSpeedMult identical to another competitor', () => {
      const mults = COMPETITORS.map((c) => c.baseSpeedMult);
      const unique = new Set(mults);
      // This catches exact duplicates which would make races boring.
      expect(unique.size).toBe(mults.length);
    });

    it('fastest competitor is not more than 25% faster than the player sheep', () => {
      const maxMult = Math.max(...COMPETITORS.map((c) => c.baseSpeedMult));
      expect(maxMult).toBeLessThanOrEqual(PLAYER_SHEEP.baseSpeedMult * 1.25);
    });

    it('slowest competitor is not less than 75% of the player sheep speed', () => {
      const minMult = Math.min(...COMPETITORS.map((c) => c.baseSpeedMult));
      expect(minMult).toBeGreaterThanOrEqual(PLAYER_SHEEP.baseSpeedMult * 0.75);
    });
  });

  describe('bodyScale validity', () => {
    it('all bodyScale components are positive', () => {
      for (const char of ALL_CHARS) {
        const { x, y, z } = char.bodyScale;
        expect(x, `${char.id}.bodyScale.x`).toBeGreaterThan(0);
        expect(y, `${char.id}.bodyScale.y`).toBeGreaterThan(0);
        expect(z, `${char.id}.bodyScale.z`).toBeGreaterThan(0);
      }
    });

    it('bodyScale components are in a reasonable renderer range (0.3 – 3.0)', () => {
      for (const char of ALL_CHARS) {
        const { x, y, z } = char.bodyScale;
        for (const [axis, val] of [['x', x], ['y', y], ['z', z]] as const) {
          expect(val, `${char.id}.bodyScale.${axis} too small`).toBeGreaterThanOrEqual(0.3);
          expect(val, `${char.id}.bodyScale.${axis} too large`).toBeLessThanOrEqual(3.0);
        }
      }
    });
  });

  describe('hex color fields', () => {
    const hexPattern = /^#[0-9a-fA-F]{3,8}$/;

    it('bodyColor and accentColor are valid hex strings', () => {
      for (const char of ALL_CHARS) {
        expect(hexPattern.test(char.bodyColor), `${char.id}.bodyColor invalid`).toBe(true);
        expect(hexPattern.test(char.accentColor), `${char.id}.accentColor invalid`).toBe(true);
      }
    });

    it('detailColor is either undefined or a valid hex string', () => {
      for (const char of ALL_CHARS) {
        if (char.detailColor !== undefined) {
          expect(hexPattern.test(char.detailColor), `${char.id}.detailColor invalid`).toBe(true);
        }
      }
    });

    it('optional colors palette, if present, has valid hex fields', () => {
      for (const char of ALL_CHARS) {
        if (char.colors === undefined) continue;
        for (const [key, val] of Object.entries(char.colors)) {
          expect(hexPattern.test(val), `${char.id}.colors.${key} invalid`).toBe(true);
        }
      }
    });
  });

  describe('COMPETITORS array', () => {
    it('COMPETITORS is a non-empty array', () => {
      expect(Array.isArray(COMPETITORS)).toBe(true);
      expect(COMPETITORS.length).toBeGreaterThan(0);
    });

    it('COMPETITORS does not include the player sheep', () => {
      const playerInCompetitors = COMPETITORS.some((c) => c.id === PLAYER_SHEEP.id);
      expect(playerInCompetitors).toBe(false);
    });

    it('there is at least one competitor for each speed profile', () => {
      const profiles = new Set(COMPETITORS.map((c) => c.speedProfile));
      for (const profile of ['sprinter', 'endurance', 'balanced', 'steady'] as const) {
        expect(profiles.has(profile), `No competitor with profile: ${profile}`).toBe(true);
      }
    });
  });
});
