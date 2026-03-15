/**
 * animals.ts - Animal / species data types.
 *
 * AnimalType is the canonical discriminated-union key passed around at runtime.
 * AnimalDefinition holds display and gameplay metadata looked up from ANIMALS.
 */

export type AnimalType =
  | 'sheep'
  | 'goat'
  | 'llama'
  | 'alpaca'
  | 'ibex'
  | 'chamois'
  | 'yak'
  | 'bighorn';

export interface AnimalDefinition {
  type: AnimalType;
  displayName: string;
  /** Speed profile used by AI controllers. */
  speedProfile: 'sprinter' | 'endurance' | 'balanced' | 'steady';
  /** Base difficulty multiplier (0.8 – 1.2). */
  difficulty: number;
  /** Base stamina (0–1 scale). Higher = drains more slowly. */
  staminaMultiplier: number;
}

export const ANIMALS: Readonly<Record<AnimalType, AnimalDefinition>> = {
  sheep: {
    type: 'sheep',
    displayName: 'Sheep',
    speedProfile: 'balanced',
    difficulty: 1.0,
    staminaMultiplier: 1.0,
  },
  goat: {
    type: 'goat',
    displayName: 'Goat',
    speedProfile: 'sprinter',
    difficulty: 1.05,
    staminaMultiplier: 0.9,
  },
  llama: {
    type: 'llama',
    displayName: 'Llama',
    speedProfile: 'endurance',
    difficulty: 1.0,
    staminaMultiplier: 1.15,
  },
  alpaca: {
    type: 'alpaca',
    displayName: 'Alpaca',
    speedProfile: 'steady',
    difficulty: 0.9,
    staminaMultiplier: 1.1,
  },
  ibex: {
    type: 'ibex',
    displayName: 'Ibex',
    speedProfile: 'sprinter',
    difficulty: 1.15,
    staminaMultiplier: 0.85,
  },
  chamois: {
    type: 'chamois',
    displayName: 'Chamois',
    speedProfile: 'balanced',
    difficulty: 1.1,
    staminaMultiplier: 1.0,
  },
  yak: {
    type: 'yak',
    displayName: 'Yak',
    speedProfile: 'endurance',
    difficulty: 0.95,
    staminaMultiplier: 1.2,
  },
  bighorn: {
    type: 'bighorn',
    displayName: 'Bighorn',
    speedProfile: 'steady',
    difficulty: 1.1,
    staminaMultiplier: 1.05,
  },
};
