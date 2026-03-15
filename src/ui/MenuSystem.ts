/**
 * MenuSystem.ts
 *
 * Main menu overlay for SheepRunner. Rendered as an HTML layer above the
 * Three.js canvas. Creates its own DOM subtree and manages its own lifecycle.
 */

// ─── Colour tokens ────────────────────────────────────────────────────────────
const C = {
  bgPanel:      'rgba(20, 10, 30, 0.88)',
  orange:       '#ff6b2b',
  orangeGlow:   '#ff6b2b66',
  orangeDark:   '#c94d15',
  purple:       '#7c3aed',
  purpleLight:  '#a78bfa',
  purpleDark:   '#4c1d95',
  green:        '#06d6a0',
  greenGlow:    '#06d6a044',
  cream:        '#f0e6d3',
  white:        '#ffffff',
  textMuted:    'rgba(240, 230, 211, 0.55)',
} as const;

// ─── Inline CSS injected once per document ────────────────────────────────────
const STYLE_ID = 'sr-menu-styles';

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const css = `
    /* ── Menu overlay root ── */
    .sr-menu-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.45s ease;
      overflow: hidden;
      z-index: 10;
    }
    .sr-menu-overlay.sr-visible {
      opacity: 1;
      pointer-events: auto;
    }

    /* ── Splash art background ── */
    .sr-menu-bg {
      position: absolute;
      inset: 0;
      background: url('/textures/splash.jpg') center center / cover no-repeat;
      animation: srMenuBgZoom 20s ease-in-out infinite alternate;
    }
    @keyframes srMenuBgZoom {
      0%   { transform: scale(1);    }
      100% { transform: scale(1.05); }
    }
    /* Dark overlay for readability */
    .sr-menu-bg::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(
        to bottom,
        rgba(10,10,26,0.3) 0%,
        rgba(10,10,26,0.1) 30%,
        rgba(10,10,26,0.4) 60%,
        rgba(10,10,26,0.85) 85%,
        rgba(10,10,26,0.95) 100%
      );
    }

    /* ── Floating particles ── */
    .sr-particles {
      position: absolute;
      inset: 0;
      pointer-events: none;
      overflow: hidden;
    }
    .sr-particle {
      position: absolute;
      border-radius: 50%;
      opacity: 0;
      animation: srParticleFloat var(--dur, 8s) ease-in-out infinite var(--delay, 0s);
    }
    @keyframes srParticleFloat {
      0%   { transform: translateY(100vh) scale(0.5); opacity: 0;   }
      15%  { opacity: var(--peak, 0.6); }
      85%  { opacity: var(--peak, 0.6); }
      100% { transform: translateY(-20vh) scale(1.2); opacity: 0;   }
    }

    /* ── Hills silhouette ── */
    .sr-menu-hills {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 36%;
      pointer-events: none;
    }
    .sr-menu-hills svg {
      width: 100%;
      height: 100%;
    }

    /* ── Stars ── */
    .sr-menu-stars {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .sr-menu-star {
      position: absolute;
      border-radius: 50%;
      background: white;
      animation: srStarTwinkle var(--dur, 3s) ease-in-out infinite var(--delay, 0s);
      opacity: 0;
    }
    @keyframes srStarTwinkle {
      0%, 100% { opacity: 0;                    transform: scale(0.8); }
      50%       { opacity: var(--bright, 0.7);  transform: scale(1.2); }
    }

    /* ── Content card ── */
    .sr-menu-card {
      position: relative;
      z-index: 5;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 36px;
      padding: 48px 32px 56px;
      width: min(440px, 90vw);
    }

    /* ── Title block ── */
    .sr-menu-title-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }
    .sr-menu-title {
      font-size: clamp(3rem, 12vw, 5.5rem);
      font-weight: 900;
      letter-spacing: -0.01em;
      line-height: 1;
      text-align: center;
      margin: 0;
      background: linear-gradient(135deg,
        #ffffff    0%,
        #ffd166   28%,
        #ff6b2b   52%,
        #a78bfa   78%,
        #06d6a0  100%
      );
      background-size: 200% 200%;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      filter: drop-shadow(0 0 28px #ff6b2b66) drop-shadow(0 2px 6px #00000088);
      animation: srTitleGradShift 6s ease-in-out infinite alternate,
                 srTitleFloat 5s ease-in-out infinite;
    }
    @keyframes srTitleGradShift {
      0%   { background-position: 0%   50%; }
      100% { background-position: 100% 50%; }
    }
    @keyframes srTitleFloat {
      0%, 100% { transform: translateY(0);   }
      50%       { transform: translateY(-7px); }
    }
    .sr-menu-subtitle {
      font-size: clamp(0.7rem, 3vw, 0.9rem);
      font-weight: 600;
      letter-spacing: 0.38em;
      text-transform: uppercase;
      color: ${C.purpleLight};
      opacity: 0.85;
      margin: 0;
    }

    /* ── Sheep silhouette ── */
    .sr-sheep-scene {
      position: relative;
      width: 130px;
      height: 86px;
      animation: srSheepBounce 0.55s ease-in-out infinite;
      flex-shrink: 0;
    }
    @keyframes srSheepBounce {
      0%, 100% { transform: translateY(0);   }
      28%       { transform: translateY(-8px); }
      72%       { transform: translateY(-4px); }
    }
    .sr-sheep-body {
      position: absolute;
      top: 12px; left: 16px;
      width: 76px; height: 46px;
      background: #f0f0f8;
      border-radius: 50% 50% 45% 45%;
      box-shadow:
        -13px -6px 0 7px #f0f0f8,
         13px -9px 0 5px #f0f0f8,
         0px -15px  0 9px #f0f0f8,
        -21px  2px  0 3px #e0e0ee,
         21px  2px  0 3px #e0e0ee,
        inset 0 -5px 10px rgba(100,70,160,0.14);
    }
    .sr-sheep-head {
      position: absolute;
      top: 5px; left: 72px;
      width: 32px; height: 27px;
      background: #e4e4f0;
      border-radius: 40% 52% 52% 38%;
      box-shadow: inset 0 -2px 5px rgba(80,60,120,0.12);
    }
    .sr-sheep-head::before {
      content: '';
      position: absolute;
      top: 9px; right: 6px;
      width: 5px; height: 5px;
      background: #2d1b69;
      border-radius: 50%;
      box-shadow: 0 0 0 1.5px white;
    }
    .sr-sheep-head::after {
      content: '';
      position: absolute;
      top: -5px; left: 4px;
      width: 11px; height: 9px;
      background: #f4a261;
      border-radius: 50% 50% 40% 40%;
      transform: rotate(-15deg);
    }
    .sr-sheep-tail {
      position: absolute;
      top: 20px; left: 7px;
      width: 17px; height: 15px;
      background: #f0f0f8;
      border-radius: 50%;
      animation: srTailWag 0.55s ease-in-out infinite;
    }
    @keyframes srTailWag {
      0%, 100% { transform: rotate(-12deg); }
      50%       { transform: rotate(16deg);  }
    }
    .sr-sheep-legs {
      position: absolute;
      top: 50px; left: 20px;
      width: 76px; height: 26px;
    }
    .sr-leg {
      position: absolute;
      bottom: 0;
      width: 8px;
      border-radius: 4px 4px 2px 2px;
      background: #c0c0d0;
      transform-origin: top center;
    }
    .sr-leg::after {
      content: '';
      position: absolute;
      bottom: 0; left: 50%;
      transform: translateX(-50%);
      width: 10px; height: 5px;
      background: #4c3a6a;
      border-radius: 3px 3px 2px 2px;
    }
    .sr-leg-fl { left: 8px;  height: 20px; animation: srLegFL 0.55s ease-in-out infinite; }
    .sr-leg-bl { left: 22px; height: 20px; animation: srLegBL 0.55s ease-in-out infinite; }
    .sr-leg-fr { left: 42px; height: 20px; animation: srLegFR 0.55s ease-in-out infinite; }
    .sr-leg-br { left: 56px; height: 20px; animation: srLegBR 0.55s ease-in-out infinite; }
    @keyframes srLegFL { 0%{transform:rotate(-25deg)}25%{transform:rotate(20deg)}50%{transform:rotate(-10deg)}75%{transform:rotate(15deg)}100%{transform:rotate(-25deg)} }
    @keyframes srLegBL { 0%{transform:rotate(20deg)} 25%{transform:rotate(-20deg)}50%{transform:rotate(15deg)} 75%{transform:rotate(-10deg)}100%{transform:rotate(20deg)}  }
    @keyframes srLegFR { 0%{transform:rotate(20deg)} 25%{transform:rotate(-25deg)}50%{transform:rotate(10deg)} 75%{transform:rotate(-15deg)}100%{transform:rotate(20deg)}  }
    @keyframes srLegBR { 0%{transform:rotate(-20deg)}25%{transform:rotate(25deg)} 50%{transform:rotate(-15deg)}75%{transform:rotate(20deg)} 100%{transform:rotate(-20deg)} }

    /* ── Buttons ── */
    .sr-menu-buttons {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 14px;
      width: 100%;
      max-width: 300px;
    }

    .sr-btn {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      min-height: 56px;
      padding: 0 28px;
      border: none;
      border-radius: 14px;
      font-family: inherit;
      font-weight: 800;
      font-size: 1.1rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      cursor: pointer;
      pointer-events: auto;
      transition:
        transform 0.15s ease,
        filter  0.15s ease,
        box-shadow 0.15s ease;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
      overflow: hidden;
    }
    .sr-btn::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: rgba(255,255,255,0);
      transition: background 0.15s ease;
    }
    .sr-btn:active::after { background: rgba(255,255,255,0.12); }
    .sr-btn:active { transform: scale(0.96); }

    /* Play button */
    .sr-btn-play {
      background: linear-gradient(135deg, ${C.orange} 0%, ${C.orangeDark} 100%);
      color: white;
      box-shadow:
        0 4px 20px ${C.orangeGlow},
        0 2px 0 #a83b0e,
        inset 0 1px 0 rgba(255,255,255,0.25);
    }
    .sr-btn-play:hover {
      filter: brightness(1.12);
      box-shadow:
        0 6px 30px ${C.orangeGlow},
        0 2px 0 #a83b0e,
        inset 0 1px 0 rgba(255,255,255,0.25);
      transform: translateY(-2px);
    }

    /* Settings button */
    .sr-btn-settings {
      background: rgba(124, 58, 237, 0.22);
      color: ${C.purpleLight};
      border: 2px solid rgba(124, 58, 237, 0.5);
      box-shadow: 0 2px 12px rgba(124,58,237,0.2);
    }
    .sr-btn-settings:hover {
      background: rgba(124, 58, 237, 0.35);
      border-color: ${C.purple};
      filter: brightness(1.1);
      transform: translateY(-1px);
    }

    /* Button icon */
    .sr-btn-icon {
      font-size: 1.3rem;
      line-height: 1;
      flex-shrink: 0;
    }

    /* ── Horizon glow ── */
    .sr-horizon-glow {
      position: absolute;
      bottom: 33%;
      left: 50%;
      transform: translateX(-50%);
      width: 380px;
      height: 90px;
      background: radial-gradient(ellipse, #ffa94d66 0%, transparent 70%);
      pointer-events: none;
      animation: srHorizonPulse 5s ease-in-out infinite;
    }
    @keyframes srHorizonPulse {
      0%, 100% { opacity: 0.55; transform: translateX(-50%) scaleX(1);    }
      50%       { opacity: 0.9;  transform: translateX(-50%) scaleX(1.15); }
    }

    /* ── Version badge ── */
    .sr-menu-version {
      position: absolute;
      bottom: max(10px, env(safe-area-inset-bottom));
      right: 14px;
      font-size: 0.62rem;
      color: rgba(255,255,255,0.2);
      letter-spacing: 0.1em;
      pointer-events: none;
    }
  `;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildStarField(): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'sr-menu-stars';
  for (let i = 0; i < 80; i++) {
    const s = document.createElement('div');
    s.className = 'sr-menu-star';
    const big = Math.random() < 0.12;
    s.style.cssText = [
      `top:${(Math.random() * 62).toFixed(1)}%`,
      `left:${(Math.random() * 100).toFixed(1)}%`,
      `width:${big ? 3 : 2}px`,
      `height:${big ? 3 : 2}px`,
      `--dur:${(2 + Math.random() * 4).toFixed(1)}s`,
      `--delay:${(Math.random() * 5).toFixed(2)}s`,
      `--bright:${(0.4 + Math.random() * 0.6).toFixed(2)}`,
    ].join(';');
    wrap.appendChild(s);
  }
  return wrap;
}

