/**
 * RaceManager - Orchestrates a full race session.
 *
 * Responsibilities:
 *   - Countdown (3, 2, 1 → GO)
 *   - Player physics + steering
 *   - AI runner creation and updating
 *   - Position tracking (sort by trackProgress)
 *   - Finish detection (player and all AIs)
 *   - Results assembly
 *
 * Usage pattern:
 *   const rm = new RaceManager(raceId, trackPath, totalDistance, competitors);
 *   // In game loop:
 *   rm.update(dt, inputManager.getSteer());
 *   if (rm.isFinished) showResults(rm.getResults());
 *
 * The manager owns RunnerPhysics and AIRunnerController instances but does
 * NOT own the THREE scene. Visual representation is handled upstream.
 */

import { RunnerPhysics } from './RunnerPhysics';
import { AIRunnerController, type SpeedProfile } from './AIRunnerController';
import type { TrackPath } from '../terrain/TrackPath';
import { PLAYER_SHEEP, type AnimalType } from '../data/characters';
import { RACE_COUNTDOWN_DURATION } from '../game/constants';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RaceResults {
  raceId: string;
  /** Player's finishing position (1 = first). */
  playerPosition: number;
  /** Player's elapsed race time in seconds. */
  playerTime: number;
  runners: {
    name: string;
    species: string;
    time: number;
    position: number;
  }[];
  collectiblesGathered: number;
  bonked: boolean;
}

// ---------------------------------------------------------------------------
// Internal runner record
// ---------------------------------------------------------------------------

interface ManagedRunner {
  physics: RunnerPhysics;
  animal: AnimalType;
  controller: AIRunnerController | null; // null = player
  finishTime: number | null;
  /** Display name shown in HUD position list. */
  name: string;
}

// ---------------------------------------------------------------------------
// Class
// ---------------------------------------------------------------------------

export class RaceManager {
  private readonly raceId: string;
  private readonly totalDistance: number;

  private readonly player: RunnerPhysics;
  private readonly aiRunners: {
    physics: RunnerPhysics;
    animal: AnimalType;
    controller: AIRunnerController;
  }[] = [];

  /** All runners in race order (player first, AIs after). */
  private readonly runners: ManagedRunner[];

  private elapsed: number = 0;
  private countdown: number = RACE_COUNTDOWN_DURATION;
  private raceStarted: boolean = false;
  private raceFinishedFlag: boolean = false;

  /** Cached results — populated the first time the race ends. */
  private results: RaceResults | null = null;

  /** How many collectibles the player picked up this race. */
  private collectiblesGathered: number = 0;

  /** Whether the player bonked at any point during the race. */
  private playerBonked: boolean = false;

  constructor(
    raceId: string,
    trackPath: TrackPath,
    totalDistance: number,
    competitors: AnimalType[],
  ) {
    this.raceId = raceId;
    this.totalDistance = totalDistance;

    // Build player runner.
    this.player = new RunnerPhysics(trackPath, totalDistance);

    const playerRecord: ManagedRunner = {
      physics: this.player,
      animal: PLAYER_SHEEP,
      controller: null,
      finishTime: null,
      name: 'You',
    };

    // Build AI runners.
    const aiRecords: ManagedRunner[] = competitors.map((animal, index) => {
      const physics = new RunnerPhysics(trackPath, totalDistance);

      // Stagger start positions laterally so runners don't overlap.
      const lateralStagger = (index % 2 === 0 ? 1 : -1) * (1 + Math.floor(index / 2)) * 1.5;
      physics.state.lateralOffset = Math.max(
        -trackPath.lateralClamp,
        Math.min(trackPath.lateralClamp, lateralStagger),
      );

      // Use speed profile and base speed from the AnimalType definition directly.
      const controller = new AIRunnerController(
        physics,
        animal.speedProfile,
        animal.baseSpeedMult,
      );

      this.aiRunners.push({ physics, animal, controller });

      return {
        physics,
        animal,
        controller,
        finishTime: null,
        name: animal.name,
      };
    });

    this.runners = [playerRecord, ...aiRecords];
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Advance the race by one fixed timestep.
   *
   * @param dt          Fixed timestep (seconds).
   * @param playerSteer Steer input for the player runner [-1, 1].
   */
  update(dt: number, playerSteer: number): void {
    if (this.raceFinishedFlag) return;

    // Countdown phase.
    if (!this.raceStarted) {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.countdown = 0;
        this.raceStarted = true;
      }
      return; // runners stay still during countdown
    }

    this.elapsed += dt;

    // Update player.
    this.player.update(dt, playerSteer);
    if (this.player.state.isBonking) {
      this.playerBonked = true;
    }

    // Record player finish.
    const playerRecord = this.runners[0];
    if (
      playerRecord !== undefined &&
      this.player.finished &&
      playerRecord.finishTime === null
    ) {
      playerRecord.finishTime = this.elapsed;
    }

    // Update AIs.
    const playerProgress = this.player.progress;
    for (const ai of this.aiRunners) {
      // Rough normalised race-time progress (hits 1 when expected to finish).
      const raceProgress = Math.min(1, this.elapsed / (this.totalDistance / 4));
      ai.controller.update(dt, raceProgress, playerProgress);

      // Record AI finish time.
      const rec = this.runners.find((r) => r.physics === ai.physics);
      if (rec !== undefined && ai.physics.finished && rec.finishTime === null) {
        rec.finishTime = this.elapsed;
      }
    }

    // Race ends once every runner has crossed the finish.
    const allFinished = this.runners.every((r) => r.physics.finished);
    if (allFinished) {
      this._finaliseRace();
    }
  }

