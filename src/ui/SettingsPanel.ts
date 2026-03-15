/**
 * SettingsPanel.ts
 *
 * Settings overlay for SheepRunner.
 * Volume sliders (master, SFX, music) and graphics quality toggle.
 */

// ─── Style injection ──────────────────────────────────────────────────────────

const STYLE_ID = 'sr-settings-styles';

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const css = `
    /* ── Overlay ── */
    .sr-set-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.4s ease;
      z-index: 10;
      background: rgba(13,5,32,0.92);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    .sr-set-overlay.sr-visible {
      opacity: 1;
      pointer-events: auto;
    }

    /* ── Decorative background ── */
    .sr-set-bg-deco {
      position: absolute;
      inset: 0;
      pointer-events: none;
      background:
        radial-gradient(ellipse 60% 50% at 15% 20%, rgba(124,58,237,0.18) 0%, transparent 70%),
        radial-gradient(ellipse 50% 40% at 85% 80%, rgba(255,107,43,0.12) 0%, transparent 70%),
        radial-gradient(ellipse 40% 35% at 50% 50%, rgba(6,214,160,0.06) 0%, transparent 70%);
    }

    /* ── Panel card ── */
    .sr-set-card {
      position: relative;
      z-index: 2;
      display: flex;
      flex-direction: column;
      gap: 0;
      width: min(440px, 92vw);
      max-height: 90vh;
      overflow-y: auto;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
      background: rgba(20,10,30,0.85);
      border: 1.5px solid rgba(124,58,237,0.3);
      border-radius: 20px;
      box-shadow:
        0 8px 40px rgba(0,0,0,0.6),
        0 0 0 1px rgba(124,58,237,0.1),
        inset 0 1px 0 rgba(255,255,255,0.05);
    }
    .sr-set-card::-webkit-scrollbar { width: 4px; }
    .sr-set-card::-webkit-scrollbar-track { background: transparent; }
    .sr-set-card::-webkit-scrollbar-thumb { background: rgba(124,58,237,0.4); border-radius: 2px; }

    /* ── Panel header ── */
    .sr-set-header {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 20px 22px 18px;
      border-bottom: 1px solid rgba(124,58,237,0.2);
      background: rgba(124,58,237,0.06);
      border-radius: 20px 20px 0 0;
      flex-shrink: 0;
    }
    .sr-set-header-icon {
      font-size: 1.5rem;
    }
    .sr-set-title {
      flex: 1;
      font-size: 1.2rem;
      font-weight: 900;
      letter-spacing: 0.04em;
      background: linear-gradient(90deg, #ffffff 0%, #a78bfa 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin: 0;
    }
    .sr-set-back {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 44px;
      min-height: 44px;
      padding: 0 10px;
      background: rgba(124,58,237,0.15);
      border: 1.5px solid rgba(124,58,237,0.35);
      border-radius: 10px;
      color: #a78bfa;
      font-size: 1rem;
      font-weight: 700;
      font-family: inherit;
      cursor: pointer;
      transition: background 0.15s, transform 0.12s;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
      flex-shrink: 0;
    }
    .sr-set-back:active { background: rgba(124,58,237,0.3); transform: scale(0.93); }

    /* ── Section ── */
    .sr-set-section {
      display: flex;
      flex-direction: column;
      gap: 0;
      padding: 14px 22px;
    }
    .sr-set-section + .sr-set-section {
      border-top: 1px solid rgba(255,255,255,0.06);
    }
    .sr-set-section-title {
      font-size: 0.62rem;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: rgba(167,139,250,0.55);
      margin-bottom: 14px;
    }

    /* ── Slider row ── */
    .sr-set-slider-row {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
    }
    .sr-set-slider-row:last-child { margin-bottom: 0; }

    .sr-set-slider-labels {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .sr-set-slider-label {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 0.88rem;
      font-weight: 700;
      color: #f0e6d3;
    }
    .sr-set-slider-icon { font-size: 1rem; }
    .sr-set-slider-value {
      font-size: 0.8rem;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      color: #ff6b2b;
      min-width: 36px;
      text-align: right;
    }

    /* ── Range input ── */
    .sr-set-range {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 6px;
      border-radius: 3px;
      background: rgba(255,255,255,0.1);
      outline: none;
      cursor: pointer;
      touch-action: manipulation;
      /* Track gradient updated via JS */
    }
    .sr-set-range::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: radial-gradient(circle, #ff6b2b 0%, #c94d15 100%);
      box-shadow: 0 0 8px rgba(255,107,43,0.5), 0 2px 4px rgba(0,0,0,0.4);
      cursor: pointer;
      transition: transform 0.12s ease, box-shadow 0.12s ease;
    }
    .sr-set-range::-webkit-slider-thumb:active {
      transform: scale(1.25);
      box-shadow: 0 0 14px rgba(255,107,43,0.7), 0 2px 6px rgba(0,0,0,0.5);
    }
    .sr-set-range::-moz-range-thumb {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: none;
      background: radial-gradient(circle, #ff6b2b 0%, #c94d15 100%);
      box-shadow: 0 0 8px rgba(255,107,43,0.5);
      cursor: pointer;
    }

    /* ── Graphics quality toggle ── */
    .sr-set-quality-row {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .sr-set-quality-label {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 0.88rem;
      font-weight: 700;
      color: #f0e6d3;
    }
    .sr-set-quality-opts {
      display: flex;
      gap: 8px;
    }
    .sr-set-quality-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      min-height: 44px;
      border-radius: 10px;
      border: 1.5px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.05);
      color: rgba(240,230,211,0.5);
      font-family: inherit;
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      cursor: pointer;
      transition: all 0.15s ease;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }
    .sr-set-quality-btn.sr-quality-active {
      background: rgba(124,58,237,0.25);
      border-color: rgba(124,58,237,0.6);
      color: #a78bfa;
      box-shadow: 0 0 12px rgba(124,58,237,0.25);
    }
    .sr-set-quality-btn:active { transform: scale(0.95); }

    /* ── Footer ── */
    .sr-set-footer {
      padding: 12px 22px 20px;
      border-top: 1px solid rgba(255,255,255,0.06);
      border-radius: 0 0 20px 20px;
    }
    .sr-set-footer-note {
      font-size: 0.65rem;
      color: rgba(240,230,211,0.28);
      text-align: center;
      letter-spacing: 0.06em;
    }
  `;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Settings {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  graphicsQuality: 'low' | 'medium' | 'high';
}

