/**
 * constants.ts - Central numeric constants for sheeprunner.
 *
 * Keep all magic numbers here so tuning never requires hunting across files.
 * Units are SI: meters, seconds, meters-per-second.
 */

// ---------------------------------------------------------------------------
// Track / terrain
// ---------------------------------------------------------------------------

/** Default track width at centre (meters). */
export const TRACK_WIDTH_DEFAULT = 12;

/** Half-width buffer beyond track edge before the off-track penalty kicks in. */
export const TRACK_EDGE_BUFFER = 1.5;

/** Maximum lateral offset allowed before the runner is fully off-track. */
export const TRACK_LATERAL_CLAMP = TRACK_WIDTH_DEFAULT / 2 + TRACK_EDGE_BUFFER;

/** Number of terrain chunks maintained around the player. */
export const TERRAIN_CHUNK_COUNT = 6;

/** Size of one terrain chunk in meters. */
export const TERRAIN_CHUNK_SIZE = 120;

/** Vertex subdivisions per chunk side (chunk mesh resolution). */
export const TERRAIN_CHUNK_SEGMENTS = 16;

// ---------------------------------------------------------------------------
// Runner physics
// ---------------------------------------------------------------------------

/** Base top speed in m/s — fast and fun. */
export const RUNNER_BASE_SPEED = 12;

/** Absolute top sprint speed (m/s). */
export const RUNNER_MAX_SPEED = 22;

/** Minimum forward speed even while bonking (m/s). */
export const RUNNER_MIN_SPEED = 0.8;

/** Lateral steering speed in m/s per unit of steer input. */
export const RUNNER_LATERAL_SPEED = 4.5;

/** Speed multiplier while fully off-track. */
export const RUNNER_OFF_TRACK_PENALTY = 0.65;

/** Speed multiplier per unit of uphill slope (slope is –1 to +1). */
export const RUNNER_SLOPE_FACTOR = 0.18;

/** Stamina level below which slowdown begins (0–1). */
export const STAMINA_WARN_THRESHOLD = 0.20;

/** Speed multiplier at the moment stamina hits exactly 0 ("bonk"). */
export const BONK_SPEED_MULT = 0.30;

/** Stamina drain rate at base speed (fraction per second). */
export const STAMINA_DRAIN_BASE = 0.018;

/** Extra drain per m/s above base speed (exponential feel). */
export const STAMINA_DRAIN_SPEED_COEFF = 0.007;

/** Stamina recovery rate while bonking (fraction per second). */
export const BONK_STAMINA_REGEN = 0.04;

/** Leg-phase advance rate per metre travelled (radians/m). */
export const LEG_PHASE_RATE = 3.2;

/** Body-bob amplitude (arbitrary units, consumed by the renderer). */
export const BODY_BOB_AMPLITUDE = 0.06;

// ---------------------------------------------------------------------------
// Countdown / race
// ---------------------------------------------------------------------------

/** Seconds of countdown before the race starts (3, 2, 1 → GO). */
export const RACE_COUNTDOWN_DURATION = 3;

/** Separation (m) between runners at start-line stagger. */
export const START_STAGGER_SPREAD = 1.2;

// ---------------------------------------------------------------------------
// Collectibles
// ---------------------------------------------------------------------------

/** Distance (m) between consecutive collectible spawn slots. */
export const COLLECTIBLE_SPACING = 60;

/** Collectible pickup radius (m) — simple sphere test. */
export const COLLECTIBLE_PICKUP_RADIUS = 2.0;

/** Float-bob amplitude (m) for idle animation. */
export const COLLECTIBLE_BOB_AMPLITUDE = 0.25;

/** Float-bob frequency (Hz). */
export const COLLECTIBLE_BOB_FREQUENCY = 1.2;

/** Rotation speed (radians/s). */
export const COLLECTIBLE_SPIN_SPEED = 1.8;

// ---------------------------------------------------------------------------
// Collectible effect magnitudes
// ---------------------------------------------------------------------------