  /**
   * Record that the player collected a collectible this tick.
   * Called externally by the CollectibleSystem consumer.
   */
  recordCollectible(): void {
    this.collectiblesGathered++;
  }

  /** Sorted array of current race positions (index 0 = leader). */
  getPositions(): { name: string; progress: number; position: number }[] {
    const sorted = [...this.runners].sort(
      (a, b) => b.physics.progress - a.physics.progress,
    );
    return sorted.map((r, i) => ({
      name: r.name,
      progress: r.physics.progress,
      position: i + 1,
    }));
  }

  /** Current 1-based position of the player. */
  getPlayerPosition(): number {
    const positions = this.getPositions();
    const entry = positions.find((p) => p.name === 'You');
    return entry !== undefined ? entry.position : this.runners.length;
  }

  /** Returns race results, or null if the race is not yet finished. */
  getResults(): RaceResults | null {
    return this.results;
  }

  get isCountingDown(): boolean {
    return !this.raceStarted;
  }

  get countdownValue(): number {
    return Math.ceil(this.countdown);
  }

  get isFinished(): boolean {
    return this.raceFinishedFlag;
  }

  /** The player's RunnerPhysics instance. */
  get playerRunner(): RunnerPhysics {
    return this.player;
  }

  /** All RunnerPhysics instances (player first). */
  get allRunners(): RunnerPhysics[] {
    return this.runners.map((r) => r.physics);
  }

  dispose(): void {
    // RunnerPhysics has no GPU resources; nothing to tear down.
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _finaliseRace(): void {
    if (this.raceFinishedFlag) return;
    this.raceFinishedFlag = true;

    // Assign finish times to any runners who didn't formally finish
    // (edge case: race forcibly ended externally).
    for (const r of this.runners) {
      if (r.finishTime === null) {
        r.finishTime = this.elapsed;
      }
    }

    // Sort by finish time to assign positions.
    const sorted = [...this.runners].sort(
      (a, b) => (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity),
    );

    const playerIdx = sorted.findIndex((r) => r.name === 'You');
    const playerPosition = playerIdx + 1;
    const playerTime = this.runners[0]?.finishTime ?? this.elapsed;

    const runnerResults = sorted.map((r, i) => ({
      name: r.name,
      species: r.animal.species,
      time: r.finishTime ?? this.elapsed,
      position: i + 1,
    }));

    this.results = {
      raceId: this.raceId,
      playerPosition,
      playerTime,
      runners: runnerResults,
      collectiblesGathered: this.collectiblesGathered,
      bonked: this.playerBonked,
    };
  }

  /**
   * Resolve a SpeedProfile from an AnimalType.
   * Kept as a static utility in case callers need it externally.
   */
  static resolveSpeedProfile(animal: AnimalType): SpeedProfile {
    return animal.speedProfile;
  }
}
