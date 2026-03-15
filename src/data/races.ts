/**
 * Race definitions for SheepRunner.
 *
 * Distances are in metres. Elevation profiles are ~20 normalised samples
 * in the range [0, 1] that represent the terrain height throughout the
 * course. envColors gives a three-colour palette (ground, accent, sky)
 * that the renderer uses to tint the environment for each race.
 */

export type TerrainType =
  | 'urban'
  | 'trail'
  | 'mountain'
  | 'desert'
  | 'coastal'
  | 'park';

export type WeatherPreset =
  | 'clear'
  | 'overcast'
  | 'rain'
  | 'fog'
  | 'snow'
  | 'hot';

export interface UnlockRequirement {
  raceId: string;
  maxPosition: number; // player must finish at or above this position
}

export interface EnvColors {
  ground: string; // hex
  accent: string; // hex
  sky: string;    // hex
}

export interface RaceDefinition {
  id: string;
  name: string;
  distance: number;      // metres
  distanceLabel: string; // human-readable (e.g. "1 mile", "5 km")
  location: string;
  country: string;
  realEvent?: string;    // name of the real-world event this is based on
  terrainType: TerrainType;
  /** ~20 normalised height samples spanning the full course, range [0, 1]. */
  elevationProfile: number[];
  /** null means the race is available from the start. */
  unlockRequirement: UnlockRequirement | null;
  weather: WeatherPreset;
  competitors: number; // number of AI runners (not counting the player)
  timeOfDay: number;   // 0–24 hour float
  description: string;
  trackColor: string;  // hex colour for the race path on the map / minimap
  envColors: EnvColors;
}

