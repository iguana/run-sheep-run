/**
 * Game - Top-level orchestrator for SheepRunner.
 *
 * Owns all sub-systems and wires them together: rendering, physics, input,
 * audio, UI, terrain, collectibles, particles, and progression.
 *
 * Scene flow:
 *   loading → menu → raceSelect → racing → results → (raceSelect | menu)
 */

import * as THREE from 'three';
import { GameLoop } from '@/game/GameLoop';
import { GameState, type GameScene } from '@/game/GameState';
import {
  CAMERA_CONST,
  LIGHTING,
  PHYSICS,
  TRACK_WIDTH_DEFAULT,
} from '@/game/constants';

// Rendering
import { CameraController } from '@/rendering/CameraController';
import { CharacterRenderer } from '@/rendering/CharacterRenderer';
import { TrackRenderer } from '@/rendering/TrackRenderer';
import { EnvironmentRenderer } from '@/rendering/EnvironmentRenderer';
import { PostProcessing } from '@/rendering/PostProcessing';

// Terrain
import { TrackPath } from '@/terrain/TrackPath';
import { TerrainSystem } from '@/terrain/TerrainSystem';

// Gameplay
import { RaceManager, type RaceResults } from '@/gameplay/RaceManager';
import { CollectibleSystem, type CollectiblePickup } from '@/gameplay/CollectibleSystem';
import { ProgressionManager } from '@/gameplay/ProgressionManager';

// Input
import { InputManager } from '@/input/InputManager';

// Audio
import { AudioManager } from '@/audio/AudioManager';
import { SoundtrackPlayer } from '@/audio/SoundtrackPlayer';
import { MusicEventSystem } from '@/audio/MusicEventSystem';

// Effects
import { ParticleSystem } from '@/effects/ParticleSystem';

// Environment
import { SkySystem } from '@/environment/SkySystem';
import { CrowdSystem } from '@/environment/CrowdSystem';
import { ParallaxBackground } from '@/environment/ParallaxBackground';

// UI
import { MenuSystem } from '@/ui/MenuSystem';
import { RaceSelectScreen } from '@/ui/RaceSelectScreen';
import { HUDManager } from '@/ui/HUDManager';
import { ResultsScreen, type RaceResult } from '@/ui/ResultsScreen';
import { SettingsPanel, type Settings } from '@/ui/SettingsPanel';

// Data
import { RACES, type RaceDefinition } from '@/data/races';
import { COMPETITORS } from '@/data/characters';

// ---------------------------------------------------------------------------
// Track generation helper
// ---------------------------------------------------------------------------

function generateTrackPoints(race: RaceDefinition): THREE.Vector3[] {
  // Scale the race distance to world units (1 meter = 1 world unit would be
  // too large for rendering, so we compress long races).
  const worldLength = Math.min(race.distance, 2000);
  const segments = 40;
  const segLen = worldLength / segments;
  const points: THREE.Vector3[] = [];
  const ep = race.elevationProfile;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const z = -i * segLen;

    // Gentle S-curves with some variation
    const curveFreq = 2 + Math.sin(i * 0.7) * 1.5;
    const x = Math.sin(t * Math.PI * curveFreq) * (worldLength * 0.04);

    // Sample elevation profile
    const epIdx = Math.min(Math.floor(t * (ep.length - 1)), ep.length - 1);
    const y = (ep[epIdx] ?? 0) * 30; // scale elevation to world units

    points.push(new THREE.Vector3(x, y, z));
  }
  return points;
}

// ---------------------------------------------------------------------------
// Game class
// ---------------------------------------------------------------------------

export class Game {
  // ---- Three.js core ----
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;

  // ---- Game systems ----
  private readonly loop: GameLoop;
  private readonly state: GameState;
  private readonly input: InputManager;
  private readonly cameraCtrl: CameraController;
  private readonly postProcessing: PostProcessing;
  private readonly particles: ParticleSystem;
  private readonly sky: SkySystem;
  private readonly crowd: CrowdSystem;
  private readonly parallax: ParallaxBackground;
  private readonly trackRenderer: TrackRenderer;
  private readonly envRenderer: EnvironmentRenderer;
  private readonly terrain: TerrainSystem;
  private readonly progression: ProgressionManager;

