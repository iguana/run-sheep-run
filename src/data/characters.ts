/**
 * Character definitions for SheepRunner.
 *
 * AnimalType drives both gameplay stat selection and procedural mesh generation.
 *
 * bodyShape hints to the renderer how to proportion the body geometry:
 *   round   — compact sphere-like torso (sheep, pig)
 *   sleek   — lean and low-slung (fox, cheetah, wolf)
 *   bulky   — wide, heavy-set (bear)
 *   tall    — long-legged, high centre of gravity (horse, deer, ostrich)
 *   compact — medium body, powerful hindquarters (hare, kangaroo, goat, husky)
 *
 * speedProfile determines how the AI paces itself:
 *   sprinter  — blistering early pace, fades hard in the final third
 *   endurance — conservative early, builds; strongest in the final quarter
 *   balanced  — relatively even splits with a slight late fade
 *   steady    — metronomic; never bonks, never surges
 *
 * baseSpeedMult is relative to 1.0 (Woolsworth / the player baseline).
 * Values above 1 mean the competitor is faster on average; values below 1
 * are slower. The full spread intentionally creates natural difficulty
 * variation across the 10-race campaign without needing per-race tuning.
 *
 * Colors are hex strings consumed directly by Three.js MeshToonMaterial.
 */

export type BodyShape = 'round' | 'sleek' | 'bulky' | 'tall' | 'compact';
export type SpeedProfile = 'sprinter' | 'endurance' | 'balanced' | 'steady';

/** Alias for AnimalRunner — the fully-typed animal descriptor used by renderers. */
export type AnimalType = AnimalRunner;

export interface AnimalRunner {
  /** Stable identifier used by game state and save data. */
  id: string;
  /** Display name shown on the character card and race HUD. */
  name: string;
  /** Species name for flavour text. */
  species: string;
  /** Primary coat / fur / feather colour. */
  bodyColor: string;
  /** Secondary colour — muzzle, belly, inner ear, beak, or spot markings. */
  accentColor: string;
  /**
   * Tertiary detail colour — hooves, claws, beak tip, or stripe highlights.
   * Optional; renderer falls back to a darkened bodyColor if omitted.
   */
  detailColor?: string;
  bodyShape: BodyShape;
  speedProfile: SpeedProfile;
  /** One or two sentence flavour description shown on the character card. */
  personality: string;
  /**
   * Multiplier applied to the baseline race speed.
   * 1.0 == player sheep. > 1 is faster. < 1 is slower.
   */
  baseSpeedMult: number;
  /**
   * Body geometry scale multipliers relative to the base mesh (1, 1, 1).
   * x = width, y = height, z = depth.
   */
  bodyScale: { x: number; y: number; z: number };
  /** Leg length multiplier — affects stride animation and mesh proportions. */
  legLength: number;
  /**
   * Grouped color palette consumed by CharacterRenderer.
   * If provided, takes precedence over the flat bodyColor / accentColor fields.
   */
  colors?: {
    /** Primary body / coat color (hex string). */
    body: string;
    /** Accent / belly / muzzle color. */
    accent: string;
    /** Eye white sclera color. */
    eyeWhite: string;
    /** Pupil color. */
    pupil: string;
    /** Extremity color — hooves, beak tip, claw tips. */
    extremity: string;
  };
}

// ─── Player character ────────────────────────────────────────────────────────

export const PLAYER_SHEEP: AnimalRunner = {
  id: 'sheep',
  name: 'Woolsworth',
  species: 'Sheep',
  bodyColor: '#f5f0e8',   // cream fleece
  accentColor: '#d4cbb8', // slightly darker wool underside
  detailColor: '#2a2a2a', // black hooves and nose
  bodyShape: 'round',
  speedProfile: 'balanced',
  personality:
    'Determined underdog with a heart of gold. Terrible at hill starts, ' +
    'magnificent at mile 20 when everyone else is shuffling.',
  baseSpeedMult: 1.0,
  bodyScale: { x: 1.0, y: 1.0, z: 1.0 },
  legLength: 1.0,
};

// ─── AI Competitors ──────────────────────────────────────────────────────────