export const RACES: RaceDefinition[] = [
  // ─── 1 ────────────────────────────────────────────────────────────────────
  {
    id: 'bannister_mile',
    name: 'Bannister Mile',
    distance: 1609,
    distanceLabel: '1 mile',
    location: 'Iffley Road Track, Oxford',
    country: 'UK',
    realEvent: 'Roger Bannister\'s Sub-4-Minute Mile, 1954',
    terrainType: 'urban',
    // Virtually flat cinder track — tiny undulations from lane camber only
    elevationProfile: [
      0.50, 0.51, 0.50, 0.49, 0.50, 0.51, 0.50, 0.49,
      0.50, 0.51, 0.50, 0.49, 0.50, 0.51, 0.50, 0.49,
      0.50, 0.51, 0.50, 0.50,
    ],
    unlockRequirement: null,
    weather: 'clear',
    competitors: 6,
    timeOfDay: 14.0, // bright afternoon
    description:
      'The hallowed red cinder track where Roger Bannister shattered the ' +
      'four-minute barrier. Four laps of pure, flat speed — no excuses, ' +
      'nowhere to hide. The crowd hushes; the only sound is the crunch of ' +
      'spikes on brick-dust. History is waiting at the finish tape.',
    trackColor: '#d4a76a',
    envColors: {
      ground: '#7cb342', // bright grass green
      accent: '#e67e22', // warm orange accents
      sky: '#87ceeb',    // bright sky blue
    },
  },

  // ─── 2 ────────────────────────────────────────────────────────────────────
  {
    id: 'park_run',
    name: 'Parkrun Classic',
    distance: 5000,
    distanceLabel: '5 km',
    location: 'Bushy Park, London',
    country: 'UK',
    realEvent: 'Bushy Park Time Trial (original Parkrun)',
    terrainType: 'park',
    // Gentle swell — one modest rise crossing the deer meadow, rest flat
    elevationProfile: [
      0.20, 0.22, 0.28, 0.35, 0.40, 0.42, 0.38, 0.30,
      0.25, 0.22, 0.24, 0.30, 0.36, 0.38, 0.33, 0.27,
      0.22, 0.20, 0.20, 0.20,
    ],
    unlockRequirement: { raceId: 'bannister_mile', maxPosition: 3 },
    weather: 'overcast',
    competitors: 8,
    timeOfDay: 9.0, // Saturday morning ritual
    description:
      'The birthplace of global Parkrun: a brisk Saturday-morning lap ' +
      'through Bushy Park\'s chestnut avenues, watched over by the famous ' +
      'herd of red deer. Friendly, chaotic, and faster than it looks. ' +
      'Autumn leaves carpet the path; the smell of damp grass is everywhere.',
    trackColor: '#27ae60',
    envColors: {
      ground: '#5d8a44', // lush park grass
      accent: '#8b6914', // chestnut avenue bark
      sky: '#8fa8b8',    // classic grey London overcast
    },
  },

  // ─── 3 ────────────────────────────────────────────────────────────────────
  {
    id: 'bay_breakers',
    name: 'Bay Breakers 10K',
    distance: 10000,
    distanceLabel: '10 km',
    location: 'San Francisco',
    country: 'USA',
    realEvent: 'Bay to Breakers',
    terrainType: 'coastal',
    // Famous Hayes Street Hill spike at ~30%, then rolling descent to Ocean Beach
    elevationProfile: [
      0.10, 0.12, 0.15, 0.40, 0.72, 0.85, 0.78, 0.65,
      0.55, 0.48, 0.42, 0.38, 0.35, 0.30, 0.25, 0.20,
      0.15, 0.12, 0.10, 0.08,
    ],
    unlockRequirement: { raceId: 'park_run', maxPosition: 4 },
    weather: 'fog',
    competitors: 10,
    timeOfDay: 8.0,
    description:
      'From the Embarcadero to the Pacific — past painted Victorians, up ' +
      'the lung-busting Hayes Street Hill, and down through the panhandle. ' +
      'Half the field is wearing costumes. A fog bank smothers the finish ' +
      'line at Ocean Beach; you might not see it until you\'re through it.',
    trackColor: '#f39c12',
    envColors: {
      ground: '#b5a898', // San Francisco concrete and dry summer grass
      accent: '#d35400', // Victorian painted-lady terracotta
      sky: '#c0d0d8',    // Karl the Fog diffused light
    },
  },

  // ─── 4 ────────────────────────────────────────────────────────────────────
  {
    id: 'great_north_run',
    name: 'Great North Run',
    distance: 21097,
    distanceLabel: 'Half Marathon',
    location: 'Newcastle upon Tyne to South Shields',
    country: 'UK',
    realEvent: 'Great North Run',
    terrainType: 'urban',
    // Drops from Newcastle city centre, undulates through Gateshead suburbs, final coastal flat
    elevationProfile: [
      0.60, 0.55, 0.50, 0.55, 0.62, 0.58, 0.52, 0.48,
      0.44, 0.42, 0.46, 0.50, 0.44, 0.38, 0.35, 0.30,
      0.25, 0.22, 0.18, 0.15,
    ],
    unlockRequirement: { raceId: 'bay_breakers', maxPosition: 5 },
    weather: 'overcast',
    competitors: 12,
    timeOfDay: 10.5,
    description:
      'The world\'s biggest half marathon: 60,000 runners crossing the ' +
      'Tyne Bridge in a wall of colour, thumping northerly wind off the ' +
      'North Sea. Geordie crowds line every mile; brass bands play in the ' +
      'underpasses. The red arrows scream overhead at the start.',
    trackColor: '#8e44ad',
    envColors: {
      ground: '#7a8a6e', // Gateshead damp tarmac-green verge
      accent: '#4a6fa5', // Tyne bridge steel blue
      sky: '#9aaab8',    // North East overcast silver
    },
  },

  // ─── 5 ────────────────────────────────────────────────────────────────────
  {
    id: 'tokyo_marathon',
    name: 'Tokyo Marathon',
    distance: 42195,
    distanceLabel: 'Marathon',
    location: 'Tokyo',
    country: 'Japan',
    realEvent: 'Tokyo Marathon',
    terrainType: 'urban',
    // Pancake flat — the faintest elevation change running through downtown
    elevationProfile: [
      0.30, 0.30, 0.31, 0.32, 0.31, 0.30, 0.30, 0.31,
      0.32, 0.31, 0.30, 0.30, 0.31, 0.30, 0.30, 0.31,
      0.30, 0.30, 0.31, 0.30,
    ],
    unlockRequirement: { raceId: 'great_north_run', maxPosition: 5 },
    weather: 'clear',
    competitors: 14,
    timeOfDay: 9.1,
    description:
      'A World Marathon Major on streets lined with cherry blossoms and ' +
      'origami banners. The course weaves past Asakusa temple, through ' +
      'Ginza\'s gleaming towers, and along Shinjuku\'s neon-flanked boulevard. ' +
      'Volunteers in matching aprons hand out onigiri and mochi at every ' +
      'aid station. Precision organisation — but the crowd is electric.',
    trackColor: '#e91e8c',
    envColors: {
      ground: '#e8d8c4', // pale concrete with sakura petal scatter
      accent: '#f48fb1', // cherry blossom pink
      sky: '#b0d8f0',    // Tokyo spring blue-white haze
    },
  },

  // ─── 6 ────────────────────────────────────────────────────────────────────
  {
    id: 'nyc_marathon',
    name: 'NYC Marathon',
    distance: 42195,
    distanceLabel: 'Marathon',
    location: 'New York City',
    country: 'USA',
    realEvent: 'TCS New York City Marathon',
    terrainType: 'urban',
    // Five bridges create five distinct elevation bumps across the five boroughs
    elevationProfile: [
      0.10, 0.55, 0.30, 0.35, 0.50, 0.28, 0.32, 0.38,
      0.48, 0.30, 0.28, 0.34, 0.46, 0.30, 0.26, 0.32,
      0.40, 0.28, 0.22, 0.18,
    ],
    unlockRequirement: { raceId: 'tokyo_marathon', maxPosition: 6 },
    weather: 'clear',
    competitors: 16,
    timeOfDay: 9.0,
    description:
      'Fifty thousand runners. Five boroughs. One finish line in Central ' +
      'Park. The Verrazano Bridge climb at mile one filters the field; ' +
      'the roar from the Queensboro Bridge descent is physical. ' +
      'Every borough has its own soundtrack — merengue in the Bronx, ' +
      'gospel in Harlem, and the whole city hollering you home.',
    trackColor: '#2980b9',
    envColors: {
      ground: '#6b7280', // New York City asphalt grey
      accent: '#e8b84b', // autumn Central Park foliage gold
      sky: '#7ab8e8',    // crisp November blue
    },
  },

  // ─── 7 ────────────────────────────────────────────────────────────────────
  {
    id: 'cotswold_ultra',
    name: 'Cotswold Way Ultra',
    distance: 120701,
    distanceLabel: '75 miles',
    location: 'Chipping Campden to Bath, Cotswolds',
    country: 'UK',
    realEvent: 'Cotswold Way Century',
    terrainType: 'trail',
    // Relentlessly rolling escarpment — repeated short climbs and plunges
    elevationProfile: [
      0.55, 0.70, 0.45, 0.75, 0.40, 0.80, 0.50, 0.72,
      0.38, 0.65, 0.82, 0.44, 0.70, 0.55, 0.60, 0.48,
      0.75, 0.52, 0.42, 0.35,
    ],
    unlockRequirement: { raceId: 'nyc_marathon', maxPosition: 6 },
    weather: 'rain',
    competitors: 10,
    timeOfDay: 6.0, // dawn start
    description:
      'Eighty miles of oolitic limestone escarpment, ancient beech hangers, ' +
      'and honey-stone villages. The rain turns bridleways to chocolate ' +
      'rivers; stiles demand knee lifts your legs forgot how to do. ' +
      'Aid stations smell of soup and wet dog. If you make Broadway Tower ' +
      'at dark you\'re going to be okay.',
    trackColor: '#16a085',
    envColors: {
      ground: '#6b8f5e', // wet Cotswold grass-mud
      accent: '#d4a84b', // limestone warm gold
      sky: '#7a8c7e',    // low English rain-cloud green-grey
    },
  },

  // ─── 8 ────────────────────────────────────────────────────────────────────
  {
    id: 'western_states',
    name: 'Western States 100',
    distance: 160934,
    distanceLabel: '100 miles',
    location: 'Squaw Valley to Auburn, Sierra Nevada',
    country: 'USA',
    realEvent: 'Western States Endurance Run',
    terrainType: 'mountain',
    // Massive climb from Squaw Valley then relentless descent into canyons, brutal heat in canyons
    elevationProfile: [
      0.10, 0.75, 0.90, 0.80, 0.65, 0.85, 0.70, 0.55,
      0.40, 0.60, 0.45, 0.30, 0.50, 0.35, 0.20, 0.38,
      0.25, 0.15, 0.10, 0.05,
    ],
    unlockRequirement: { raceId: 'cotswold_ultra', maxPosition: 5 },
    weather: 'hot',
    competitors: 8,
    timeOfDay: 5.0, // 5 am cannon start
    description:
      'The granddaddy of American ultra running. Climb from the ski resort ' +
      'into the Sierra Nevada snowfields at dawn, then descend 18,000 feet ' +
      'through roasting granite canyons. By noon the canyon floors hit 110°F. ' +
      'The American River is a religious experience. The silver belt buckle ' +
      'waits in Auburn — if you make the 30-hour cutoff.',
    trackColor: '#e74c3c',
    envColors: {
      ground: '#c4956a', // Sierra granite dust and pine duff
      accent: '#4a7c4e', // high-Sierra lodgepole pine
      sky: '#f4c276',    // hot California midday gold-white
    },
  },

  // ─── 9 ────────────────────────────────────────────────────────────────────
  {
    id: 'utmb',
    name: 'UTMB Mont-Blanc',
    distance: 171000,
    distanceLabel: '106 miles',
    location: 'Chamonix, Mont Blanc Massif',
    country: 'France / Italy / Switzerland',
    realEvent: 'Ultra-Trail du Mont-Blanc',
    terrainType: 'mountain',
    // Three major alpine passes — each a full ~1000m+ effort — and technical descent
    elevationProfile: [
      0.20, 0.55, 0.90, 0.60, 0.30, 0.65, 0.95, 0.55,
      0.25, 0.60, 0.85, 0.50, 0.30, 0.65, 0.88, 0.55,
      0.30, 0.20, 0.15, 0.10,
    ],
    unlockRequirement: { raceId: 'western_states', maxPosition: 4 },
    weather: 'overcast',
    competitors: 8,
    timeOfDay: 18.0, // Friday evening start
    description:
      'A circumnavigation of the Mont Blanc massif through France, Italy, ' +
      'and Switzerland: 106 miles and 32,000 feet of climbing across exposed ' +
      'ridgelines and alpine meadows. The start in Chamonix is a festival; ' +
      'by 3am above Col Ferret you are alone with headlamp, rock, and the ' +
      'Milky Way. Cowbells echo up the valleys at every checkpoint.',
    trackColor: '#9b59b6',
    envColors: {
      ground: '#8a9e8a', // alpine tundra slate-green
      accent: '#e8e4d8', // glacier white-grey
      sky: '#6b7fa8',    // high-altitude dusk indigo-grey
    },
  },

  // ─── 10 ───────────────────────────────────────────────────────────────────
  {
    id: 'moab_240',
    name: 'Moab 240',
    distance: 386243,
    distanceLabel: '240 miles',
    location: 'Moab, Utah',
    country: 'USA',
    realEvent: 'Moab 240 Endurance Run',
    terrainType: 'desert',
    // Four major canyon systems separated by mesa plateaux — huge variety of relief
    elevationProfile: [
      0.30, 0.55, 0.80, 0.60, 0.25, 0.50, 0.85, 0.65,
      0.35, 0.55, 0.70, 0.45, 0.20, 0.50, 0.78, 0.60,
      0.40, 0.30, 0.20, 0.10,
    ],
    unlockRequirement: { raceId: 'utmb', maxPosition: 4 },
    weather: 'hot',
    competitors: 6,
    timeOfDay: 8.0,
    description:
      'Two hundred and forty miles through the canyon lands of southern Utah: ' +
      'red Navajo sandstone arches, slickrock mesas, juniper desert, and the ' +
      'La Sal Mountains looming silver above the heat shimmer. Racers carry ' +
      'everything they need. Nights are freezing; days are scorching. The ' +
      'Colorado Plateau is indifferent to your suffering — and magnificent.',
    trackColor: '#e67e22',
    envColors: {
      ground: '#c0622a', // Moab red-orange slickrock
      accent: '#8b4513', // canyon wall sienna
      sky: '#e8c080',    // desert heat-bleached gold sky
    },
  },
];