export const EFFECT_PICKLE_STAMINA = 0.35;
export const EFFECT_GEL_STAMINA = 0.20;
export const EFFECT_WATER_REGEN_RATE = 0.012; // fraction/s
export const EFFECT_WATER_REGEN_DURATION = 8;  // seconds
export const EFFECT_DNB_SPEED_MULT = 1.25;
export const EFFECT_DNB_DURATION = 6;           // seconds
export const EFFECT_TOKEN_STAMINA = 0.12;

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

/** Minimum randomness added to AI lateral steer each update. */
export const AI_STEER_NOISE = 0.15;

/** How quickly AI steer converges back toward centre (fraction/s). */
export const AI_CENTRE_PULL = 0.6;

/** Difficulty range: slowest to fastest multiplier. */
export const AI_DIFFICULTY_MIN = 0.80;
export const AI_DIFFICULTY_MAX = 1.20;

// ---------------------------------------------------------------------------
// Progression / storage
// ---------------------------------------------------------------------------

export const STORAGE_KEY_PREFIX = 'sheeprunner_';

// ---------------------------------------------------------------------------
// Grouped constant objects (spec-compatible API)
// These mirror the flat constants above but are grouped by system for ergonomic
// destructuring in modules that only care about one subsystem.
// ---------------------------------------------------------------------------

/** Fixed-step physics configuration. */
export const PHYSICS = {
  TICK_RATE: 60,
  DT: 1 / 60,
  /** Max real-time seconds per frame before clamping (spiral-of-death guard). */
  MAX_FRAME_TIME: 0.25,
} as const;

/** Player sheep runner movement parameters. */
export const RUNNER = {
  BASE_SPEED: 5.0,
  SPRINT_SPEED: 8.5,
  MAX_SPEED: 12.0,
  STEER_SENSITIVITY: 3.0,
  STEER_RETURN_SPEED: 5.0,
  OFF_TRACK_PENALTY: 0.6,
  UPHILL_FACTOR: 0.15,
  DOWNHILL_FACTOR: 0.08,
  DRAFT_DISTANCE: 3.0,
  DRAFT_BONUS: 0.05,
  LEG_CYCLE_RATE: 8.0,
  BODY_BOB_AMPLITUDE: 0.15,
} as const;

/** Stamina / fatigue system. */
export const STAMINA = {
  MAX: 100,
  BASE_DRAIN: 2.0,
  SPRINT_DRAIN_MULT: 3.0,
  REGEN_RATE: 0.5,
  BONK_THRESHOLD: 0,
  BONK_SPEED_MULT: 0.3,
  BONK_RECOVERY_RATE: 5.0,
  PICKLE_JUICE_RESTORE: 15,
  MUSIC_BOOST_REGEN: 3.0,
} as const;

/** Third-person chase camera configuration. */
export const CAMERA_CONST = {
  CHASE_DISTANCE: 8,
  CHASE_HEIGHT: 4,
  CHASE_SMOOTH: 6,
  FOV_BASE: 65,
  FOV_SPRINT_BONUS: 10,
  SHAKE_ON_COLLECT: 0.15,
  NEAR: 0.5,
  FAR: 2000,
} as const;

/** Terrain generation and rendering. */
export const TERRAIN_CONST = {
  CHUNK_SIZE: 100,
  RENDER_DISTANCE: 5,
  LOD_LEVELS: 3,
  GRASS_COLOR: '#6db33f',
  DIRT_COLOR: '#c4a35a',
  ROCK_COLOR: '#9a9a9a',
  SNOW_COLOR: '#f5f5ff',
  SAND_COLOR: '#e8c870',
} as const;

/** Collectible item spawning and effect values. */
export const COLLECTIBLE_CONST = {
  /** Minimum track distance (m) between consecutive collectible spawns. */
  SPAWN_INTERVAL: 50,
  PICKUP_RADIUS: 2.0,
  PICKLE_JUICE_RESTORE: 15,
  MUSIC_SPEED_BOOST: 1.3,
  MUSIC_BOOST_DURATION: 5.0,
  MUSIC_STAMINA_REGEN: 3.0,
} as const;

