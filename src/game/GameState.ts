/**
 * GameState - Scene state machine and race data store.
 *
 * Scenes form a simple directed graph; `transition` is the only way to move
 * between them. RaceState is null outside of an active race so callers can
 * use a narrow type check rather than sentinel values.
 *
 * This class is intentionally not an EventEmitter so it stays testable without
 * a bus; the scene layer that owns GameState should publish state-change events
 * on the EventBus itself after calling these methods.
 */

export type GameScene =
  | 'loading'
  | 'menu'
  | 'raceSelect'
  | 'racing'
  | 'results'
  | 'settings';

export interface RaceState {
  raceId: string;
  elapsed: number;
  distance: number;
  totalDistance: number;
  position: number;
  totalRunners: number;
  stamina: number;
  speed: number;
  finished: boolean;
}

/** Valid scene transitions. Unlisted pairs will throw. */
const VALID_TRANSITIONS: ReadonlyMap<GameScene, ReadonlySet<GameScene>> = new Map([
  ['loading',    new Set<GameScene>(['menu'])],
  ['menu',       new Set<GameScene>(['raceSelect', 'settings'])],
  ['raceSelect', new Set<GameScene>(['racing', 'menu', 'settings'])],
  ['racing',     new Set<GameScene>(['results', 'menu', 'settings'])],
  ['results',    new Set<GameScene>(['raceSelect', 'menu', 'settings'])],
  ['settings',   new Set<GameScene>(['menu', 'raceSelect', 'racing'])],
]);

export class GameState {
  currentScene: GameScene = 'loading';
  raceState: RaceState | null = null;
  paused: boolean = false;

  /**
   * Move to a new scene.
   * @throws {Error} if the transition is not in the valid transition graph.
   */
  transition(to: GameScene): void {
    const allowed = VALID_TRANSITIONS.get(this.currentScene);
    if (allowed === undefined || !allowed.has(to)) {
      throw new Error(
        `Invalid scene transition: "${this.currentScene}" → "${to}"`,
      );
    }
    this.currentScene = to;
    this.paused = false;
  }

  /**
   * Initialise a new race, moving state to 'racing'.
   * Must be called from 'raceSelect'.
   */
  startRace(
    raceId: string,
    totalDistance: number,
    totalRunners: number,
  ): void {
    this.transition('racing');
    this.raceState = {
      raceId,
      elapsed: 0,
      distance: 0,
      totalDistance,
      position: totalRunners, // start at the back; improves via updateRace
      totalRunners,
      stamina: 1,
      speed: 0,
      finished: false,
    };
  }

  /**
   * Apply a partial update to the current race state.
   * @throws {Error} if called outside of an active race.
   */
  updateRace(updates: Partial<RaceState>): void {
    if (this.raceState === null) {
      throw new Error('updateRace called with no active race');
    }
    Object.assign(this.raceState, updates);
  }

  /**
   * Mark the race as finished and clear raceState.
   * Callers should call `transition('results')` afterwards.
   */
  endRace(): void {
    if (this.raceState !== null) {
      this.raceState = { ...this.raceState, finished: true };
    }
    this.raceState = null;
  }
}
