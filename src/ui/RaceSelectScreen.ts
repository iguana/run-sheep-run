/**
 * RaceSelectScreen.ts
 *
 * Scrollable race-selection overlay for SheepRunner. Each race is presented
 * as a tappable card. Locked races are dimmed and show the unlock requirement.
 */

import { RaceDefinition } from '../data/races';

// ─── Style injection ──────────────────────────────────────────────────────────

const STYLE_ID = 'sr-raceselect-styles';

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const css = `
    /* ── Overlay shell ── */
    .sr-rs-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.4s ease;
      z-index: 10;
      background:
        radial-gradient(ellipse 80% 30% at 50% 100%, #0f3d20 0%, transparent 70%),
        linear-gradient(170deg, #0d0520 0%, #1a0a2e 30%, #2d1b69 65%, #1e0a3e 100%);
    }
    .sr-rs-overlay.sr-visible {
      opacity: 1;
      pointer-events: auto;
    }

    /* ── Background mesh ── */
    .sr-rs-mesh {
      position: absolute;
      inset: 0;
      background-image:
        repeating-linear-gradient(0deg,   transparent, transparent 39px, rgba(124,58,237,0.06) 40px),
        repeating-linear-gradient(90deg,  transparent, transparent 39px, rgba(124,58,237,0.06) 40px);
      pointer-events: none;
    }

    /* ── Header bar ── */
    .sr-rs-header {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px 20px;
      padding-top: max(16px, env(safe-area-inset-top));
      border-bottom: 1px solid rgba(124,58,237,0.25);
      background: rgba(20,10,30,0.7);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    .sr-rs-title {
      flex: 1;
      font-size: clamp(1.2rem, 5vw, 1.6rem);
      font-weight: 900;
      letter-spacing: 0.04em;
      background: linear-gradient(90deg, #ffffff 0%, #ffa94d 60%, #ff6b2b 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin: 0;
    }
    .sr-rs-race-count {
      font-size: 0.78rem;
      font-weight: 600;
      color: rgba(167,139,250,0.7);
      letter-spacing: 0.06em;
      white-space: nowrap;
    }

    /* ── Back button ── */
    .sr-rs-back {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 44px;
      min-height: 44px;
      padding: 0 10px;
      background: rgba(124,58,237,0.18);
      border: 1.5px solid rgba(124,58,237,0.4);
      border-radius: 10px;
      color: #a78bfa;
      font-size: 1.1rem;
      font-weight: 700;
      font-family: inherit;
      cursor: pointer;
      transition: background 0.15s, transform 0.12s;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }
    .sr-rs-back:active { background: rgba(124,58,237,0.35); transform: scale(0.94); }

    /* ── Scroll area ── */
    .sr-rs-scroll {
      position: relative;
      z-index: 2;
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
      padding: 20px 16px max(24px, env(safe-area-inset-bottom));
    }
    .sr-rs-scroll::-webkit-scrollbar { width: 4px; }
    .sr-rs-scroll::-webkit-scrollbar-track { background: transparent; }
    .sr-rs-scroll::-webkit-scrollbar-thumb { background: rgba(124,58,237,0.4); border-radius: 2px; }

    /* ── Grid ── */
    .sr-rs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr));
      gap: 14px;
    }

    /* ── Race card ── */
    .sr-rc {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 18px;
      border-radius: 16px;
      border: 2px solid var(--rc-color, #7c3aed);
      background: rgba(20,10,30,0.82);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      cursor: pointer;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      transition:
        transform 0.15s ease,
        box-shadow 0.15s ease,
        background 0.15s ease;
      box-shadow:
        0 2px 12px rgba(0,0,0,0.35),
        0 0 0 0 var(--rc-color, #7c3aed);
      overflow: hidden;
      min-height: 44px;
    }
    .sr-rc::before {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: linear-gradient(135deg, var(--rc-color, #7c3aed) 0%, transparent 60%);
      opacity: 0.08;
      transition: opacity 0.15s;
    }
    .sr-rc:active {
      transform: scale(0.97);
      box-shadow:
        0 4px 24px rgba(0,0,0,0.4),
        0 0 12px var(--rc-color, #7c3aed);
    }
    .sr-rc:active::before { opacity: 0.18; }

    /* Locked card */
    .sr-rc.sr-locked {
      cursor: default;
      opacity: 0.52;
      filter: grayscale(0.4);
    }
    .sr-rc.sr-locked:active { transform: none; box-shadow: 0 2px 12px rgba(0,0,0,0.35); }

    /* ── Card top row ── */
    .sr-rc-top {
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }
    .sr-rc-flag {
      font-size: 2rem;
      line-height: 1;
      flex-shrink: 0;
    }
    .sr-rc-meta {
      flex: 1;
      min-width: 0;
    }
    .sr-rc-name {
      font-size: clamp(1rem, 4vw, 1.15rem);
      font-weight: 800;
      color: #f0e6d3;
      margin: 0 0 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sr-rc-location {
      font-size: 0.75rem;
      color: rgba(240,230,211,0.55);
      margin: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Distance + terrain badge row */
    .sr-rc-badges {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .sr-rc-badge {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .sr-rc-badge-dist {
      background: rgba(255,107,43,0.18);
      color: #ff6b2b;
      border: 1px solid rgba(255,107,43,0.35);
    }
    .sr-rc-badge-terrain {
      background: rgba(6,214,160,0.14);
      color: #06d6a0;
      border: 1px solid rgba(6,214,160,0.3);
    }
    .sr-rc-badge-weather {
      background: rgba(167,139,250,0.14);
      color: #a78bfa;
      border: 1px solid rgba(167,139,250,0.28);
    }

    /* Best time row */
    .sr-rc-besttime {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.78rem;
      font-weight: 700;
      color: #06d6a0;
      padding: 5px 10px;
      background: rgba(6,214,160,0.1);
      border-radius: 8px;
      border: 1px solid rgba(6,214,160,0.25);
    }
    .sr-rc-besttime-label {
      color: rgba(6,214,160,0.65);
      font-weight: 600;
    }

    /* Lock overlay */
    .sr-rc-lock {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border-radius: 8px;
      background: rgba(20,10,30,0.55);
      border: 1px solid rgba(255,255,255,0.12);
      font-size: 0.72rem;
      color: rgba(240,230,211,0.6);
      font-weight: 600;
    }
    .sr-rc-lock-icon {
      font-size: 0.95rem;
    }

    /* Competitors pill */
    .sr-rc-comps {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 0.7rem;
      color: rgba(240,230,211,0.45);
      font-weight: 600;
      letter-spacing: 0.03em;
      margin-left: auto;
    }

    /* Env colour bar at bottom of card */
    .sr-rc-envbar {
      height: 3px;
      border-radius: 0 0 14px 14px;
      position: absolute;
      bottom: 0; left: 0; right: 0;
      background: linear-gradient(90deg,
        var(--rc-ground), var(--rc-accent), var(--rc-sky)
      );
      opacity: 0.7;
    }

    /* ── Empty state ── */
    .sr-rs-empty {
      text-align: center;
      color: rgba(167,139,250,0.5);
      padding: 60px 20px;
      font-size: 0.9rem;
    }
  `;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COUNTRY_FLAGS: Record<string, string> = {
  'UK':                      '🇬🇧',
  'USA':                     '🇺🇸',
  'Japan':                   '🇯🇵',
  'France / Italy / Switzerland': '🏔️',
};