type SettingsChangeCallback = (key: string, value: number | string) => void;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const QUALITY_ICONS: Record<string, string> = { low: '🔋', medium: '⚡', high: '✨' };

function buildSlider(
  id: string,
  icon: string,
  label: string,
  initialValue: number,
  onChange: (v: number) => void,
): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'sr-set-slider-row';

  const labelsRow = document.createElement('div');
  labelsRow.className = 'sr-set-slider-labels';

  const labelEl = document.createElement('label');
  labelEl.className = 'sr-set-slider-label';
  labelEl.htmlFor = id;
  labelEl.innerHTML = `<span class="sr-set-slider-icon">${icon}</span><span>${label}</span>`;
  labelsRow.appendChild(labelEl);

  const valueEl = document.createElement('span');
  valueEl.className = 'sr-set-slider-value';
  valueEl.textContent = `${Math.round(initialValue * 100)}%`;
  labelsRow.appendChild(valueEl);

  row.appendChild(labelsRow);

  const range = document.createElement('input');
  range.type = 'range';
  range.id = id;
  range.className = 'sr-set-range';
  range.min = '0';
  range.max = '1';
  range.step = '0.01';
  range.value = String(initialValue);

  function updateTrack(v: number): void {
    const pct = v * 100;
    range.style.background = `linear-gradient(to right, #ff6b2b ${pct}%, rgba(255,255,255,0.1) ${pct}%)`;
    valueEl.textContent = `${Math.round(pct)}%`;
  }

  updateTrack(initialValue);

  range.addEventListener('input', () => {
    const v = parseFloat(range.value);
    updateTrack(v);
    onChange(v);
  });

  row.appendChild(range);
  return row;
}

// ─── Class ────────────────────────────────────────────────────────────────────

