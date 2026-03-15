/**
 * HUDManager.ts
 *
 * In-race heads-up display overlay for SheepRunner.
 * All elements are built programmatically and layered above the Three.js canvas.
 */

// ─── Style injection ──────────────────────────────────────────────────────────

const STYLE_ID = 'sr-hud-styles';

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const css = `
    /* ── HUD root ── */
    .sr-hud {
      position: absolute;
      inset: 0;
      pointer-events: none;
      display: none;
      font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
    }
    .sr-hud.sr-hud-visible { display: block; }

    /* ── Shared text shadow mixin ── */
    .sr-hud-shadow {
      text-shadow:
        0 1px 3px rgba(0,0,0,0.9),
        0 0 8px rgba(0,0,0,0.6);
    }

    /* ═══════════════════════════════════════
       TOP BAR
    ═══════════════════════════════════════ */
    .sr-hud-top {
      position: absolute;
      top: max(12px, env(safe-area-inset-top));
      left: 0; right: 0;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 0 14px;
      pointer-events: none;
    }

    /* Position indicator (top-left) */
    .sr-hud-position {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      background: rgba(20,10,30,0.72);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      border: 1.5px solid rgba(255,107,43,0.35);
      border-radius: 10px;
      padding: 7px 14px;
      min-width: 70px;
    }
    .sr-hud-pos-label {
      font-size: 0.58rem;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: rgba(255,107,43,0.75);
      margin-bottom: 1px;
    }
    .sr-hud-pos-value {
      font-size: 1.55rem;
      font-weight: 900;
      color: #ff6b2b;
      line-height: 1;
      text-shadow: 0 0 12px rgba(255,107,43,0.5), 0 1px 4px rgba(0,0,0,0.8);
    }
    .sr-hud-pos-total {
      font-size: 0.72rem;
      font-weight: 600;
      color: rgba(240,230,211,0.5);
    }

    /* Timer (top-center) */
    .sr-hud-timer-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      background: rgba(20,10,30,0.72);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      border: 1.5px solid rgba(124,58,237,0.3);
      border-radius: 10px;
      padding: 5px 16px;
    }
    .sr-hud-timer-label {
      font-size: 0.55rem;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: rgba(167,139,250,0.65);
    }
    .sr-hud-timer {
      font-size: 1.4rem;
      font-weight: 900;
      font-variant-numeric: tabular-nums;
      color: #a78bfa;
      letter-spacing: 0.04em;
      text-shadow: 0 0 10px rgba(124,58,237,0.4), 0 1px 4px rgba(0,0,0,0.8);
    }

    /* Distance progress (top-right) */
    .sr-hud-dist-wrap {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
      background: rgba(20,10,30,0.72);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      border: 1.5px solid rgba(6,214,160,0.3);
      border-radius: 10px;
      padding: 7px 12px;
      min-width: 70px;
    }
    .sr-hud-dist-label {
      font-size: 0.55rem;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: rgba(6,214,160,0.65);
    }
    .sr-hud-dist-text {
      font-size: 0.78rem;
      font-weight: 800;
      color: #06d6a0;
      font-variant-numeric: tabular-nums;
      text-shadow: 0 0 8px rgba(6,214,160,0.4), 0 1px 3px rgba(0,0,0,0.8);
    }
    .sr-hud-dist-bar-track {
      width: 80px;
      height: 5px;
      border-radius: 3px;
      background: rgba(6,214,160,0.15);
      overflow: hidden;
      border: 1px solid rgba(6,214,160,0.2);
    }
    .sr-hud-dist-bar-fill {
      height: 100%;
      border-radius: 3px;
      background: linear-gradient(90deg, #06d6a0, #4ade80);
      box-shadow: 0 0 6px rgba(6,214,160,0.5);
      transition: width 0.4s ease;
      width: 0%;
    }
    /* Marker dot */
    .sr-hud-dist-marker {
      position: relative;
      width: 80px;
      height: 8px;
    }
    .sr-hud-dist-marker-dot {
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #06d6a0;
      box-shadow: 0 0 6px #06d6a0;
      left: 0%;
      transition: left 0.4s ease;
    }

    /* ═══════════════════════════════════════
       BOTTOM BAR
    ═══════════════════════════════════════ */
    .sr-hud-bottom {
      position: absolute;
      bottom: max(16px, env(safe-area-inset-bottom));
      left: 0; right: 0;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding: 0 14px;
      pointer-events: none;
      gap: 12px;
    }

    /* Stamina bar (bottom-center) */
    .sr-hud-stamina-wrap {
      flex: 1;
      max-width: 280px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    .sr-hud-stamina-label {
      font-size: 0.62rem;
      font-weight: 700;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: rgba(240,230,211,0.55);
      text-shadow: 0 1px 3px rgba(0,0,0,0.8);
    }
    .sr-hud-stamina-track {
      width: 100%;
      height: 14px;
      border-radius: 7px;
      background: rgba(20,10,30,0.7);
      border: 1.5px solid rgba(255,255,255,0.12);
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    }
    .sr-hud-stamina-fill {
      height: 100%;
      border-radius: 7px;
      transition: width 0.25s ease, background 0.5s ease;
      width: 100%;
      background: linear-gradient(90deg, #06d6a0 0%, #4ade80 100%);
      box-shadow: 0 0 8px rgba(6,214,160,0.5);
    }
    .sr-hud-stamina-fill.sr-stamina-mid {
      background: linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%);
      box-shadow: 0 0 8px rgba(245,158,11,0.5);
    }
    .sr-hud-stamina-fill.sr-stamina-low {
      background: linear-gradient(90deg, #ef4444 0%, #f97316 100%);
      box-shadow: 0 0 10px rgba(239,68,68,0.6);
      animation: srStaminaPulse 0.6s ease-in-out infinite;
    }
    @keyframes srStaminaPulse {
      0%, 100% { box-shadow: 0 0 10px rgba(239,68,68,0.6); filter: brightness(1);   }
      50%       { box-shadow: 0 0 20px rgba(239,68,68,0.9); filter: brightness(1.2); }
    }

    /* Speed indicator (bottom-right) */
    .sr-hud-speed-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      background: rgba(20,10,30,0.72);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      border: 1.5px solid rgba(255,107,43,0.3);
      border-radius: 10px;
      padding: 7px 12px;
      min-width: 56px;
    }
    .sr-hud-speed-value {
      font-size: 1.4rem;
      font-weight: 900;
      color: #ff6b2b;
      font-variant-numeric: tabular-nums;
      line-height: 1;
      text-shadow: 0 0 10px rgba(255,107,43,0.5), 0 1px 4px rgba(0,0,0,0.8);
    }
    .sr-hud-speed-label {
      font-size: 0.52rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: rgba(255,107,43,0.6);
    }

    /* ═══════════════════════════════════════
       COUNTDOWN
    ═══════════════════════════════════════ */
    .sr-hud-countdown {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }
    .sr-hud-countdown-num {
      font-size: clamp(6rem, 24vw, 11rem);
      font-weight: 900;
      color: #ffffff;
      letter-spacing: -0.04em;
      text-shadow:
        0 0 40px #ff6b2b,
        0 0 80px rgba(255,107,43,0.4),
        0 4px 12px rgba(0,0,0,0.9);
      animation: srCountdownPop 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) both;
      will-change: transform, opacity;
    }
    @keyframes srCountdownPop {
      0%   { transform: scale(2.5); opacity: 0;    }
      40%  { opacity: 1; }
      100% { transform: scale(1);   opacity: 1;    }
    }

    .sr-hud-go {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }
    .sr-hud-go-text {
      font-size: clamp(5rem, 20vw, 9rem);
      font-weight: 900;
      letter-spacing: -0.02em;
      background: linear-gradient(135deg, #06d6a0 0%, #4ade80 50%, #ffffff 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      filter: drop-shadow(0 0 30px rgba(6,214,160,0.7)) drop-shadow(0 4px 10px rgba(0,0,0,0.9));
      animation: srGoAnim 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
      will-change: transform, opacity;
    }
    @keyframes srGoAnim {
      0%   { transform: scale(0.4) rotate(-8deg); opacity: 0;    }
      60%  { transform: scale(1.1) rotate(2deg);  opacity: 1;    }
      100% { transform: scale(1)   rotate(0deg);  opacity: 1;    }
    }

    /* ═══════════════════════════════════════
       BONK WARNING
    ═══════════════════════════════════════ */
    .sr-hud-bonk {
      position: absolute;
      inset: 0;
      pointer-events: none;
      border: 4px solid transparent;
      border-radius: 0;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }
    .sr-hud-bonk.sr-bonk-active {
      border-color: rgba(239,68,68,0.8);
      box-shadow: inset 0 0 40px rgba(239,68,68,0.35);
      animation: srBonkPulse 0.45s ease-in-out infinite;
    }
    @keyframes srBonkPulse {
      0%, 100% { border-color: rgba(239,68,68,0.8); box-shadow: inset 0 0 40px rgba(239,68,68,0.3); }
      50%       { border-color: rgba(239,68,68,1.0); box-shadow: inset 0 0 70px rgba(239,68,68,0.6); }
    }

    /* ═══════════════════════════════════════
       PICKUP NOTIFICATIONS
    ═══════════════════════════════════════ */
    .sr-hud-pickups {
      position: absolute;
      top: 50%;
      right: 16px;
      transform: translateY(-50%);
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
    }
    .sr-pickup-notif {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      border-radius: 10px;
      background: rgba(20,10,30,0.88);
      border-left: 3px solid var(--notif-color, #06d6a0);
      font-size: 0.82rem;
      font-weight: 700;
      color: #f0e6d3;
      text-shadow: 0 1px 3px rgba(0,0,0,0.8);
      box-shadow: 0 2px 12px rgba(0,0,0,0.5), 0 0 12px var(--notif-color, #06d6a0);
      animation: srPickupIn 2.2s ease forwards;
      white-space: nowrap;
      max-width: min(200px, 45vw);
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sr-pickup-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--notif-color, #06d6a0);
      flex-shrink: 0;
    }
    @keyframes srPickupIn {
      0%   { transform: translateX(120%); opacity: 0;   }
      12%  { transform: translateX(0);    opacity: 1;   }
      75%  { transform: translateX(0);    opacity: 1;   }
      100% { transform: translateX(20%);  opacity: 0;   }
    }
  `;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ordinalSuffix(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function formatTime(elapsed: number): string {
  const m = Math.floor(elapsed / 60);
  const s = Math.floor(elapsed % 60);
  const ms = Math.floor((elapsed % 1) * 10);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ms}`;
}

// ─── Class ────────────────────────────────────────────────────────────────────

export class HUDManager {
  private readonly container: HTMLElement;
  private hud!: HTMLDivElement;

  // Element refs
  private posValue!: HTMLSpanElement;
  private posTotal!: HTMLSpanElement;
  private timerEl!: HTMLSpanElement;
  private distText!: HTMLSpanElement;
  private distFill!: HTMLDivElement;
  private distMarkerDot!: HTMLDivElement;
  private staminaFill!: HTMLDivElement;
  private speedValue!: HTMLSpanElement;
  private countdownWrap!: HTMLDivElement;
  private goWrap!: HTMLDivElement;
  private bonkEl!: HTMLDivElement;
  private pickupsWrap!: HTMLDivElement;

  private goTimeout: ReturnType<typeof setTimeout> | null = null;
  private pickupCleanupTimers: ReturnType<typeof setTimeout>[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
    injectStyles();
    this.build();
  }

  private build(): void {
    const hud = document.createElement('div');
    hud.className = 'sr-hud';

    // ── Top bar ───────────────────────────────────
    const top = document.createElement('div');
    top.className = 'sr-hud-top';

    // Position (top-left)
    const posWrap = document.createElement('div');
    posWrap.className = 'sr-hud-position';
    const posLabel = document.createElement('div');
    posLabel.className = 'sr-hud-pos-label';
    posLabel.textContent = 'Position';
    this.posValue = document.createElement('span');
    this.posValue.className = 'sr-hud-pos-value';
    this.posValue.textContent = '1st';
    this.posTotal = document.createElement('span');
    this.posTotal.className = 'sr-hud-pos-total';
    this.posTotal.textContent = '/ 8';
    posWrap.appendChild(posLabel);
    posWrap.appendChild(this.posValue);
    posWrap.appendChild(this.posTotal);
    top.appendChild(posWrap);

    // Timer (top-center)
    const timerWrap = document.createElement('div');
    timerWrap.className = 'sr-hud-timer-wrap';
    const timerLabel = document.createElement('div');
    timerLabel.className = 'sr-hud-timer-label';
    timerLabel.textContent = 'Time';
    this.timerEl = document.createElement('span');
    this.timerEl.className = 'sr-hud-timer';
    this.timerEl.textContent = '00:00.0';
    timerWrap.appendChild(timerLabel);
    timerWrap.appendChild(this.timerEl);
    top.appendChild(timerWrap);

    // Distance (top-right)
    const distWrap = document.createElement('div');
    distWrap.className = 'sr-hud-dist-wrap';
    const distLabel = document.createElement('div');
    distLabel.className = 'sr-hud-dist-label';
    distLabel.textContent = 'Distance';
    this.distText = document.createElement('div');
    this.distText.className = 'sr-hud-dist-text';
    this.distText.textContent = '0 m';
    const distBarTrack = document.createElement('div');
    distBarTrack.className = 'sr-hud-dist-bar-track';
    this.distFill = document.createElement('div');
    this.distFill.className = 'sr-hud-dist-bar-fill';
    distBarTrack.appendChild(this.distFill);
    const markerWrap = document.createElement('div');
    markerWrap.className = 'sr-hud-dist-marker';
    this.distMarkerDot = document.createElement('div');
    this.distMarkerDot.className = 'sr-hud-dist-marker-dot';
    markerWrap.appendChild(this.distMarkerDot);
    distWrap.appendChild(distLabel);
    distWrap.appendChild(this.distText);
    distWrap.appendChild(distBarTrack);
    distWrap.appendChild(markerWrap);
    top.appendChild(distWrap);

    hud.appendChild(top);

    // ── Bottom bar ────────────────────────────────
    const bottom = document.createElement('div');
    bottom.className = 'sr-hud-bottom';

    // Stamina (bottom-center)
    const staminaWrap = document.createElement('div');
    staminaWrap.className = 'sr-hud-stamina-wrap';
    const staminaLabel = document.createElement('div');
    staminaLabel.className = 'sr-hud-stamina-label';
    staminaLabel.textContent = 'Stamina';
    const staminaTrack = document.createElement('div');
    staminaTrack.className = 'sr-hud-stamina-track';
    this.staminaFill = document.createElement('div');
    this.staminaFill.className = 'sr-hud-stamina-fill';
    staminaTrack.appendChild(this.staminaFill);
    staminaWrap.appendChild(staminaLabel);
    staminaWrap.appendChild(staminaTrack);
    bottom.appendChild(staminaWrap);

    // Speed (bottom-right)
    const speedWrap = document.createElement('div');
    speedWrap.className = 'sr-hud-speed-wrap';
    this.speedValue = document.createElement('div');
    this.speedValue.className = 'sr-hud-speed-value';
    this.speedValue.textContent = '0';
    const speedLabel = document.createElement('div');
    speedLabel.className = 'sr-hud-speed-label';
    speedLabel.textContent = 'm/s';
    speedWrap.appendChild(this.speedValue);
    speedWrap.appendChild(speedLabel);
    bottom.appendChild(speedWrap);

    hud.appendChild(bottom);

    // ── Countdown ─────────────────────────────────
    this.countdownWrap = document.createElement('div');
    this.countdownWrap.className = 'sr-hud-countdown';
    this.countdownWrap.style.display = 'none';
    hud.appendChild(this.countdownWrap);

    // ── Go ────────────────────────────────────────
    this.goWrap = document.createElement('div');
    this.goWrap.className = 'sr-hud-go';
    this.goWrap.style.display = 'none';
    hud.appendChild(this.goWrap);

    // ── Bonk border ───────────────────────────────
    this.bonkEl = document.createElement('div');
    this.bonkEl.className = 'sr-hud-bonk';
    hud.appendChild(this.bonkEl);

    // ── Pickup notifications ──────────────────────
    this.pickupsWrap = document.createElement('div');
    this.pickupsWrap.className = 'sr-hud-pickups';
    hud.appendChild(this.pickupsWrap);

    this.hud = hud;
    this.container.appendChild(hud);
  }

  // ── Visibility ─────────────────────────────────────────────────────────────

  show(): void {
    this.hud.classList.add('sr-hud-visible');
  }

  hide(): void {
    this.hud.classList.remove('sr-hud-visible');
  }

  // ── Update methods ─────────────────────────────────────────────────────────

  updatePosition(position: number, total: number): void {
    this.posValue.textContent = ordinalSuffix(position);
    this.posTotal.textContent = `/ ${total}`;
  }

  updateDistance(current: number, total: number): void {
    const pct = total > 0 ? Math.min(100, (current / total) * 100) : 0;
    if (current < 1000) {
      this.distText.textContent = `${Math.round(current)} m`;
    } else {
      this.distText.textContent = `${(current / 1000).toFixed(2)} km`;
    }
    this.distFill.style.width = `${pct}%`;
    this.distMarkerDot.style.left = `${pct}%`;
  }

  updateStamina(stamina: number, max: number): void {
    const ratio = max > 0 ? Math.max(0, Math.min(1, stamina / max)) : 0;
    const pct = ratio * 100;
    this.staminaFill.style.width = `${pct}%`;

    this.staminaFill.classList.remove('sr-stamina-mid', 'sr-stamina-low');
    if (ratio <= 0.25) {
      this.staminaFill.classList.add('sr-stamina-low');
    } else if (ratio <= 0.5) {
      this.staminaFill.classList.add('sr-stamina-mid');
    }
  }

  updateSpeed(speed: number): void {
    this.speedValue.textContent = Math.round(speed).toString();
  }

  updateTime(elapsed: number): void {
    this.timerEl.textContent = formatTime(elapsed);
  }

  // ── Countdown ──────────────────────────────────────────────────────────────

  showCountdown(value: number): void {
    this.countdownWrap.style.display = 'flex';
    this.countdownWrap.innerHTML = '';

    const num = document.createElement('div');
    num.className = 'sr-hud-countdown-num sr-hud-shadow';
    num.textContent = String(value);
    // Re-trigger animation by forcing reflow
    this.countdownWrap.appendChild(num);
    void num.offsetWidth; // reflow
  }

  hideCountdown(): void {
    this.countdownWrap.style.display = 'none';
    this.countdownWrap.innerHTML = '';
  }

  showGo(): void {
    this.countdownWrap.style.display = 'none';
    this.goWrap.style.display = 'flex';
    this.goWrap.innerHTML = '';

    const goText = document.createElement('div');
    goText.className = 'sr-hud-go-text';
    goText.textContent = 'GO!';
    this.goWrap.appendChild(goText);

    if (this.goTimeout !== null) clearTimeout(this.goTimeout);
    this.goTimeout = setTimeout(() => {
      this.goWrap.style.display = 'none';
      this.goWrap.innerHTML = '';
      this.goTimeout = null;
    }, 1200);
  }

  // ── Bonk warning ───────────────────────────────────────────────────────────

  showBonkWarning(active: boolean): void {
    if (active) {
      this.bonkEl.classList.add('sr-bonk-active');
    } else {
      this.bonkEl.classList.remove('sr-bonk-active');
    }
  }

  // ── Pickup notifications ────────────────────────────────────────────────────

  showPickupNotification(name: string, color: string): void {
    const notif = document.createElement('div');
    notif.className = 'sr-pickup-notif';
    notif.style.setProperty('--notif-color', color);

    const dot = document.createElement('div');
    dot.className = 'sr-pickup-dot';
    const label = document.createElement('span');
    label.textContent = name;

    notif.appendChild(dot);
    notif.appendChild(label);
    this.pickupsWrap.appendChild(notif);

    // Remove after animation completes (~2.2 s)
    const timer = setTimeout(() => {
      notif.remove();
    }, 2300);
    this.pickupCleanupTimers.push(timer);
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  dispose(): void {
    if (this.goTimeout !== null) clearTimeout(this.goTimeout);
    for (const t of this.pickupCleanupTimers) clearTimeout(t);
    this.hud.remove();
  }
}