const TERRAIN_ICONS: Record<string, string> = {
  urban:    '🏙️',
  trail:    '🌿',
  mountain: '⛰️',
  desert:   '🏜️',
  coastal:  '🌊',
  park:     '🌳',
};

const WEATHER_ICONS: Record<string, string> = {
  clear:    '☀️',
  overcast: '☁️',
  rain:     '🌧️',
  fog:      '🌫️',
  snow:     '❄️',
  hot:      '🔥',
};

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function buildUnlockText(
  race: RaceDefinition,
  allRaces: RaceDefinition[],
): string {
  if (!race.unlockRequirement) return '';
  const { raceId, maxPosition } = race.unlockRequirement;
  const req = allRaces.find((r) => r.id === raceId);
  const raceName = req?.name ?? raceId;
  const ordinal = ['1st', '2nd', '3rd', '4th', '5th', '6th'][maxPosition - 1] ?? `${maxPosition}th`;
  return `Finish ${raceName} in ${ordinal} place or better`;
}

function buildCard(
  race: RaceDefinition,
  allRaces: RaceDefinition[],
  isUnlocked: boolean,
  bestTime: number | undefined,
  onSelect: (id: string) => void,
): HTMLDivElement {
  const card = document.createElement('div');
  card.className = `sr-rc${isUnlocked ? '' : ' sr-locked'}`;

  // CSS custom properties for per-race theming
  card.style.setProperty('--rc-color',   race.trackColor);
  card.style.setProperty('--rc-ground',  race.envColors.ground);
  card.style.setProperty('--rc-accent',  race.envColors.accent);
  card.style.setProperty('--rc-sky',     race.envColors.sky);

  // Top row
  const top = document.createElement('div');
  top.className = 'sr-rc-top';

  const flag = document.createElement('div');
  flag.className = 'sr-rc-flag';
  flag.textContent = COUNTRY_FLAGS[race.country] ?? '🏁';
  top.appendChild(flag);

  const meta = document.createElement('div');
  meta.className = 'sr-rc-meta';

  const name = document.createElement('h3');
  name.className = 'sr-rc-name';
  name.textContent = race.name;
  meta.appendChild(name);

  const loc = document.createElement('p');
  loc.className = 'sr-rc-location';
  loc.textContent = race.location;
  meta.appendChild(loc);

  top.appendChild(meta);

  const comps = document.createElement('div');
  comps.className = 'sr-rc-comps';
  comps.innerHTML = `<span>👟</span><span>${race.competitors + 1}</span>`;
  top.appendChild(comps);

  card.appendChild(top);

  // Badges row
  const badges = document.createElement('div');
  badges.className = 'sr-rc-badges';

  const distBadge = document.createElement('div');
  distBadge.className = 'sr-rc-badge sr-rc-badge-dist';
  distBadge.textContent = race.distanceLabel;
  badges.appendChild(distBadge);

  const terrainBadge = document.createElement('div');
  terrainBadge.className = 'sr-rc-badge sr-rc-badge-terrain';
  terrainBadge.textContent = `${TERRAIN_ICONS[race.terrainType] ?? ''} ${race.terrainType}`;
  badges.appendChild(terrainBadge);

  const weatherBadge = document.createElement('div');
  weatherBadge.className = 'sr-rc-badge sr-rc-badge-weather';
  weatherBadge.textContent = `${WEATHER_ICONS[race.weather] ?? ''} ${race.weather}`;
  badges.appendChild(weatherBadge);

  card.appendChild(badges);

  // Best time
  if (bestTime !== undefined) {
    const bt = document.createElement('div');
    bt.className = 'sr-rc-besttime';
    bt.innerHTML = `<span class="sr-rc-besttime-label">Best</span><span>${formatTime(bestTime)}</span>`;
    card.appendChild(bt);
  }

  // Lock indicator
  if (!isUnlocked) {
    const lockRow = document.createElement('div');
    lockRow.className = 'sr-rc-lock';
    lockRow.innerHTML = `<span class="sr-rc-lock-icon">🔒</span><span>${buildUnlockText(race, allRaces)}</span>`;
    card.appendChild(lockRow);
  }

  // Env colour bar
  const envBar = document.createElement('div');
  envBar.className = 'sr-rc-envbar';
  card.appendChild(envBar);

  // Touch handler — only for unlocked races
  if (isUnlocked) {
    card.addEventListener('click', () => onSelect(race.id));
  }

  return card;
}

