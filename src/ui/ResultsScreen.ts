/**
 * ResultsScreen.ts
 *
 * Post-race results overlay for SheepRunner.
 * Celebrates top-3 finishes with CSS confetti and announces new unlocks.
 */

// ─── Style injection ──────────────────────────────────────────────────────────

const STYLE_ID = 'sr-results-styles';

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const css = `
    /* ── Overlay ── */
    .sr-res-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.5s ease;
      overflow: hidden;
      z-index: 10;
      background:
        radial-gradient(ellipse 80% 40% at 50% 100%, #0f3d20 0%, transparent 65%),
        linear-gradient(168deg, #0d0520 0%, #1a0a2e 25%, #2d1b69 55%, #4c1d95 80%, #2d1b69 100%);
    }
    .sr-res-overlay.sr-visible {
      opacity: 1;
      pointer-events: auto;
    }

    /* ── Confetti canvas ── */
    .sr-confetti-wrap {
      position: absolute;
      inset: 0;
      pointer-events: none;
      overflow: hidden;
    }
    .sr-confetti-piece {
      position: absolute;
      top: -20px;
      width: var(--w, 10px);
      height: var(--h, 14px);
      border-radius: var(--r, 3px);
      background: var(--color, #ff6b2b);
      opacity: 0.9;
      animation:
        srConfettiFall   var(--fall-dur, 3s) linear var(--fall-delay, 0s) both,
        srConfettiSpin   var(--spin-dur, 0.8s) ease-in-out infinite var(--fall-delay, 0s),
        srConfettiSway   var(--sway-dur, 2.1s) ease-in-out infinite var(--sway-phase, 0s) alternate;
    }
    @keyframes srConfettiFall {
      0%   { transform: translateY(0)   rotate(0deg);   opacity: 0.9; }
      90%  { opacity: 0.8; }
      100% { transform: translateY(115vh) rotate(720deg); opacity: 0;   }
    }
    @keyframes srConfettiSpin {
      0%,100% { transform: rotateX(0deg)   rotateZ(0deg);   }
      50%      { transform: rotateX(180deg) rotateZ(90deg);  }
    }
    @keyframes srConfettiSway {
      0%   { margin-left: calc(var(--sway, 60px) * -0.5); }
      100% { margin-left: calc(var(--sway, 60px) *  0.5); }
    }

    /* ── Scroll container ── */
    .sr-res-scroll {
      position: relative;
      z-index: 2;
      width: 100%;
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
    }
    .sr-res-scroll::-webkit-scrollbar { width: 4px; }
    .sr-res-scroll::-webkit-scrollbar-track { background: transparent; }
    .sr-res-scroll::-webkit-scrollbar-thumb { background: rgba(124,58,237,0.4); border-radius: 2px; }

    /* ── Inner content card ── */
    .sr-res-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
      padding: max(24px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom));
      max-width: 480px;
      margin: 0 auto;
    }

    /* ── Race name banner ── */
    .sr-res-race-name {
      font-size: clamp(0.7rem, 3vw, 0.85rem);
      font-weight: 700;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: rgba(167,139,250,0.7);
      background: rgba(20,10,30,0.5);
      border: 1px solid rgba(124,58,237,0.25);
      border-radius: 20px;
      padding: 5px 18px;
    }

    /* ── Trophy / Position ── */
    .sr-res-podium {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .sr-res-medal {
      font-size: clamp(4rem, 18vw, 6.5rem);
      line-height: 1;
      animation: srMedalPop 0.7s cubic-bezier(0.34,1.56,0.64,1) both;
      filter: drop-shadow(0 0 20px rgba(255,200,50,0.5));
    }
    @keyframes srMedalPop {
      0%   { transform: scale(0) rotate(-15deg); opacity: 0; }
      100% { transform: scale(1) rotate(0deg);   opacity: 1; }
    }
    .sr-res-position-text {
      font-size: clamp(1.8rem, 8vw, 2.6rem);
      font-weight: 900;
      letter-spacing: 0.02em;
      color: #ffffff;
      text-shadow: 0 0 24px rgba(255,107,43,0.45), 0 2px 8px rgba(0,0,0,0.8);
    }
    .sr-res-position-sub {
      font-size: 0.82rem;
      font-weight: 600;
      color: rgba(240,230,211,0.5);
    }

    /* ── Time display ── */
    .sr-res-time-block {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 18px 32px;
      background: rgba(20,10,30,0.7);
      border: 1.5px solid rgba(124,58,237,0.3);
      border-radius: 16px;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      width: 100%;
    }
    .sr-res-time-label {
      font-size: 0.62rem;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: rgba(167,139,250,0.65);
    }
    .sr-res-time-value {
      font-size: clamp(2rem, 9vw, 3rem);
      font-weight: 900;
      font-variant-numeric: tabular-nums;
      color: #a78bfa;
      text-shadow: 0 0 16px rgba(124,58,237,0.5), 0 2px 6px rgba(0,0,0,0.8);
      letter-spacing: 0.04em;
    }
    .sr-res-new-best {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.78rem;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #06d6a0;
      animation: srNewBestPulse 1s ease-in-out infinite;
    }
    @keyframes srNewBestPulse {
      0%,100% { opacity: 1;   transform: scale(1);    filter: brightness(1);   }
      50%      { opacity: 0.8; transform: scale(1.04); filter: brightness(1.3); }
    }
    .sr-res-prev-best {
      font-size: 0.7rem;
      color: rgba(240,230,211,0.4);
    }

    /* ── Stats grid ── */
    .sr-res-stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      width: 100%;
    }
    .sr-res-stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 12px 10px;
      background: rgba(20,10,30,0.65);
      border: 1.5px solid rgba(255,255,255,0.08);
      border-radius: 12px;
    }
    .sr-res-stat-icon { font-size: 1.3rem; }
    .sr-res-stat-value {
      font-size: 1.25rem;
      font-weight: 900;
      color: #f0e6d3;
    }
    .sr-res-stat-label {
      font-size: 0.6rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: rgba(240,230,211,0.45);
      text-align: center;
    }

    /* ── Unlock announcements ── */
    .sr-res-unlocks {
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 100%;
    }
    .sr-res-unlocks-title {
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: rgba(6,214,160,0.7);
      text-align: center;
    }
    .sr-res-unlock-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-radius: 12px;
      background: rgba(6,214,160,0.08);
      border: 1.5px solid rgba(6,214,160,0.3);
      animation: srUnlockFanfare 0.6s cubic-bezier(0.34,1.56,0.64,1) both;
      animation-delay: var(--unlock-delay, 0s);
    }
    @keyframes srUnlockFanfare {
      0%   { transform: translateX(-30px) scale(0.9); opacity: 0; }
      100% { transform: translateX(0)     scale(1);   opacity: 1; }
    }
    .sr-res-unlock-star {
      font-size: 1.5rem;
      animation: srStarSpin 1.2s ease-in-out infinite;
    }
    @keyframes srStarSpin {
      0%,100% { transform: rotate(0deg)   scale(1);    }
      50%      { transform: rotate(20deg)  scale(1.15); }
    }
    .sr-res-unlock-text {
      flex: 1;
      font-size: 0.85rem;
      font-weight: 700;
      color: #06d6a0;
    }
    .sr-res-unlock-sub {
      font-size: 0.68rem;
      font-weight: 600;
      color: rgba(6,214,160,0.6);
    }

    /* ── Buttons ── */
    .sr-res-buttons {
      display: flex;
      flex-direction: column;
      gap: 12px;
      width: 100%;
    }
    .sr-res-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      min-height: 56px;
      padding: 0 24px;
      border: none;
      border-radius: 14px;
      font-family: inherit;
      font-weight: 800;
      font-size: 1.05rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      cursor: pointer;
      pointer-events: auto;
      transition: transform 0.14s ease, filter 0.14s ease;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }
    .sr-res-btn:active { transform: scale(0.95); }

    .sr-res-btn-continue {
      background: linear-gradient(135deg, #ff6b2b 0%, #c94d15 100%);
      color: white;
      box-shadow: 0 4px 20px rgba(255,107,43,0.4), 0 2px 0 #a83b0e, inset 0 1px 0 rgba(255,255,255,0.2);
    }
    .sr-res-btn-continue:hover { filter: brightness(1.1); transform: translateY(-2px); }

    .sr-res-btn-retry {
      background: rgba(124,58,237,0.18);
      color: #a78bfa;
      border: 2px solid rgba(124,58,237,0.4);
      box-shadow: 0 2px 10px rgba(124,58,237,0.15);
    }
    .sr-res-btn-retry:hover { background: rgba(124,58,237,0.3); transform: translateY(-1px); }
  `;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RaceResult {
  position: number;
  totalRunners: number;
  time: number;
  raceId: string;
  raceName: string;
  collectiblesGathered: number;
  bonked: boolean;
  newUnlocks: string[];
  bestTime: number | null;
  isNewBest: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ms}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ms}`;
}

function positionMedal(position: number): string {
  if (position === 1) return '🥇';
  if (position === 2) return '🥈';
  if (position === 3) return '🥉';
  return '🏅';
}

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

const CONFETTI_COLORS = [
  '#ff6b2b', '#ffa94d', '#ffd166',
  '#06d6a0', '#4ade80',
  '#7c3aed', '#a78bfa',
  '#38bdf8', '#ffffff',
];

function spawnConfetti(container: HTMLDivElement): void {
  const wrap = document.createElement('div');
  wrap.className = 'sr-confetti-wrap';

  for (let i = 0; i < 80; i++) {
    const p = document.createElement('div');
    p.className = 'sr-confetti-piece';
    const isCircle = Math.random() < 0.25;
    const w = 6 + Math.random() * 10;
    const h = isCircle ? w : 8 + Math.random() * 14;
    p.style.cssText = [
      `left:${(Math.random() * 100).toFixed(1)}%`,
      `--w:${w.toFixed(1)}px`,
      `--h:${h.toFixed(1)}px`,
      `--r:${isCircle ? '50%' : `${(2 + Math.random() * 4).toFixed(0)}px`}`,
      `--color:${CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]}`,
      `--fall-dur:${(2.5 + Math.random() * 3).toFixed(1)}s`,
      `--fall-delay:${(Math.random() * 2).toFixed(2)}s`,
      `--spin-dur:${(0.5 + Math.random() * 1.2).toFixed(2)}s`,
      `--sway-dur:${(1.5 + Math.random() * 1.5).toFixed(1)}s`,
      `--sway-phase:${(Math.random() * -2).toFixed(2)}s`,
      `--sway:${(40 + Math.random() * 80).toFixed(0)}px`,
    ].join(';');
    wrap.appendChild(p);
  }

  container.appendChild(wrap);
}

// ─── Class ────────────────────────────────────────────────────────────────────

export class ResultsScreen {
  private readonly container: HTMLElement;
  private overlay: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.container = container;
    injectStyles();
    this.overlay = document.createElement('div');
    this.overlay.className = 'sr-res-overlay';
    this.container.appendChild(this.overlay);
  }

  show(
    result: RaceResult,
    onContinue: () => void,
    onRetry: () => void,
  ): void {
    this.overlay.innerHTML = '';

    const isTopThree = result.position <= 3;

    // Confetti for podium finish
    if (isTopThree) {
      spawnConfetti(this.overlay);
    }

    const scroll = document.createElement('div');
    scroll.className = 'sr-res-scroll';

    const card = document.createElement('div');
    card.className = 'sr-res-card';

    // Race name banner
    const raceBanner = document.createElement('div');
    raceBanner.className = 'sr-res-race-name';
    raceBanner.textContent = result.raceName;
    card.appendChild(raceBanner);

    // Podium / position
    const podium = document.createElement('div');
    podium.className = 'sr-res-podium';

    const medal = document.createElement('div');
    medal.className = 'sr-res-medal';
    medal.textContent = positionMedal(result.position);
    podium.appendChild(medal);

    const posText = document.createElement('div');
    posText.className = 'sr-res-position-text';
    posText.textContent = ordinal(result.position) + ' Place';
    podium.appendChild(posText);

    const posSub = document.createElement('div');
    posSub.className = 'sr-res-position-sub';
    posSub.textContent = `out of ${result.totalRunners} runners`;
    podium.appendChild(posSub);

    card.appendChild(podium);

    // Time block
    const timeBlock = document.createElement('div');
    timeBlock.className = 'sr-res-time-block';

    const timeLabel = document.createElement('div');
    timeLabel.className = 'sr-res-time-label';
    timeLabel.textContent = 'Finish Time';
    timeBlock.appendChild(timeLabel);

    const timeVal = document.createElement('div');
    timeVal.className = 'sr-res-time-value';
    timeVal.textContent = formatTime(result.time);
    timeBlock.appendChild(timeVal);

    if (result.isNewBest) {
      const newBest = document.createElement('div');
      newBest.className = 'sr-res-new-best';
      newBest.innerHTML = '&#9733; NEW BEST &#9733;';
      timeBlock.appendChild(newBest);
    } else if (result.bestTime !== null) {
      const prevBest = document.createElement('div');
      prevBest.className = 'sr-res-prev-best';
      prevBest.textContent = `Personal best: ${formatTime(result.bestTime)}`;
      timeBlock.appendChild(prevBest);
    }

    card.appendChild(timeBlock);

    // Stats
    const stats = document.createElement('div');
    stats.className = 'sr-res-stats';

    const statDefs: Array<{ icon: string; value: string | number; label: string }> = [
      { icon: '✨', value: result.collectiblesGathered, label: 'Collectibles' },
      { icon: result.bonked ? '💥' : '✅', value: result.bonked ? 'Yes' : 'No', label: 'Bonked' },
      { icon: '🏁', value: `${result.position}/${result.totalRunners}`, label: 'Position' },
      { icon: '⏱️', value: formatTime(result.time), label: 'Race Time' },
    ];

    for (const def of statDefs) {
      const stat = document.createElement('div');
      stat.className = 'sr-res-stat';

      const icon = document.createElement('div');
      icon.className = 'sr-res-stat-icon';
      icon.textContent = String(def.icon);

      const val = document.createElement('div');
      val.className = 'sr-res-stat-value';
      val.textContent = String(def.value);

      const lbl = document.createElement('div');
      lbl.className = 'sr-res-stat-label';
      lbl.textContent = def.label;

      stat.appendChild(icon);
      stat.appendChild(val);
      stat.appendChild(lbl);
      stats.appendChild(stat);
    }

    card.appendChild(stats);

    // New unlocks
    if (result.newUnlocks.length > 0) {
      const unlockSection = document.createElement('div');
      unlockSection.className = 'sr-res-unlocks';

      const unlockTitle = document.createElement('div');
      unlockTitle.className = 'sr-res-unlocks-title';
      unlockTitle.textContent = '🔓 New Races Unlocked!';
      unlockSection.appendChild(unlockTitle);

      result.newUnlocks.forEach((unlockId, idx) => {
        const item = document.createElement('div');
        item.className = 'sr-res-unlock-item';
        item.style.setProperty('--unlock-delay', `${0.15 + idx * 0.12}s`);

        const star = document.createElement('div');
        star.className = 'sr-res-unlock-star';
        star.textContent = '⭐';

        const textWrap = document.createElement('div');
        const mainText = document.createElement('div');
        mainText.className = 'sr-res-unlock-text';
        mainText.textContent = unlockId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        const subText = document.createElement('div');
        subText.className = 'sr-res-unlock-sub';
        subText.textContent = 'Now available in race select';
        textWrap.appendChild(mainText);
        textWrap.appendChild(subText);

        item.appendChild(star);
        item.appendChild(textWrap);
        unlockSection.appendChild(item);
      });

      card.appendChild(unlockSection);
    }

    // Buttons
    const btns = document.createElement('div');
    btns.className = 'sr-res-buttons';

    const continueBtn = document.createElement('button');
    continueBtn.className = 'sr-res-btn sr-res-btn-continue';
    continueBtn.setAttribute('type', 'button');
    continueBtn.innerHTML = '&#9654; Continue';
    continueBtn.addEventListener('click', onContinue, { once: true });

    const retryBtn = document.createElement('button');
    retryBtn.className = 'sr-res-btn sr-res-btn-retry';
    retryBtn.setAttribute('type', 'button');
    retryBtn.innerHTML = '&#8635; Retry Race';
    retryBtn.addEventListener('click', onRetry, { once: true });

    btns.appendChild(continueBtn);
    btns.appendChild(retryBtn);
    card.appendChild(btns);

    scroll.appendChild(card);
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