/** Scene lighting and fog. */
export const LIGHTING = {
  AMBIENT_INTENSITY: 1.2,
  DIRECTIONAL_INTENSITY: 2.0,
  SHADOW_MAP_SIZE: 1024,
  FOG_NEAR: 200,
  FOG_FAR: 1200,
} as const;

/** AI competitor behaviour parameters. */
export const AI = {
  MIN_SPEED_MULT: 0.85,
  MAX_SPEED_MULT: 1.15,
  SURGE_CHANCE: 0.1,
  SURGE_DURATION: 3.0,
  SURGE_SPEED_BONUS: 0.15,
  DRAFT_CHANCE: 0.3,
} as const;

/**
 * Renderer configuration consumed by RenderSystem and CameraController.
 */
export const RENDER = {
  FOV_BASE: 65,
  /** FOV at maximum speed. */
  FOV_MAX: 80,
  /** Speed (m/s) at which FOV_MAX is reached. */
  FOV_MAX_SPEED: 12,
  CAMERA_NEAR: 0.5,
  CAMERA_FAR: 2000,
  MAX_PIXEL_RATIO: 2,
  SHADOW_MAP_SIZE: 1024,
  FOG_NEAR: 150,
  FOG_FAR: 800,
} as const;

/**
 * Character animation constants consumed by CharacterRenderer.
 */
export const ANIM = {
  /** Peak leg rotation (radians) at max speed. */
  LEG_AMPLITUDE: 0.6,
  /** Phase offset (radians) between front and back leg pairs for a trot gait. */
  LEG_BACK_PHASE_OFFSET: Math.PI,
  /** Body vertical bob peak amplitude (world units) at max speed. */
  BODY_BOB_AMPLITUDE: 0.06,
} as const;

/**
 * Chase-camera tuning consumed by CameraController.
 */
export const CAMERA = {
  /** Distance behind the runner (m) in normal chase mode. */
  OFFSET_BACK: 8,
  /** Height above the runner (m) in normal chase mode. */
  OFFSET_UP: 4,
  /** Exponential-decay factor for position lerp. */
  POSITION_LERP: 6,
  /** Exponential-decay factor for look-at lerp. */
  LOOKAT_LERP: 8,
  /** Exponential-decay factor for FOV lerp. */
  FOV_LERP: 4,
  /** Degrees of roll per rad/s of turn rate. */
  BANK_FACTOR: 3,
  // Dramatic mode — race start cinematic
  DRAMATIC_START_BACK: 18,
  DRAMATIC_START_UP: 8,
  // Dramatic mode — finish cinematic
  DRAMATIC_FINISH_BACK: 6,
  DRAMATIC_FINISH_UP: 2,
} as const;

/**
 * Track geometry constants consumed by TrackRenderer.
 */
export const TRACK = {
  /** Full track width in world units. */
  WIDTH: 12,
  /** Half-width of the playable lane. */
  HALF_WIDTH: 6,
  /** Segments to keep visible ahead of the player during long races. */
  VISIBLE_SEGMENTS_AHEAD: 60,
  /** Segments to keep visible behind the player. */
  VISIBLE_SEGMENTS_BEHIND: 10,
} as const;

/**
 * Environment/decoration constants consumed by EnvironmentRenderer.
 */
export const ENV = {
  /** Culling distance for environment objects (world units from camera). */
  CULL_DISTANCE: 120,
  /** Minimum lateral offset from track centre before placing objects. */
  OBJECT_SIDE_OFFSET_MIN: 12,
  /** Maximum lateral offset from track centre. */
  OBJECT_SIDE_OFFSET_MAX: 35,
  /** Hard cap on environment instance count per scene. */
  MAX_OBJECTS: 60,
} as const;

/**
 * Post-processing effect defaults consumed by PostProcessing.
 */
export const POST = {
  /** Default bloom strength (0–1). */
  BLOOM_STRENGTH: 0.15,
  /** Luma threshold above which bloom is applied (0–1). */
  BLOOM_THRESHOLD: 0.85,
  /** Vignette darkness (0 = off, 1 = full black edges). */
  VIGNETTE_STRENGTH: 0.15,
} as const;