function buildParticles(): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'sr-particles';

  const configs = [
    { color: '#ff6b2b', size: 6,  peak: 0.5 },
    { color: '#7c3aed', size: 8,  peak: 0.4 },
    { color: '#06d6a0', size: 5,  peak: 0.55 },
    { color: '#ffa94d', size: 10, peak: 0.3 },
    { color: '#a78bfa', size: 7,  peak: 0.45 },
    { color: '#ff6b2b', size: 4,  peak: 0.6 },
    { color: '#06d6a0', size: 9,  peak: 0.35 },
    { color: '#7c3aed', size: 6,  peak: 0.5 },
    { color: '#ffa94d', size: 5,  peak: 0.55 },
    { color: '#ffffff', size: 3,  peak: 0.25 },
    { color: '#ff6b2b', size: 8,  peak: 0.4 },
    { color: '#06d6a0', size: 6,  peak: 0.5 },
  ];

  configs.forEach((cfg) => {
    const p = document.createElement('div');
    p.className = 'sr-particle';
    p.style.cssText = [
      `left:${(Math.random() * 100).toFixed(1)}%`,
      `width:${cfg.size}px`,
      `height:${cfg.size}px`,
      `background:${cfg.color}`,
      `--dur:${(7 + Math.random() * 10).toFixed(1)}s`,
      `--delay:${(Math.random() * 9).toFixed(2)}s`,
      `--peak:${cfg.peak}`,
    ].join(';');
    wrap.appendChild(p);
  });

  return wrap;
}

