import { Game } from '@/game/Game';

const container = document.getElementById('game-container');
if (!container) {
  throw new Error('[SheepRunner] #game-container element not found in DOM.');
}

// Progress reporting hook for the loading screen
function setProgress(pct: number, label: string): void {
  const fill = document.getElementById('progress-fill');
  const text = document.getElementById('progress-label');
  const bar  = fill?.parentElement;
  if (fill) fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  if (text) text.textContent = label;
  if (bar)  bar.setAttribute('aria-valuenow', String(Math.round(pct)));
}

function hideLoadingScreen(): void {
  const screen = document.getElementById('loading-screen');
  if (screen) {
    screen.classList.add('hidden');
    // Remove from DOM after transition so it doesn't block input
    screen.addEventListener('transitionend', () => screen.remove(), { once: true });
    // Fallback: remove after 1.5s even if transitionend doesn't fire
    setTimeout(() => screen.remove(), 1500);
  }
}

async function bootstrap(): Promise<void> {
  setProgress(10, 'Initialising renderer...');

  let game: Game;
  try {
    game = new Game(container!);
  } catch (err) {
    console.error('[SheepRunner] Failed to create Game instance:', err);
    setProgress(0, 'Failed to initialise. Please refresh.');
    return;
  }

  setProgress(40, 'Loading assets...');

  try {
    await game.init();
  } catch (err) {
    console.error('[SheepRunner] Game initialisation failed:', err);
    setProgress(0, 'Asset load failed. Please refresh.');
    return;
  }

  setProgress(100, 'Ready!');

  // Short pause so the player sees 100% before it disappears
  await new Promise<void>((resolve) => setTimeout(resolve, 400));

  hideLoadingScreen();
  game.start();
}

bootstrap().catch((err) => {
  console.error('[SheepRunner] Unhandled bootstrap error:', err);
});
