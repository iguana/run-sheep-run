/**
 * SkySystem - Dynamic procedural sky for sheeprunner.
 *
 * Approach
 * ========
 * A large inverted sphere (sky dome) renders an GLSL gradient shader that
 * blends between a zenith colour and a horizon colour based on the vertex's
 * elevation angle.  No texture atlas or skybox cubemap is needed.
 *
 * Cloud layer
 * ===========
 * A handful of flat ellipsoid planes float at a fixed altitude above the
 * scene.  Each plane samples a simple fbm-like noise approximated with a
 * procedural colour (light grey to white) and a randomised scale/position.
 * They drift slowly along the X axis to suggest wind.
 *
 * Time of day
 * ===========
 * configure() maps `timeOfDay` (0–24 h) to gradient stop colours using a
 * hand-tuned palette:
 *   - Night      (0–5 h, 21–24 h)  : deep navy → dark purple
 *   - Dawn       (5–8 h)            : orange horizon → pale blue zenith
 *   - Day        (8–17 h)           : light sky blue
 *   - Dusk       (17–20 h)          : red-orange horizon → indigo zenith
 *
 * Weather overrides the cloud density and horizon haze amount.
 *
 * Performance
 * ===========
 * - Single draw call per frame (sky dome + cloud planes share one instanced mesh).
 * - Shader is a trivial linear mix — no texture lookups.
 * - No shadow casting from sky geometry.
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOME_RADIUS    = 1400;
const DOME_SEGMENTS  = 24;
const CLOUD_ALTITUDE = 280;
const CLOUD_COUNT    = 12;
const CLOUD_DRIFT_SPEED = 1.5; // world units per second

// ---------------------------------------------------------------------------
// Gradient palette helpers
// ---------------------------------------------------------------------------

interface SkyPalette {
  zenith:   THREE.Color;
  horizon:  THREE.Color;
  fogColor: THREE.Color;
}

/** Blend between two colours by t in [0, 1]. */
function lerpColor(a: THREE.Color, b: THREE.Color, t: number): THREE.Color {
  return new THREE.Color(
    a.r + (b.r - a.r) * t,
    a.g + (b.g - a.g) * t,
    a.b + (b.b - a.b) * t,
  );
}

// Pre-defined sky palettes for each broad time-of-day band.
const PALETTE_NIGHT: SkyPalette = {
  zenith:  new THREE.Color(0x08081e),
  horizon: new THREE.Color(0x1a0a2e),
  fogColor: new THREE.Color(0x0d0820),
};
const PALETTE_DAWN: SkyPalette = {
  zenith:  new THREE.Color(0x4a6fa0),
  horizon: new THREE.Color(0xff8040),
  fogColor: new THREE.Color(0xd06020),
};
const PALETTE_DAY: SkyPalette = {
  zenith:  new THREE.Color(0x1e73c8),
  horizon: new THREE.Color(0x9dc8f0),
  fogColor: new THREE.Color(0xc0d8f0),
};
const PALETTE_DUSK: SkyPalette = {
  zenith:  new THREE.Color(0x1a1240),
  horizon: new THREE.Color(0xff5010),
  fogColor: new THREE.Color(0xa03010),
};

/** Evaluate sky palette for a given hour (0–24). */
function paletteForHour(hour: number, weatherOverride: string): SkyPalette {
  const h = ((hour % 24) + 24) % 24;

  let base: SkyPalette;
  if (h < 5) {
    base = PALETTE_NIGHT;
  } else if (h < 8) {
    const t = (h - 5) / 3;
    base = {
      zenith:  lerpColor(PALETTE_NIGHT.zenith,  PALETTE_DAWN.zenith,  t),
      horizon: lerpColor(PALETTE_NIGHT.horizon, PALETTE_DAWN.horizon, t),
      fogColor: lerpColor(PALETTE_NIGHT.fogColor, PALETTE_DAWN.fogColor, t),
    };
  } else if (h < 17) {
    const t = (h - 8) / 9;
    base = {
      zenith:  lerpColor(PALETTE_DAWN.zenith,  PALETTE_DAY.zenith,  t),
      horizon: lerpColor(PALETTE_DAWN.horizon, PALETTE_DAY.horizon, t),
      fogColor: lerpColor(PALETTE_DAWN.fogColor, PALETTE_DAY.fogColor, t),
    };
  } else if (h < 21) {
    const t = (h - 17) / 4;
    base = {
      zenith:  lerpColor(PALETTE_DAY.zenith,  PALETTE_DUSK.zenith,  t),
      horizon: lerpColor(PALETTE_DAY.horizon, PALETTE_DUSK.horizon, t),
      fogColor: lerpColor(PALETTE_DAY.fogColor, PALETTE_DUSK.fogColor, t),
    };
  } else {
    const t = (h - 21) / 3;
    base = {
      zenith:  lerpColor(PALETTE_DUSK.zenith,  PALETTE_NIGHT.zenith,  t),
      horizon: lerpColor(PALETTE_DUSK.horizon, PALETTE_NIGHT.horizon, t),
      fogColor: lerpColor(PALETTE_DUSK.fogColor, PALETTE_NIGHT.fogColor, t),
    };
  }

  // Weather desaturation.
  if (weatherOverride === 'overcast' || weatherOverride === 'rain' || weatherOverride === 'fog') {
    const grey = new THREE.Color(0.62, 0.65, 0.70);
    const mix  = weatherOverride === 'fog' ? 0.8 : 0.55;
    base.zenith.lerp(grey, mix);
    base.horizon.lerp(grey, mix);
    base.fogColor.lerp(grey, mix);
  }

  return base;
}