export const COMPETITORS: AnimalRunner[] = [
  // ── 1 ─ Finnegan Fox ───────────────────────────────────────────────────────
  {
    id: 'fox',
    name: 'Finnegan Fox',
    species: 'Red Fox',
    bodyColor: '#d4601c',   // rich burnt orange
    accentColor: '#f5ede0', // cream chest, muzzle, and tail tip
    detailColor: '#1a1a1a', // black paws and ear tips
    bodyShape: 'sleek',
    speedProfile: 'sprinter',
    personality:
      'Cocky club runner who blasts off at the gun and trash-talks at every ' +
      'water station. Usually gets humbled around kilometre 7 but occasionally ' +
      'pulls off something spectacular — and never lets you forget it.',
    baseSpeedMult: 1.12,
    bodyScale: { x: 0.85, y: 0.95, z: 1.1 },
    legLength: 1.1,
  },

  // ── 2 ─ Dara Cheetah ───────────────────────────────────────────────────────
  {
    id: 'cheetah',
    name: 'Dara Cheetah',
    species: 'Cheetah',
    bodyColor: '#cca86a',   // tawny gold
    accentColor: '#f5e8c8', // pale belly
    detailColor: '#2c1a0e', // dark spot markings and tear stripes
    bodyShape: 'sleek',
    speedProfile: 'sprinter',
    personality:
      'Wears a heart-rate monitor on each wrist. Absolutely blistering in the ' +
      'first half; completely hollow by the last quarter. Blames the heat. ' +
      'Always the heat.',
    baseSpeedMult: 1.18,
    bodyScale: { x: 0.80, y: 1.0, z: 1.15 },
    legLength: 1.25,
  },

  // ── 3 ─ Remy Wolf ──────────────────────────────────────────────────────────
  {
    id: 'wolf',
    name: 'Remy Wolf',
    species: 'Grey Wolf',
    bodyColor: '#7a8090',   // blue-grey pelt
    accentColor: '#c8c0b0', // cream underbelly and muzzle
    detailColor: '#3a3030', // dark saddle markings
    bodyShape: 'sleek',
    speedProfile: 'endurance',
    personality:
      'Silent. Absolutely silent. Holds back in the early miles and ' +
      'methodically picks off competitors one by one, like he has a list. ' +
      'He probably has a list.',
    baseSpeedMult: 1.08,
    bodyScale: { x: 0.92, y: 1.0, z: 1.1 },
    legLength: 1.15,
  },

  // ── 4 ─ Sterling Horse ─────────────────────────────────────────────────────
  {
    id: 'horse',
    name: 'Sterling Horse',
    species: 'Thoroughbred',
    bodyColor: '#7a4820',   // deep chestnut bay
    accentColor: '#c89060', // lighter honey-tan flank sheen
    detailColor: '#0e0e0e', // black mane, tail, and stockings
    bodyShape: 'tall',
    speedProfile: 'steady',
    personality:
      'Former racehorse who "retired" to road running. Carries himself with ' +
      'imperious dignity and absolutely hates mud. Very vocal about hating mud. ' +
      'Impeccable form until a trail race undoes him completely.',
    baseSpeedMult: 1.10,
    bodyScale: { x: 1.1, y: 1.4, z: 1.2 },
    legLength: 1.7,
  },

  // ── 5 ─ Harvey Hare ────────────────────────────────────────────────────────
  {
    id: 'hare',
    name: 'Harvey Hare',
    species: 'Brown Hare',
    bodyColor: '#c8a86c',   // sandy warm brown
    accentColor: '#e8d8b8', // pale underside and inner ear
    detailColor: '#8a5820', // darker back and ear tips
    bodyShape: 'compact',
    speedProfile: 'sprinter',
    personality:
      'Lives by the philosophy that the race is won in the first 400 metres. ' +
      'He is consistently wrong about this. Phenomenally entertaining when ' +
      'going well; slightly painful to watch when he isn\'t.',
    baseSpeedMult: 1.15,
    bodyScale: { x: 0.75, y: 0.9, z: 0.85 },
    legLength: 1.35,
  },

  // ── 6 ─ Clementine Tortoise ────────────────────────────────────────────────
  {
    id: 'tortoise',
    name: 'Clementine Tortoise',
    species: 'Hermann\'s Tortoise',
    bodyColor: '#4a7c4e',   // deep forest-green shell
    accentColor: '#8b6914', // amber-gold scute detail
    detailColor: '#2a4a2e', // dark shell seam lines
    bodyShape: 'compact',
    speedProfile: 'steady',
    personality:
      'Never bonks. Never surges. Never panics. Has finished 47 consecutive ' +
      'ultra races without a single DNF. Carries homemade aid-station snacks ' +
      'and is the only competitor who looks relaxed at mile 90.',
    baseSpeedMult: 0.82,
    bodyScale: { x: 1.15, y: 0.65, z: 1.1 },
    legLength: 0.6,
  },

  // ── 7 ─ Iris Deer ──────────────────────────────────────────────────────────
  {
    id: 'deer',
    name: 'Iris Deer',
    species: 'White-tailed Deer',
    bodyColor: '#c89050',   // warm fawn
    accentColor: '#f5ede0', // white scut flash and throat patch
    detailColor: '#3a2010', // dark brown hooves and nose
    bodyShape: 'tall',
    speedProfile: 'balanced',
    personality:
      'Effortlessly graceful — looks like she\'s out for a countryside amble ' +
      'even at full race pace. Gets spooked by sharp noises and occasionally ' +
      'bounds off the course into the nearest tree line. Always finds her way back.',
    baseSpeedMult: 1.05,
    bodyScale: { x: 0.88, y: 1.25, z: 1.0 },
    legLength: 1.5,
  },

  // ── 8 ─ Bruno Bear ─────────────────────────────────────────────────────────
  {
    id: 'bear',
    name: 'Bruno Bear',
    species: 'Brown Bear',
    bodyColor: '#6b4226',   // deep chocolate brown
    accentColor: '#b08050', // honey-brown muzzle and chest
    detailColor: '#2a1408', // very dark claws and pawpads
    bodyShape: 'bulky',
    speedProfile: 'endurance',
    personality:
      'Looks implausible in running shoes. Runs with thunderous, ground-eating ' +
      'strides that translate into a surprisingly competitive long-distance pace. ' +
      'Eats a heroic quantity of salmon sandwiches at every aid station.',
    baseSpeedMult: 0.95,
    bodyScale: { x: 1.35, y: 1.2, z: 1.25 },
    legLength: 0.95,
  },

  // ── 9 ─ Celeste Ostrich ────────────────────────────────────────────────────
  {
    id: 'ostrich',
    name: 'Celeste Ostrich',
    species: 'Common Ostrich',
    bodyColor: '#2c2c2c',   // near-black body feathers
    accentColor: '#e8c8a0', // buff neck and lower legs
    detailColor: '#f5e8d8', // pale wing-feather tips
    bodyShape: 'tall',
    speedProfile: 'sprinter',
    personality:
      'Six feet of feathered velocity. Hits 45 km/h on the flat and knows it. ' +
      'Terrible on technical trail — those legs were not built for switchbacks. ' +
      'Refuses to wear a hat because it ruins her aerodynamics.',
    baseSpeedMult: 1.20,
    bodyScale: { x: 0.9, y: 1.6, z: 0.95 },
    legLength: 2.0,
  },

  // ── 10 ─ Jasper Kangaroo ──────────────────────────────────────────────────
  {
    id: 'kangaroo',
    name: 'Jasper Kangaroo',
    species: 'Red Kangaroo',
    bodyColor: '#c07040',   // dusty outback red
    accentColor: '#e8c8a8', // pale chest and inner arms
    detailColor: '#8a4820', // darker muzzle and ear backs
    bodyShape: 'compact',
    speedProfile: 'balanced',
    personality:
      'Stores elastic energy in his tendons like coiled springs; the ' +
      'downhills are genuinely unfair. Carries race nutrition in his own ' +
      'built-in pouch, which he considers a decisive competitive advantage ' +
      'and mentions at every opportunity.',
    baseSpeedMult: 1.07,
    bodyScale: { x: 0.9, y: 1.15, z: 1.0 },
    legLength: 1.4,
  },

  // ── 11 ─ Kaya Husky ───────────────────────────────────────────────────────
  {
    id: 'husky',
    name: 'Kaya Husky',
    species: 'Siberian Husky',
    bodyColor: '#8090a8',   // cool silver-blue
    accentColor: '#e8e4dc', // white facial mask and paws
    detailColor: '#3a3848', // dark grey saddle and cap
    bodyShape: 'compact',
    speedProfile: 'endurance',
    personality:
      'Trained on the Iditarod trail; gets visibly stronger as conditions ' +
      'deteriorate. Rain, mud, cold, headwind — you can almost see her grinning. ' +
      'On hot days she\'s just here for the company. Wears booties in the desert; ' +
      'has never explained why.',
    baseSpeedMult: 1.03,
    bodyScale: { x: 1.0, y: 1.0, z: 1.05 },
    legLength: 1.1,
  },

  // ── 12 ─ Petra Goat ───────────────────────────────────────────────────────
  {
    id: 'goat',
    name: 'Petra Goat',
    species: 'Alpine Ibex',
    bodyColor: '#a08060',   // warm tan-grey
    accentColor: '#d4b890', // lighter belly and muzzle
    detailColor: '#4a3020', // dark horn and hoof colour
    bodyShape: 'compact',
    speedProfile: 'endurance',
    personality:
      'Mountain specialist. Climbs impossibly steep gradients at a pace that ' +
      'seems physically impossible, then casually eats a thorn bush at the summit. ' +
      'Has very strong opinions about proper hoof-drop in trail shoes.',
    baseSpeedMult: 1.02,
    bodyScale: { x: 0.95, y: 1.05, z: 0.95 },
    legLength: 1.1,
  },
];

/**
 * Convenience lookup by runner id.
 * Includes the player so systems can resolve any runner id uniformly.
 */
export const ALL_RUNNERS: ReadonlyMap<string, AnimalRunner> = new Map(
  [PLAYER_SHEEP, ...COMPETITORS].map((r) => [r.id, r]),
);