function buildHills(): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'sr-menu-hills';
  wrap.innerHTML = `
    <svg viewBox="0 0 1440 320" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
      <path d="M0,200 C120,140 240,100 360,120 C480,140 520,160 640,110
               C760,60 860,40 980,70 C1100,100 1200,130 1320,100 L1440,90 L1440,320 L0,320 Z"
            fill="#2d1b69" opacity="0.65"/>
      <path d="M0,260 C80,220 200,178 320,200 C440,222 500,242 620,200
               C740,158 840,148 960,173 C1080,198 1200,220 1320,194 L1440,184 L1440,320 L0,320 Z"
            fill="#4c1d95" opacity="0.75"/>
      <path d="M0,300 C100,268 220,248 340,264 C460,280 540,295 660,266
               C780,240 880,238 1000,259 C1120,280 1230,294 1360,273 L1440,264 L1440,320 L0,320 Z"
            fill="#14532d" opacity="0.88"/>
      <rect x="0" y="312" width="1440" height="8" fill="#0f3d20"/>
    </svg>
  `;
  return wrap;
}

function buildSheep(): HTMLDivElement {
  const scene = document.createElement('div');
  scene.className = 'sr-sheep-scene';
  scene.innerHTML = `
    <div class="sr-sheep-tail"></div>
    <div class="sr-sheep-body"></div>
    <div class="sr-sheep-head"></div>
    <div class="sr-sheep-legs">
      <div class="sr-leg sr-leg-fl"></div>
      <div class="sr-leg sr-leg-bl"></div>
      <div class="sr-leg sr-leg-fr"></div>
      <div class="sr-leg sr-leg-br"></div>
    </div>
  `;
  return scene;
}