  // ---- Audio ----
  private readonly audio: AudioManager;
  private readonly soundtrack: SoundtrackPlayer;
  private musicEvents: MusicEventSystem | null = null;

  // ---- UI ----
  private readonly menu: MenuSystem;
  private readonly raceSelect: RaceSelectScreen;
  private readonly hud: HUDManager;
  private readonly results: ResultsScreen;
  private readonly settings: SettingsPanel;

  // ---- Active race state ----
  private raceManager: RaceManager | null = null;
  private collectibles: CollectibleSystem | null = null;
  private trackPath: TrackPath | null = null;
  private currentRace: RaceDefinition | null = null;
  private playerMesh: THREE.Group | null = null;
  private aiMeshes: THREE.Group[] = [];
  private audioInitialized = false;

  // ---- Settings ----
  private gameSettings: Settings = {
    masterVolume: 0.8,
    sfxVolume: 0.7,
    musicVolume: 0.5,
    graphicsQuality: 'medium',
  };

  // ---- Previous countdown value (for beep triggering) ----
  private lastCountdownVal = -1;

  // ---- Countdown transition tracking ----
  private wasCountingDown = false;




  constructor(private readonly container: HTMLElement) {
    // ---- Renderer ----
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.6;
    container.appendChild(this.renderer.domElement);

    // ---- Scene ----
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x6b9fd4);
    this.scene.fog = new THREE.Fog(
      0x6b9fd4,
      LIGHTING.FOG_NEAR,
      LIGHTING.FOG_FAR,
    );

    // ---- Camera ----
    this.camera = new THREE.PerspectiveCamera(
      CAMERA_CONST.FOV_BASE,
      container.clientWidth / container.clientHeight,
      CAMERA_CONST.NEAR,
      CAMERA_CONST.FAR,
    );
    this.camera.position.set(0, CAMERA_CONST.CHASE_HEIGHT, CAMERA_CONST.CHASE_DISTANCE);
    this.camera.lookAt(0, 0, 0);

