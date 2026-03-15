/**
 * RenderSystem.ts - Core Three.js renderer setup for sheeprunner.
 *
 * Owns the scene, perspective camera, WebGL renderer, and the primary
 * lighting rig. Designed for a MeshToonMaterial / MeshLambertMaterial
 * pipeline — no PBR materials so the lighting model stays cheap on mobile.
 *
 * Lighting notes:
 *   - DirectionalLight with shadow: acts as the "sun".
 *   - HemisphereLight: sky/ground ambient that avoids flat shading on toon
 *     materials without the cost of multiple shadow-casting lights.
 *   - No PointLights or SpotLights in the base rig (added by gameplay code).
 *
 * Shadow budget: 1024x1024 PCF soft map. Fits comfortably in mobile VRAM
 * without banding at standard play distances.
 */

import * as THREE from 'three';
import { RENDER } from '../game/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WeatherCondition = 'clear' | 'cloudy' | 'rain' | 'fog';

interface LightingPreset {
  sunColor: number;
  sunIntensity: number;
  skyColor: number;
  groundColor: number;
  hemisphereIntensity: number;
  fogColor: string;
}

// ---------------------------------------------------------------------------
// Lighting presets — indexed by (hour bucket, weather)
// ---------------------------------------------------------------------------

const HOUR_BUCKET_COUNT = 4; // dawn / day / dusk / night

function buildPreset(
  sunHex: number,
  sunI: number,
  skyHex: number,
  groundHex: number,
  hemiI: number,
  fog: string,
): LightingPreset {
  return {
    sunColor: sunHex,
    sunIntensity: sunI,
    skyColor: skyHex,
    groundColor: groundHex,
    hemisphereIntensity: hemiI,
    fogColor: fog,
  };
}

// [dawn, day, dusk, night] × [clear, cloudy, rain, fog]
const LIGHTING_PRESETS: Record<WeatherCondition, LightingPreset[]> = {
  clear: [
    buildPreset(0xffb870, 1.8, 0x87ceeb, 0x6a8040, 0.9, '#e8d0b8'), // dawn
    buildPreset(0xfff5e0, 2.2, 0x87ceeb, 0x5a7830, 1.0, '#c8e8f8'), // day
    buildPreset(0xff8840, 2.0, 0xff9060, 0x804020, 0.85, '#e88840'), // dusk
    buildPreset(0x3040a0, 0.3, 0x101828, 0x081018, 0.25, '#080c18'), // night
  ],
  cloudy: [
    buildPreset(0xc0a878, 1.0, 0x889098, 0x507050, 0.7, '#c0b8b0'), // dawn
    buildPreset(0xe8e0d0, 1.4, 0xa8b0b8, 0x506050, 0.75, '#b8c0c8'), // day
    buildPreset(0xc07850, 1.2, 0x907080, 0x604838, 0.65, '#c09070'), // dusk
    buildPreset(0x303848, 0.2, 0x181c20, 0x0c1010, 0.2, '#0c1010'), // night
  ],
  rain: [
    buildPreset(0x808888, 0.6, 0x606870, 0x3a4840, 0.5, '#a0a8a0'), // dawn
    buildPreset(0xa0a8a8, 0.8, 0x6a7278, 0x3a4838, 0.55, '#889090'), // day
    buildPreset(0x807878, 0.6, 0x605860, 0x382830, 0.45, '#806868'), // dusk
    buildPreset(0x202428, 0.15, 0x101418, 0x080c0c, 0.15, '#080c0c'), // night
  ],
  fog: [
    buildPreset(0xd0c8a8, 0.7, 0xc8c0b0, 0x7a7860, 0.6, '#d0ccc0'), // dawn
    buildPreset(0xe0d8c0, 0.9, 0xd0ccc0, 0x888870, 0.65, '#d4d0c8'), // day
    buildPreset(0xc0a870, 0.7, 0xb09878, 0x706040, 0.55, '#c0a870'), // dusk
    buildPreset(0x484840, 0.15, 0x202020, 0x101010, 0.2, '#181818'), // night
  ],
};

function getHourBucket(timeOfDay: number): number {
  // timeOfDay is 0–24
  if (timeOfDay < 6) return 3;   // night
  if (timeOfDay < 9) return 0;   // dawn
  if (timeOfDay < 18) return 1;  // day
  if (timeOfDay < 21) return 2;  // dusk
  return 3;                       // night
}

// ---------------------------------------------------------------------------
// RenderSystem
// ---------------------------------------------------------------------------

export class RenderSystem {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;

  private directionalLight: THREE.DirectionalLight;
  private hemisphereLight: THREE.HemisphereLight;
  // Kept to satisfy the declared shape; directionalLight replaces the role.
  private ambientLight: THREE.AmbientLight;