function btn(label: string, icon: string, extraClass: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = `sr-btn ${extraClass}`;
  b.setAttribute('type', 'button');
  b.innerHTML = `<span class="sr-btn-icon">${icon}</span><span>${label}</span>`;
  return b;
}

// ─── Class ────────────────────────────────────────────────────────────────────

export class MenuSystem {
  private readonly container: HTMLElement;
  private overlay: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.container = container;
    injectStyles();
    this.overlay = this.buildOverlay();
    this.container.appendChild(this.overlay);
  }

  private buildOverlay(): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.className = 'sr-menu-overlay';

    // Background
    const bg = document.createElement('div');
    bg.className = 'sr-menu-bg';
    overlay.appendChild(bg);

    // Stars
    overlay.appendChild(buildStarField());

    // Particles
    overlay.appendChild(buildParticles());

    // Horizon glow
    const glow = document.createElement('div');
    glow.className = 'sr-horizon-glow';
    overlay.appendChild(glow);

    // Hills
    overlay.appendChild(buildHills());

    // Content card (assembled but buttons wired in show())
    const card = document.createElement('div');
    card.className = 'sr-menu-card';
    card.dataset['role'] = 'card';

    // Title
    const titleWrap = document.createElement('div');
    titleWrap.className = 'sr-menu-title-wrap';
    const h1 = document.createElement('h1');
    h1.className = 'sr-menu-title';
    h1.textContent = 'SHEEP RUNNER';
    const sub = document.createElement('p');
    sub.className = 'sr-menu-subtitle';
    sub.textContent = 'Run · Collect · Conquer';
    titleWrap.appendChild(h1);
    titleWrap.appendChild(sub);
    card.appendChild(titleWrap);

    // Sheep
    card.appendChild(buildSheep());

    // Buttons placeholder (replaced in show())
    const btnWrap = document.createElement('div');
    btnWrap.className = 'sr-menu-buttons';
    btnWrap.dataset['role'] = 'btnwrap';
    card.appendChild(btnWrap);

    overlay.appendChild(card);

    // Version
    const ver = document.createElement('span');
    ver.className = 'sr-menu-version';
    ver.textContent = 'v0.1.0';
    overlay.appendChild(ver);

    return overlay;
  }

  show(callbacks: { onPlay: () => void; onSettings: () => void }): void {
    // Wire up buttons fresh each call so callbacks don't stale-close
    const btnWrap = this.overlay.querySelector('[data-role="btnwrap"]') as HTMLDivElement;
    btnWrap.innerHTML = '';

    const playBtn = btn('Play', '🐑', 'sr-btn-play');
    playBtn.addEventListener('click', () => callbacks.onPlay(), { once: true });

    const settingsBtn = btn('Settings', '⚙', 'sr-btn-settings');
    settingsBtn.addEventListener('click', () => callbacks.onSettings(), { once: true });

    btnWrap.appendChild(playBtn);
    btnWrap.appendChild(settingsBtn);

    // Trigger transition on next frame so initial hidden state renders first
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