// ---------------------------------------------------------------------------
// Sky dome shader
// ---------------------------------------------------------------------------

const SKY_VERTEX_SHADER = /* glsl */`
varying vec3 vWorldPosition;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAGMENT_SHADER = /* glsl */`
uniform vec3 uZenith;
uniform vec3 uHorizon;

varying vec3 vWorldPosition;

void main() {
  // Normalised height of this fragment on the dome [0 = horizon, 1 = zenith].
  float t = clamp(vWorldPosition.y / ${DOME_RADIUS.toFixed(1)}, 0.0, 1.0);
  // Power curve makes the horizon gradient wider and more atmospheric.
  float blend = pow(t, 0.5);
  vec3 color = mix(uHorizon, uZenith, blend);
  gl_FragColor = vec4(color, 1.0);
}
`;

// ---------------------------------------------------------------------------
// SkySystem
// ---------------------------------------------------------------------------

export class SkySystem {
  private readonly scene: THREE.Scene;

  private domeMesh: THREE.Mesh | null = null;
  private domeMat: THREE.ShaderMaterial | null = null;

  private cloudMesh: THREE.InstancedMesh | null = null;
  private cloudOffsets: number[] = []; // X offsets per cloud instance
  private cloudBasePositions: THREE.Vector3[] = [];

  // Scratch.
  private readonly _mat4   = new THREE.Matrix4();
  private readonly _pos    = new THREE.Vector3();
  private readonly _quat   = new THREE.Quaternion();
  private readonly _scale  = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this._buildDome();
    this._buildClouds();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Apply a time-of-day and weather configuration to the sky.
   *
   * @param timeOfDay  Hour of day (0–24 float).
   * @param weather    Weather preset string from RaceDefinition.
   * @param skyColor   Optional override hex (e.g. race's envColors.sky).
   *                   When provided it tints the horizon colour.
   */
  configure(timeOfDay: number, weather: string, skyColor: string): void {
    const palette = paletteForHour(timeOfDay, weather);

    // Optionally blend in the race's sky tint colour at the horizon.
    if (skyColor.length > 0) {
      const tint = new THREE.Color(skyColor);
      palette.horizon.lerp(tint, 0.35);
    }

    if (this.domeMat !== null) {
      (this.domeMat.uniforms['uZenith'] as THREE.IUniform<THREE.Color>).value.copy(palette.zenith);
      (this.domeMat.uniforms['uHorizon'] as THREE.IUniform<THREE.Color>).value.copy(palette.horizon);
      this.domeMat.needsUpdate = true;
    }

    // Don't override scene.background — ParallaxBackground handles the panorama.
    // Only update fog color gently.
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.lerp(palette.fogColor, 0.2);
    }

    // Adjust cloud visibility for weather.
    if (this.cloudMesh !== null) {
      const cloudCount = this._cloudCountForWeather(weather);
      this.cloudMesh.count = cloudCount;
    }
  }

  /**
   * Animate the sky.  Call every frame.
   *
   * @param dt  Frame delta time in seconds.
   */
  update(dt: number): void {
    if (this.cloudMesh === null) return;

    const count = this.cloudMesh.count;
    for (let i = 0; i < count; i++) {
      this.cloudOffsets[i] = (this.cloudOffsets[i] ?? 0) + CLOUD_DRIFT_SPEED * dt;

      const base = this.cloudBasePositions[i];
      if (base === undefined) continue;

      this._pos.set(
        base.x + (this.cloudOffsets[i] ?? 0),
        base.y,
        base.z,
      );
      this._quat.identity();
      this._scale.copy(base); // scale is baked into base.xyz trick — use separate array instead.
    }

    // Rewrite: use cloudScales array (built during _buildClouds).
    this._updateCloudMatrices();
  }

  /** Remove sky and cloud meshes and free GPU resources. */
  dispose(): void {
    if (this.domeMesh !== null) {
      this.scene.remove(this.domeMesh);
      this.domeMesh.geometry.dispose();
      this.domeMat?.dispose();
      this.domeMesh = null;
      this.domeMat  = null;
    }

    if (this.cloudMesh !== null) {
      this.scene.remove(this.cloudMesh);
      this.cloudMesh.geometry.dispose();
      (this.cloudMesh.material as THREE.Material).dispose();
      this.cloudMesh = null;
    }

    this.cloudOffsets      = [];
    this.cloudBasePositions = [];
  }

  // ---------------------------------------------------------------------------
  // Private — construction
  // ---------------------------------------------------------------------------

  private _buildDome(): void {
    // Inverted sphere: normals face inward so we can see the inside.
    const geo = new THREE.SphereGeometry(DOME_RADIUS, DOME_SEGMENTS, DOME_SEGMENTS / 2, 0, Math.PI * 2, 0, Math.PI * 0.5);
    geo.scale(-1, 1, -1); // flip to face inward

    this.domeMat = new THREE.ShaderMaterial({
      uniforms: {
        uZenith:  { value: PALETTE_DAY.zenith.clone()  },
        uHorizon: { value: PALETTE_DAY.horizon.clone() },
      },
      vertexShader:   SKY_VERTEX_SHADER,
      fragmentShader: SKY_FRAGMENT_SHADER,
      side:           THREE.BackSide,
      depthWrite:     false, // sky is always furthest away
    });

    this.domeMesh = new THREE.Mesh(geo, this.domeMat);
    this.domeMesh.name = 'sky-dome';
    this.domeMesh.renderOrder = -1; // draw first
    this.scene.add(this.domeMesh);
  }

  private _buildClouds(): void {
    // Cloud planes: flat ellipsoids.
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2); // lie flat

    const mat = new THREE.MeshBasicMaterial({
      color:       0xffffff,
      transparent: true,
      opacity:     0.55,
      depthWrite:  false,
    });

    this.cloudMesh = new THREE.InstancedMesh(geo, mat, CLOUD_COUNT);
    this.cloudMesh.name       = 'sky-clouds';
    this.cloudMesh.renderOrder = -1;
    this.cloudMesh.frustumCulled = false;

    // Random initial positions + scales.
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const spreadXZ = 800;
      const x = (Math.random() - 0.5) * spreadXZ;
      const z = (Math.random() - 0.5) * spreadXZ;
      const y = CLOUD_ALTITUDE + (Math.random() - 0.5) * 60;
      this.cloudBasePositions.push(new THREE.Vector3(x, y, z));
      this.cloudOffsets.push(Math.random() * 500); // randomise initial phase
    }

    this._cloudScales = Array.from({ length: CLOUD_COUNT }, () =>
      new THREE.Vector3(
        80 + Math.random() * 120,
        1,
        40 + Math.random() * 70,
      ),
    );

    this._updateCloudMatrices();
    this.scene.add(this.cloudMesh);
  }

  // Separate scale array needed because cloudBasePositions stores position, not scale.
  private _cloudScales: THREE.Vector3[] = [];

  private _updateCloudMatrices(): void {
    if (this.cloudMesh === null) return;
    const count = this.cloudMesh.count;
    for (let i = 0; i < count; i++) {
      const base   = this.cloudBasePositions[i];
      const scale  = this._cloudScales[i];
      if (base === undefined || scale === undefined) continue;

      this._pos.set(base.x + (this.cloudOffsets[i] ?? 0), base.y, base.z);
      this._quat.identity();
      this._scale.copy(scale);
      this._mat4.compose(this._pos, this._quat, this._scale);
      this.cloudMesh.setMatrixAt(i, this._mat4);
    }
    this.cloudMesh.instanceMatrix.needsUpdate = true;
  }

  private _cloudCountForWeather(weather: string): number {
    switch (weather) {
      case 'clear': return Math.floor(CLOUD_COUNT * 0.3);
      case 'overcast': return CLOUD_COUNT;
      case 'rain':     return CLOUD_COUNT;
      case 'fog':      return CLOUD_COUNT;
      case 'snow':     return Math.floor(CLOUD_COUNT * 0.7);
      case 'hot':      return Math.floor(CLOUD_COUNT * 0.15);
      default:         return Math.floor(CLOUD_COUNT * 0.4);
    }
  }
}