  private readonly resizeObserver: ResizeObserver;

  constructor(container: HTMLElement) {
    // ----- Scene -----
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#c8e8f8');

    // ----- Camera -----
    this.camera = new THREE.PerspectiveCamera(
      RENDER.FOV_BASE,
      container.clientWidth / container.clientHeight,
      RENDER.CAMERA_NEAR,
      RENDER.CAMERA_FAR,
    );
    this.camera.position.set(0, 5, 10);

    // ----- Renderer -----
    this.renderer = new THREE.WebGLRenderer({
      antialias: window.devicePixelRatio < 2,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, RENDER.MAX_PIXEL_RATIO),
    );
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Tone mapping appropriate for toon-style (avoids washed-out brights).
    this.renderer.toneMapping = THREE.NoToneMapping;
    container.appendChild(this.renderer.domElement);

    // ----- Lighting rig -----
    // Hemisphere provides ambient sky/ground bounce — important for toon shading.
    this.hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x5a7830, 1.0);
    this.scene.add(this.hemisphereLight);

    // Directional acts as the sun with shadows.
    this.directionalLight = new THREE.DirectionalLight(0xfff5e0, 2.2);
    this.directionalLight.position.set(30, 60, 20);
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.setScalar(RENDER.SHADOW_MAP_SIZE);
    this.directionalLight.shadow.camera.near = 1;
    this.directionalLight.shadow.camera.far = 200;
    this.directionalLight.shadow.camera.left = -40;
    this.directionalLight.shadow.camera.right = 40;
    this.directionalLight.shadow.camera.top = 40;
    this.directionalLight.shadow.camera.bottom = -40;
    this.directionalLight.shadow.bias = -0.0005;
    this.scene.add(this.directionalLight);
    // Shadow camera follows the directional light's target which we keep at origin.
    this.scene.add(this.directionalLight.target);

    // Minimal fill ambient for areas shadowed from both above sources.
    this.ambientLight = new THREE.AmbientLight(0x404060, 0.2);
    this.scene.add(this.ambientLight);

    // Apply warm golden-hour defaults on construction.
    this.setLighting(8.5, 'clear'); // ~8:30 AM golden

    // Default atmospheric fog.
    this.setFog('#c8e8f8', RENDER.FOG_NEAR, RENDER.FOG_FAR);

    // ----- Auto-resize -----
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
  }

  /**
   * Update renderer and camera aspect to match the container's current size.
   * Called automatically by ResizeObserver; can also be called manually.
   */
  resize(): void {
    const canvas = this.renderer.domElement;
    const parent = canvas.parentElement;
    if (parent === null) return;

    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Set linear fog on the scene.
   * @param color  CSS hex string, e.g. '#c8e8f8'
   * @param near   Distance from camera at which fog begins (world units)
   * @param far    Distance at which objects are fully obscured
   */
  setFog(color: string, near: number, far: number): void {
    this.scene.fog = new THREE.Fog(new THREE.Color(color), near, far);
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.set(color);
    }
  }

  /**
   * Adjust sun angle, color, and sky color based on time of day and weather.
   * @param timeOfDay  Hours in 24-h range [0, 24)
   * @param weather    Weather condition string
   */
  setLighting(timeOfDay: number, weather: string): void {
    const condition = (weather as WeatherCondition) in LIGHTING_PRESETS
      ? (weather as WeatherCondition)
      : 'clear';
    const bucket = getHourBucket(timeOfDay);
    const preset = LIGHTING_PRESETS[condition][bucket];

    this.directionalLight.color.setHex(preset.sunColor);
    this.directionalLight.intensity = preset.sunIntensity;

    this.hemisphereLight.color.setHex(preset.skyColor);
    this.hemisphereLight.groundColor.setHex(preset.groundColor);
    this.hemisphereLight.intensity = preset.hemisphereIntensity;

    // Reposition sun to match time of day bucket.
    const sunAngle = ((timeOfDay / 24) * Math.PI * 2) - Math.PI / 2;
    this.directionalLight.position.set(
      Math.cos(sunAngle) * 60,
      Math.abs(Math.sin(sunAngle)) * 80 + 10,
      20,
    );

    this.setFog(preset.fogColor, RENDER.FOG_NEAR, RENDER.FOG_FAR);
  }

  /**
   * Submit a render frame. Call once per animation frame after updating scene.
   */
  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Release GPU resources and remove the canvas from the DOM.
   */
  dispose(): void {
    this.resizeObserver.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

// Re-export the count constant so tests can verify we're under budget.
export { HOUR_BUCKET_COUNT };
