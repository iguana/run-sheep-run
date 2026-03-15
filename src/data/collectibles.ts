/**
 * Collectible item definitions for SheepRunner.
 *
 * Each CollectibleDefinition describes both the visual presentation of the
 * pick-up and the gameplay effect applied when the player collides with it.
 *
 * Effect semantics:
 *   stamina        — immediate flat stamina restore, range [0, 1]
 *   speedMult      — multiplier applied on top of current speed (1.2 = +20%)
 *   speedDuration  — seconds the speed boost lasts
 *   staminaRegen   — extra stamina restored per second during regen window
 *   regenDuration  — seconds the regen bonus lasts
 *   points         — bonus score points awarded on collection
 *
 * Visual semantics:
 *   color      — primary mesh colour (MeshToonMaterial hex)
 *   glowColor  — point-light / sprite glow colour (may differ from mesh)
 *   size       — diameter in world units (1 unit ≈ 1 metre)
 *   bobSpeed   — vertical bob oscillation frequency (radians / second)
 *   rotateSpeed — Y-axis spin speed (radians / second)
 *
 * spawnWeight is a relative integer — the weighted pool builder will add
 * this many copies of the type into the pool before sampling.
 */

export type CollectibleType =
  | 'pickle_juice'
  | 'dnb_speaker'
  | 'mountain_token'
  | 'water_station'
  | 'energy_gel';

export interface CollectibleEffect {
  /** Immediate flat stamina restore (0–1). */
  stamina?: number;
  /** Speed multiplier applied for speedDuration seconds. */
  speedMult?: number;
  /** Duration in seconds of the speed boost. */
  speedDuration?: number;
  /** Additional stamina per second regenerated over regenDuration. */
  staminaRegen?: number;
  /** Duration in seconds of the stamina regen bonus. */
  regenDuration?: number;
  /** Bonus score points awarded immediately. */
  points?: number;
}

export interface CollectibleDefinition {
  type: CollectibleType;
  name: string;
  description: string;
  /** Primary mesh / material colour. */
  color: string;
  /** Glow / point-light colour — can contrast with mesh for visual pop. */
  glowColor: string;
  effect: CollectibleEffect;
  /** Relative spawn probability; higher = appears more often. */
  spawnWeight: number;
  /** Collision / render diameter in world units. */
  size: number;
  /** Vertical bob frequency in radians per second. */
  bobSpeed: number;
  /** Y-axis rotation speed in radians per second. */
  rotateSpeed: number;
}

export const COLLECTIBLES: Readonly<Record<CollectibleType, CollectibleDefinition>> = {
  // ── Pickle Juice ────────────────────────────────────────────────────────────
  // Real ultra-running folk remedy for cramp. Big, immediate stamina hit.
  // Visually: a sloshing green jar with brine-yellow glow.
  pickle_juice: {
    type: 'pickle_juice',
    name: 'Pickle Juice',
    description:
      'A sloshing jar of tangy brine. Every ultra-runner knows the legend — ' +
      'drink it, feel your legs wake back up. Restores a large chunk of stamina instantly.',
    color: '#6abf5e',   // dill-green jar
    glowColor: '#c8e840', // sharp acid-yellow shimmer
    effect: {
      stamina: 0.45,
      points: 50,
    },
    spawnWeight: 28,
    size: 0.55,
    bobSpeed: 1.8,
    rotateSpeed: 0.6,
  },

  // ── DnB Speaker ─────────────────────────────────────────────────────────────
  // Rare, high-impact power-up. Blasts drum & bass, triggering a speed surge.
  // Large, glowing, pulsing to the beat. Hard to miss, hard to resist.
  dnb_speaker: {
    type: 'dnb_speaker',
    name: 'DnB Speaker',
    description:
      'A battered Bluetooth speaker belting out 170 BPM drum & bass. ' +
      'Your legs sync up whether you want them to or not — speed surges for 8 seconds.',
    color: '#1a1a2e',   // near-black speaker housing
    glowColor: '#ff3a1a', // hot red bass-port glow
    effect: {
      speedMult: 1.35,
      speedDuration: 8,
      points: 150,
    },
    spawnWeight: 8,
    size: 0.90,
    bobSpeed: 3.2,     // pulses fast — simulates bass thump
    rotateSpeed: 1.4,
  },

  // ── Mountain Token ───────────────────────────────────────────────────────────
  // Rare collectible — a glowing stone disc stamped with a peak symbol.
  // Grants a modest stamina boost, bonus score, and is a progression currency
  // used to unlock race slots (handled by the save/progression system).
  mountain_token: {
    type: 'mountain_token',
    name: 'Mountain Token',
    description:
      'A smooth obsidian disc stamped with a mountain silhouette. ' +
      'Rare — only the brave spots it. Restores a little stamina and counts ' +
      'toward race unlocks.',
    color: '#2e1a4a',   // deep obsidian purple-black
    glowColor: '#b06cff', // violet gem-light
    effect: {
      stamina: 0.20,
      points: 300,
    },
    spawnWeight: 6,
    size: 0.65,
    bobSpeed: 1.2,
    rotateSpeed: 0.9,
  },

  // ── Water Station ────────────────────────────────────────────────────────────
  // Common, gentle, sustained effect. A proper aid-station table with cups.
  // Does not give an instant hit but keeps you going for longer.
  water_station: {
    type: 'water_station',
    name: 'Water Station',
    description:
      'A fold-out table stacked with paper cups. Not glamorous. ' +
      'Absolutely essential. Triggers steady stamina regeneration for 12 seconds.',
    color: '#4fc3f7',   // sky blue
    glowColor: '#a8e8ff', // pale aqua shimmer
    effect: {
      staminaRegen: 0.03,
      regenDuration: 12,
      points: 30,
    },
    spawnWeight: 32,
    size: 0.70,
    bobSpeed: 1.0,
    rotateSpeed: 0.3,
  },

  // ── Energy Gel ───────────────────────────────────────────────────────────────
  // Most common collectible. Small, quick, and everywhere. A foil gel sachet.
  // Smaller stamina hit than pickle juice but no limit on how many you grab.
  energy_gel: {
    type: 'energy_gel',
    name: 'Energy Gel',
    description:
      'A sticky foil sachet of hyper-sweet glucose gloop in a flavour ' +
      'that defies description. Fast, small stamina hit — less than pickle ' +
      'juice but plentiful on the course.',
    color: '#f4a020',   // vivid orange foil
    glowColor: '#ffe060', // warm amber-gold sheen
    effect: {
      stamina: 0.22,
      points: 20,
    },
    spawnWeight: 36,
    size: 0.40,
    bobSpeed: 2.2,
    rotateSpeed: 1.0,
  },
};

/**
 * Build a weighted pool of CollectibleType values for random spawn selection.
 *
 * Usage:
 *   const pool = buildWeightedPool();
 *   const type = pool[Math.floor(Math.random() * pool.length)];
 */
export function buildWeightedPool(): CollectibleType[] {
  const pool: CollectibleType[] = [];
  for (const def of Object.values(COLLECTIBLES)) {
    for (let i = 0; i < def.spawnWeight; i++) {
      pool.push(def.type);
    }
  }
  return pool;
}

/**
 * Total combined weight across all collectible types.
 * Useful for probability calculations without constructing the full pool.
 */
export function totalSpawnWeight(): number {
  return Object.values(COLLECTIBLES).reduce((acc, def) => acc + def.spawnWeight, 0);
}