export class SettingsPanel {
  private readonly container: HTMLElement;
  private overlay: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.container = container;
    injectStyles();
    this.overlay = document.createElement('div');
    this.overlay.className = 'sr-set-overlay';
    this.container.appendChild(this.overlay);
  }

  show(
    settings: Settings,
    onChange: SettingsChangeCallback,
    onBack: () => void,
  ): void {
    this.overlay.innerHTML = '';

    // Background decoration
    const bgDeco = document.createElement('div');
    bgDeco.className = 'sr-set-bg-deco';
    this.overlay.appendChild(bgDeco);

    // Card
    const card = document.createElement('div');
    card.className = 'sr-set-card';

    // Header
    const header = document.createElement('div');
    header.className = 'sr-set-header';

    const headerIcon = document.createElement('span');
    headerIcon.className = 'sr-set-header-icon';
    headerIcon.textContent = '⚙️';
    header.appendChild(headerIcon);

    const title = document.createElement('h2');
    title.className = 'sr-set-title';
    title.textContent = 'Settings';
    header.appendChild(title);

    const backBtn = document.createElement('button');
    backBtn.className = 'sr-set-back';
    backBtn.setAttribute('type', 'button');
    backBtn.setAttribute('aria-label', 'Back');
    backBtn.innerHTML = '&#8592; Back';
    backBtn.addEventListener('click', onBack, { once: true });
    header.appendChild(backBtn);

    card.appendChild(header);

    // ── Audio section ─────────────────────────────
    const audioSection = document.createElement('div');
    audioSection.className = 'sr-set-section';

    const audioTitle = document.createElement('div');
    audioTitle.className = 'sr-set-section-title';
    audioTitle.textContent = 'Audio';
    audioSection.appendChild(audioTitle);

    audioSection.appendChild(
      buildSlider('sr-vol-master', '🔊', 'Master Volume', settings.masterVolume, (v) => {
        onChange('masterVolume', v);
      }),
    );
    audioSection.appendChild(
      buildSlider('sr-vol-sfx', '💥', 'Sound Effects', settings.sfxVolume, (v) => {
        onChange('sfxVolume', v);
      }),
    );
    audioSection.appendChild(
      buildSlider('sr-vol-music', '🎵', 'Music', settings.musicVolume, (v) => {
        onChange('musicVolume', v);
      }),
    );

    card.appendChild(audioSection);

    // ── Graphics section ──────────────────────────
    const gfxSection = document.createElement('div');
    gfxSection.className = 'sr-set-section';

    const gfxTitle = document.createElement('div');
    gfxTitle.className = 'sr-set-section-title';
    gfxTitle.textContent = 'Graphics';
    gfxSection.appendChild(gfxTitle);

    const qualityRow = document.createElement('div');
    qualityRow.className = 'sr-set-quality-row';

    const qualityLabel = document.createElement('div');
    qualityLabel.className = 'sr-set-quality-label';
    qualityLabel.innerHTML = '<span class="sr-set-slider-icon">🖥️</span><span>Quality</span>';
    qualityRow.appendChild(qualityLabel);

    const qualityOpts = document.createElement('div');
    qualityOpts.className = 'sr-set-quality-opts';

    let currentQuality = settings.graphicsQuality;

    const qualityLevels: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];
    const qualityBtns: HTMLButtonElement[] = [];

    qualityLevels.forEach((level) => {
      const btn = document.createElement('button');
      btn.className = `sr-set-quality-btn${level === currentQuality ? ' sr-quality-active' : ''}`;
      btn.setAttribute('type', 'button');
      btn.innerHTML = `${QUALITY_ICONS[level] ?? ''} ${level.charAt(0).toUpperCase() + level.slice(1)}`;
      btn.addEventListener('click', () => {
        if (currentQuality === level) return;
        currentQuality = level;
        qualityBtns.forEach((b, i) => {
          const isActive = qualityLevels[i] === level;
          b.classList.toggle('sr-quality-active', isActive);
        });
        onChange('graphicsQuality', level);
      });
      qualityBtns.push(btn);
      qualityOpts.appendChild(btn);
    });

    qualityRow.appendChild(qualityOpts);
    gfxSection.appendChild(qualityRow);
    card.appendChild(gfxSection);

    // ── Footer ────────────────────────────────────
    const footer = document.createElement('div');
    footer.className = 'sr-set-footer';
    const footerNote = document.createElement('p');
    footerNote.className = 'sr-set-footer-note';
    footerNote.textContent = 'Settings are saved automatically';
    footer.appendChild(footerNote);
    card.appendChild(footer);

    this.overlay.appendChild(card);

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