    // ---- Lighting ----
    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x4a7c3f, LIGHTING.AMBIENT_INTENSITY);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfffbe8, LIGHTING.DIRECTIONAL_INTENSITY);
    sun.position.set(80, 150, -50);
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(LIGHTING.SHADOW_MAP_SIZE);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 500;
    sun.shadow.camera.left = -80;
    sun.shadow.camera.right = 80;
    sun.shadow.camera.top = 80;
    sun.shadow.camera.bottom = -80;
    this.scene.add(sun);

    // ---- Core systems ----
    this.state = new GameState();
    this.input = new InputManager(container);
    this.cameraCtrl = new CameraController(this.camera);
    this.postProcessing = new PostProcessing(this.renderer, this.scene, this.camera);
    this.particles = new ParticleSystem(this.scene);
    this.sky = new SkySystem(this.scene);
    this.crowd = new CrowdSystem(this.scene);
    this.parallax = new ParallaxBackground(this.scene);
    this.trackRenderer = new TrackRenderer(this.scene);
    this.envRenderer = new EnvironmentRenderer(this.scene);
    this.terrain = new TerrainSystem(this.scene);
    this.progression = new ProgressionManager();

    // ---- Audio ----
    this.audio = new AudioManager();
    this.soundtrack = new SoundtrackPlayer(this.audio);

    // ---- UI ----
    this.menu = new MenuSystem(container);
    this.raceSelect = new RaceSelectScreen(container);
    this.hud = new HUDManager(container);
    this.results = new ResultsScreen(container);
    this.settings = new SettingsPanel(container);

    // ---- Loop ----
    this.loop = new GameLoop(
      (dt, tick) => this.fixedUpdate(dt, tick),
      (alpha) => this.render(alpha),
      PHYSICS.TICK_RATE,
    );

    // ---- Resize handling ----
    window.addEventListener('resize', this.onResize, { passive: true });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async init(): Promise<void> {
    this.progression.load();
    await this.soundtrack.loadTracks();
    // State stays 'loading' — start() will transition to 'menu'.
  }

  start(): void {
    this.showMenu();
    this.loop.start();
  }

  destroy(): void {
    this.loop.stop();
    this.cleanupRace();
    this.input.dispose();
    this.particles.dispose();
    this.sky.dispose();
    this.crowd.dispose();
    this.trackRenderer.dispose();
    this.envRenderer.dispose();
    this.terrain.dispose();
    this.postProcessing.dispose();
    this.audio.dispose();
    this.soundtrack.dispose();
    this.menu.dispose();
    this.raceSelect.dispose();
    this.hud.dispose();
    this.results.dispose();
    this.settings.dispose();
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }

  // ---------------------------------------------------------------------------
  // Scene transitions
  // ---------------------------------------------------------------------------

  private showMenu(): void {
    this.state.transition('menu');
    this.hideAllUI();
    this.menu.show({
      onPlay: () => {
        this.ensureAudio().then(() => {
          this.soundtrack.play();
        }).catch(() => {});
        this.showRaceSelect();
      },
    });
  }

  private showRaceSelect(): void {
    this.state.transition('raceSelect');
    this.hideAllUI();

    const unlockedRaces = RACES
      .filter((r) => this.progression.isRaceUnlocked(r.id))
      .map((r) => r.id);

    const bestTimes = new Map<string, number>();
    for (const race of RACES) {
      const bt = this.progression.getBestTime(race.id);
      if (bt !== null) bestTimes.set(race.id, bt);
    }

    this.raceSelect.show(
      RACES,
      unlockedRaces,
      bestTimes,
      (raceId: string) => this.startRace(raceId),
      () => this.showMenu(),
    );
  }

  private startRace(raceId: string): void {
    const race = RACES.find((r) => r.id === raceId);
    if (!race) return;

    this.hideAllUI();

    // Clean up any previous race (must happen before setting new state)
    this.cleanupRace();

    this.currentRace = race;

    // Generate track
    const trackPoints = generateTrackPoints(race);
    this.trackPath = new TrackPath(trackPoints);

    // Pick competitors for this race
    const shuffled = [...COMPETITORS].sort(() => Math.random() - 0.5);
    const raceCompetitors = shuffled.slice(0, race.competitors);

    // Create race manager
    this.raceManager = new RaceManager(
      race.id,
      this.trackPath,
      race.distance,
      raceCompetitors,
    );

    // Build visual track
    const sampledPoints = this.trackPath.getSampledPoints(200);
    this.trackRenderer.generateTrack(
      sampledPoints,
      TRACK_WIDTH_DEFAULT,
      race.trackColor,
      race.envColors.accent,
    );

    // Terrain
    this.terrain.generate(this.trackPath, race.terrainType, race.envColors.ground);

    // Environment props
    this.envRenderer.generateEnvironment(
      sampledPoints,
      race.terrainType,
      race.envColors,
    );

    // Sky
    this.sky.configure(race.timeOfDay, race.weather, race.envColors.sky);

    // Crowd
    this.crowd.spawnCrowd(sampledPoints, race.competitors > 10 ? 1.5 : 1.0);

    // Parallax background
    this.parallax.build();

    // Collectibles
    this.collectibles = new CollectibleSystem(
      this.scene,
      this.trackPath,
      race.distance,
    );
    this.collectibles.spawnCollectibles();

    // Music events (DnB speakers)
    this.musicEvents = new MusicEventSystem(this.scene, this.audio);
    this.musicEvents.spawnSpeakers(sampledPoints, race.distance);

    // Create player mesh
    this.playerMesh = CharacterRenderer.createSheep();
    this.scene.add(this.playerMesh);

    // Create AI meshes
    this.aiMeshes = [];
    for (const competitor of raceCompetitors) {
      const mesh = CharacterRenderer.createCompetitor(competitor);
      this.scene.add(mesh);
      this.aiMeshes.push(mesh);
    }

    // Camera dramatic start
    this.cameraCtrl.setDramaticMode('start');
    setTimeout(() => {
      this.cameraCtrl.setDramaticMode('none');
    }, 3500);

    // Start race state
    this.state.startRace(
      race.id,
      race.distance,
      raceCompetitors.length + 1,
    );

    // Show HUD
    this.hud.show();
    this.lastCountdownVal = -1;
    this.wasCountingDown = false;

    // Scene atmosphere — sky blue matching the Dolomites panorama
    const skyBlue = new THREE.Color(0x6b9fd4);
    this.scene.fog = new THREE.Fog(skyBlue.getHex(), LIGHTING.FOG_NEAR, LIGHTING.FOG_FAR);
    this.scene.background = skyBlue;

    // Post processing
    this.postProcessing.setBloom(true, 0.3);
  }

  private showResults(raceResults: RaceResults): void {
    this.state.transition('results');
    this.hud.hide();

    const race = this.currentRace;
    if (!race) return;

    // Record result for progression
    const prevBest = this.progression.getBestTime(race.id);
    const isNewBest = prevBest === null || raceResults.playerTime < prevBest;

    // Record and check for unlocks
    const prevUnlocked = new Set(
      RACES.filter((r) => this.progression.isRaceUnlocked(r.id)).map((r) => r.id),
    );
    this.progression.recordRaceResult(
      race.id,
      raceResults.playerPosition,
      raceResults.playerTime,
    );
    this.progression.save();

    const newUnlocks = RACES
      .filter(
        (r) =>
          this.progression.isRaceUnlocked(r.id) && !prevUnlocked.has(r.id),
      )
      .map((r) => r.name);

    // Audio
    if (raceResults.playerPosition <= 3) {
      this.audio.playFinish();
    }

    // Camera dramatic finish
    this.cameraCtrl.setDramaticMode('finish');

    // Confetti particles
    if (raceResults.playerPosition <= 3 && this.playerMesh) {
      this.particles.emitConfetti(this.playerMesh.position);
    }

    const result: RaceResult = {
      position: raceResults.playerPosition,
      totalRunners: raceResults.runners.length,
      time: raceResults.playerTime,
      raceId: race.id,
      raceName: race.name,
      collectiblesGathered: raceResults.collectiblesGathered,
      bonked: raceResults.bonked,
      newUnlocks,
      bestTime: prevBest,
      isNewBest,
    };

    this.results.show(
      result,
      () => {
        this.cleanupRace();
        this.showRaceSelect();
      },
      () => {
        this.cleanupRace();
        this.state.transition('raceSelect'); // must go through raceSelect to reach racing
        this.startRace(race.id);
      },
    );
  }

  // @ts-expect-error kept for future use
  private showSettings(returnTo: GameScene): void {
    this.state.transition('settings');
    this.hideAllUI();
    this.settings.show(
      this.gameSettings,
      (key: string, value: number | string) => {
        if (key === 'masterVolume') {
          this.gameSettings.masterVolume = value as number;
          this.audio.setMasterVolume(value as number);
        } else if (key === 'sfxVolume') {
          this.gameSettings.sfxVolume = value as number;
          this.audio.setSFXVolume(value as number);
        } else if (key === 'musicVolume') {
          this.gameSettings.musicVolume = value as number;
          this.audio.setMusicVolume(value as number);
        } else if (key === 'graphicsQuality') {
          this.gameSettings.graphicsQuality = value as Settings['graphicsQuality'];
        }
      },
      () => {
        if (returnTo === 'menu') this.showMenu();
        else this.showRaceSelect();
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Frame callbacks
  // ---------------------------------------------------------------------------

  private fixedUpdate(dt: number, tick: number): void {
    if (this.state.paused) return;

    if (this.state.currentScene !== 'racing' || !this.raceManager || !this.trackPath || !this.currentRace) {
      return;
    }

    // Input
    const steer = this.input.getSteer();

    // Check pause
    if (this.input.isPaused()) {
      this.state.paused = true;
      return;
    }

    // Jump
    if (this.input.consumeJump()) {
      this.raceManager.playerRunner.jump();
    }

    // Update race
    this.raceManager.update(dt, steer);

    // Countdown beeps — track the transition from counting-down to racing.
    const isCountingDown = this.raceManager.isCountingDown;
    if (isCountingDown) {
      const cv = this.raceManager.countdownValue;
      if (cv !== this.lastCountdownVal && cv > 0) {
        this.lastCountdownVal = cv;
        this.audio.playCountdownBeep();
        this.hud.showCountdown(cv);
      }
    } else if (this.wasCountingDown) {
      // Countdown just finished on this tick — fire "GO!" and hide the overlay.
      this.audio.playCountdownGo();
      this.hud.hideCountdown();
      this.hud.showGo();
    }
    this.wasCountingDown = isCountingDown;
    if (isCountingDown) return;

    // Rubber-banding: keep the player competitive by boosting speed when behind.
    const player = this.raceManager.playerRunner;
    const playerPos_rank = this.raceManager.getPlayerPosition();
    const totalRunners = this.raceManager.allRunners.length;
    // Find the leader's progress to compare
    const positions = this.raceManager.getPositions();
    const leaderProgress = positions.length > 0 ? positions[0]!.progress : 0;
    const progressGap = leaderProgress - player.progress;

    if (progressGap > 0.01) {
      // Scale boost based on how far behind: small gap = small boost, big gap = big boost
      const catchUpMult = 1.0 + Math.min(progressGap * 15, 1.2);
      player.applySpeedBoost(catchUpMult, 0.5);
    }

    // Also auto-sprint if in last place
    if (playerPos_rank === totalRunners && progressGap > 0.03) {
      player.activateSprint();
    }
    const playerPos = player.state.worldPosition;

    // Collectible pickup
    if (this.collectibles) {
      const pickups: CollectiblePickup[] = this.collectibles.update(playerPos, dt);
      for (const pickup of pickups) {
        const eff = pickup.definition.effect;
        if (eff.stamina) player.applyStaminaRestore(eff.stamina);
        if (eff.speedMult && eff.speedDuration) {
          player.applySpeedBoost(eff.speedMult, eff.speedDuration);
        }
        if (eff.staminaRegen && eff.regenDuration) {
          player.applyStaminaRegen(eff.staminaRegen, eff.regenDuration);
        }

        this.raceManager.recordCollectible();
        this.audio.playPickup();
        this.cameraCtrl.shake(0.15, 0.3);
        this.particles.emitPickupBurst(
          playerPos,
          new THREE.Color(pickup.definition.color),
        );
        this.hud.showPickupNotification(
          pickup.definition.name,
          pickup.definition.color,
        );
      }
    }

    // Music events
    if (this.musicEvents) {
      const musicState = this.musicEvents.update(playerPos, dt);
      if (musicState.inMusicZone) {
        this.postProcessing.setSpeedLines(musicState.intensity * 0.3);
        if (tick % 20 === 0) this.particles.emitMusicNotes(playerPos);
      } else {
        this.postProcessing.setSpeedLines(0);
      }
    }

    // Footstep SFX (every ~0.3s worth of leg phase)
    if (Math.sin(player.state.legPhase) > 0.95 && player.state.speed > 1) {
      this.audio.playFootstep();
    }

    // Bonk warning
    if (player.state.isBonking) {
      this.hud.showBonkWarning(true);
      if (tick % 30 === 0) this.audio.playBonk();
      if (tick % 15 === 0) this.particles.emitSweat(playerPos);
    } else {
      this.hud.showBonkWarning(false);
    }

    // Dust particles (throttled — every 10th tick)
    if (player.state.speed > 4 && tick % 10 === 0) {
      this.particles.emitDust(playerPos, player.state.speed);
    }

    // Update HUD
    this.hud.updatePosition(
      this.raceManager.getPlayerPosition(),
      this.raceManager.allRunners.length,
    );
    this.hud.updateDistance(player.state.distanceCovered, this.currentRace.distance);
    this.hud.updateStamina(player.state.stamina, 1.0);
    this.hud.updateSpeed(player.state.speed);
    this.hud.updateTime(this.state.raceState?.elapsed ?? 0);

    // Update race state
    this.state.updateRace({
      elapsed: this.state.raceState!.elapsed + dt,
      distance: player.state.distanceCovered,
      position: this.raceManager.getPlayerPosition(),
      stamina: player.state.stamina,
      speed: player.state.speed,
    });

    // Speed lines based on speed
    const speedRatio = player.state.speed / 12;
    if (!this.musicEvents || !(this.musicEvents.update(playerPos, 0).inMusicZone)) {
      this.postProcessing.setSpeedLines(Math.max(0, speedRatio - 0.6) * 2);
    }

    // Terrain chunks
    this.terrain.update(playerPos);

    // Check race end
    if (this.raceManager.isFinished) {
      const rr = this.raceManager.getResults();
      if (rr) this.showResults(rr);
    }
  }

  private render(_alpha: number): void {
    const dt = 1 / 60; // approximate render dt

    // Update visual systems
    if (this.state.currentScene === 'racing' && this.raceManager && this.trackPath) {
      const player = this.raceManager.playerRunner;
      const playerPos = player.state.worldPosition;

      // Update player mesh
      if (this.playerMesh) {
        this.playerMesh.position.copy(playerPos);
        this.playerMesh.rotation.y = player.state.heading;
        CharacterRenderer.updateRunAnimation(
          this.playerMesh,
          player.state.legPhase,
          player.state.bodyBob,
          player.state.speed,
        );
      }

      // Update AI meshes
      const allRunners = this.raceManager.allRunners;
      for (let i = 0; i < this.aiMeshes.length; i++) {
        const aiRunner = allRunners[i + 1]; // index 0 is player
        const mesh = this.aiMeshes[i];
        if (aiRunner && mesh) {
          mesh.position.copy(aiRunner.state.worldPosition);
          mesh.rotation.y = aiRunner.state.heading;
          CharacterRenderer.updateRunAnimation(
            mesh,
            aiRunner.state.legPhase,
            aiRunner.state.bodyBob,
            aiRunner.state.speed,
          );
        }
      }

      // Camera follow
      this.cameraCtrl.update(
        playerPos,
        player.state.heading,
        player.state.speed,
        dt,
      );

      // Track visibility
      this.trackRenderer.updateVisibility(player.progress, 60);

      // Environment LOD
      this.envRenderer.updateVisibility(this.camera.position);

      // Crowd animation
      this.crowd.update(dt, playerPos);

      // Parallax background scroll
      this.parallax.update(playerPos, player.progress);

      // Collectible animation
      if (this.collectibles) this.collectibles.animate(dt);

      // Music event animation
      if (this.musicEvents) this.musicEvents.animate(dt);
    }

    // Always update
    this.particles.update(dt);
    this.sky.update(dt);

    // Render directly — post-processing pipeline disabled to avoid blur artifacts.
    this.renderer.render(this.scene, this.camera);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private hideAllUI(): void {
    this.menu.hide();
    this.raceSelect.hide();
    this.hud.hide();
    this.results.hide();
    this.settings.hide();
  }

  private cleanupRace(): void {
    // Remove character meshes
    if (this.playerMesh) {
      this.scene.remove(this.playerMesh);
      this.playerMesh = null;
    }
    for (const mesh of this.aiMeshes) {
      this.scene.remove(mesh);
    }
    this.aiMeshes = [];

    // Dispose systems
    if (this.collectibles) {
      this.collectibles.dispose();
      this.collectibles = null;
    }
    if (this.musicEvents) {
      this.musicEvents.dispose();
      this.musicEvents = null;
    }
    if (this.raceManager) {
      this.raceManager.dispose();
      this.raceManager = null;
    }

    this.trackRenderer.dispose();
    this.envRenderer.dispose();
    this.terrain.dispose();
    this.crowd.dispose();
    this.parallax.dispose();

    this.trackPath = null;
    this.currentRace = null;
    this.cameraCtrl.setDramaticMode('none');
    this.postProcessing.setSpeedLines(0);
    this.postProcessing.setBloom(false);
  }

  private async ensureAudio(): Promise<void> {
    if (!this.audioInitialized) {
      await this.audio.init();
      this.audio.setMasterVolume(this.gameSettings.masterVolume);
      this.audio.setSFXVolume(this.gameSettings.sfxVolume);
      this.audio.setMusicVolume(this.gameSettings.musicVolume);
      this.audioInitialized = true;
    }
  }

  private readonly onResize = (): void => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.postProcessing.resize(w, h);
  };
}