// ─── Class ────────────────────────────────────────────────────────────────────

export class RaceSelectScreen {
  private readonly container: HTMLElement;
  private overlay: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.container = container;
    injectStyles();
    this.overlay = document.createElement('div');
    this.overlay.className = 'sr-rs-overlay';
    this.container.appendChild(this.overlay);
  }

  show(
    races: RaceDefinition[],
    unlockedRaces: string[],
    bestTimes: Map<string, number>,
    onSelect: (raceId: string) => void,
    onBack: () => void,
  ): void {
    // Rebuild content each call
    this.overlay.innerHTML = '';

    // Background mesh
    const mesh = document.createElement('div');
    mesh.className = 'sr-rs-mesh';
    this.overlay.appendChild(mesh);

    // Header
    const header = document.createElement('header');
    header.className = 'sr-rs-header';

    const backBtn = document.createElement('button');
    backBtn.className = 'sr-rs-back';
    backBtn.setAttribute('type', 'button');
    backBtn.setAttribute('aria-label', 'Back to menu');
    backBtn.innerHTML = '&#8592;';
    backBtn.addEventListener('click', onBack, { once: true });
    header.appendChild(backBtn);

    const title = document.createElement('h2');
    title.className = 'sr-rs-title';
    title.textContent = 'Select Race';
    header.appendChild(title);

    const countEl = document.createElement('span');
    countEl.className = 'sr-rs-race-count';
    const unlockedCount = races.filter((r) => unlockedRaces.includes(r.id)).length;
    countEl.textContent = `${unlockedCount} / ${races.length} unlocked`;
    header.appendChild(countEl);

    this.overlay.appendChild(header);

    // Scroll area
    const scroll = document.createElement('div');
    scroll.className = 'sr-rs-scroll';

    const grid = document.createElement('div');
    grid.className = 'sr-rs-grid';

    if (races.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'sr-rs-empty';
      empty.textContent = 'No races available.';
      grid.appendChild(empty);
    } else {
      for (const race of races) {
        const isUnlocked = unlockedRaces.includes(race.id);
        const bestTime = bestTimes.get(race.id);
        const card = buildCard(race, races, isUnlocked, bestTime, onSelect);
        grid.appendChild(card);
      }
    }

    scroll.appendChild(grid);
    this.overlay.appendChild(scroll);

    requestAnimationFrame(() => {
      this.overlay.classList.add('sr-visible');
    });
  }

  hide(): void {
    this.overlay.classList.remove('sr-visible');
  }

  dispose(): void {
    this.overlay.remove();
  }
}
