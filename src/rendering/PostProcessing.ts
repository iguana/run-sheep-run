/**
 * PostProcessing.ts - Lightweight custom post-process pipeline.
 *
 * Since EffectComposer from three/examples/jsm requires an additional
 * package reference and adds significant bundle weight, this module
 * implements a minimal two-pass post-process without it:
 *
 *   Pass 1 — scene renders into an off-screen RenderTarget.
 *   Pass 2 — a full-screen quad renders the target texture through a
 *             custom ShaderMaterial that applies all effects in one shader.
 *
 * Effects (all optional, all in the same pass)
 * ============================================
 *   Vignette   — dark edges, always on at configurable strength.
 *   Speed lines — radial blur from centre, driven by a 0–1 intensity.
 *   Bloom approx — a naive additive brightening of pixels above a luma
 *                  threshold; not physically correct but cheap on mobile.
 *
 * Mobile budget
 * =============
 * The shader uses a 9-sample radial blur for speed lines, which is heavy
 * enough for a nice look but well within mobile GPU shader unit budgets.
 * When speed line intensity is 0 the radial blur loop is skipped (the
 * driver's branch predictor handles this correctly for a uniform value).
 *
 * Resize
 * ======
 * Call resize() whenever the renderer canvas changes size so the
 * RenderTarget resolution stays accurate.
 *
 * Usage
 * =====
 *   const pp = new PostProcessing(renderer, scene, camera);
 *   pp.setBloom(true, 0.5);
 *   // in render loop:
 *   pp.setSpeedLines(speedNorm); // 0 = off
 *   pp.render();                 // replaces renderer.render(scene, camera)
 */

import * as THREE from 'three';
import { POST } from '../game/constants';

// ---------------------------------------------------------------------------
// Shader source strings
// ---------------------------------------------------------------------------

const VERT_SHADER = /* glsl */`
precision mediump float;

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Fragment shader that handles vignette, speed-lines, and bloom in one pass.
 *
 * Uniforms
 * --------
 *   tDiffuse        — scene render texture
 *   uVignette       — vignette strength [0, 1]
 *   uSpeedLines     — radial blur intensity [0, 1]
 *   uBloom          — bloom intensity [0, 1], 0 = disabled
 *   uBloomThreshold — luma threshold for bloom
 */
const FRAG_SHADER = /* glsl */`
precision mediump float;

uniform sampler2D tDiffuse;
uniform float uVignette;
uniform float uSpeedLines;
uniform float uBloom;
uniform float uBloomThreshold;

varying vec2 vUv;

// Luma weighting (ITU BT.709).
float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec2 uv = vUv;
  vec2 centre = vec2(0.5, 0.5);

  // ------------------------------------------------------------------ //
  // Speed-line radial blur
  // ------------------------------------------------------------------ //
  vec3 col = vec3(0.0);
  if (uSpeedLines > 0.001) {
    // Sample along the vector from the current pixel toward the centre.
    vec2 dir = centre - uv;
    float dist = length(dir);
    dir = normalize(dir);

    const int SAMPLES = 9;
    float step = uSpeedLines * 0.018;
    float weight = 1.0 / float(SAMPLES);

    for (int i = 0; i < SAMPLES; i++) {
      float t = float(i) * step * dist;
      col += texture2D(tDiffuse, uv + dir * t).rgb * weight;
    }
  } else {
    col = texture2D(tDiffuse, uv).rgb;
  }

  // ------------------------------------------------------------------ //
  // Bloom (additive bright-pixel glow approximation)
  // ------------------------------------------------------------------ //
  if (uBloom > 0.001) {
    // Sample a small neighbourhood and accumulate bright pixels.
    vec3 bloomAccum = vec3(0.0);
    float bw = 1.0 / 512.0; // fixed texel step; acceptable for the look
    const int BR = 2;        // 5x5 neighbourhood
    for (int bx = -BR; bx <= BR; bx++) {
      for (int by = -BR; by <= BR; by++) {
        vec3 s = texture2D(tDiffuse, uv + vec2(float(bx), float(by)) * bw).rgb;
        float lum = luma(s);
        // Soft threshold: ramp up above uBloomThreshold.
        float contrib = max(0.0, lum - uBloomThreshold) / (1.0 - uBloomThreshold);
        bloomAccum += s * contrib;
      }
    }
    // Normalise (5x5 = 25 samples).
    bloomAccum /= 25.0;
    col += bloomAccum * uBloom;
  }

  // ------------------------------------------------------------------ //
  // Vignette — smooth circular darkening toward edges
  // ------------------------------------------------------------------ //
  if (uVignette > 0.001) {
    vec2 fromCentre = uv - centre;
    // Elliptical distance (slightly wider than tall to match aspect).
    float vDist = length(fromCentre * vec2(1.0, 1.35));
    float vFactor = smoothstep(0.35, 0.85, vDist);
    col = mix(col, col * 0.0, vFactor * uVignette);
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------------------------------------------------------------------------
// PostProcessing
// ---------------------------------------------------------------------------

export class PostProcessing {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.Camera;

  // Off-screen target the scene renders into.
  private renderTarget: THREE.WebGLRenderTarget;

  // Full-screen quad objects.
  private readonly fsScene: THREE.Scene;
  private readonly fsCamera: THREE.OrthographicCamera;
  private readonly fsMaterial: THREE.ShaderMaterial;

  // Effect state (stored for external query / debug; uniforms are source of truth).
  private speedLinesIntensity: number = 0;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    this.renderer = renderer;
    this.scene    = scene;
    this.camera   = camera;

    // Build off-screen render target matching current renderer size.
    const size = new THREE.Vector2();
    renderer.getSize(size);
    this.renderTarget = new THREE.WebGLRenderTarget(size.x, size.y, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });

    // Build the full-screen pass.
    this.fsMaterial = new THREE.ShaderMaterial({
      vertexShader:   VERT_SHADER,
      fragmentShader: FRAG_SHADER,
      uniforms: {
        tDiffuse:        { value: this.renderTarget.texture },
        uVignette:       { value: POST.VIGNETTE_STRENGTH },
        uSpeedLines:     { value: 0.0 },
        uBloom:          { value: 0.0 },
        uBloomThreshold: { value: 0.75 },
      },
      depthTest:  false,
      depthWrite: false,
    });

    // Full-screen triangle covers NDC [-1, 1] in X and Y.
    const fsGeo = new THREE.BufferGeometry();
    fsGeo.setAttribute('position', new THREE.BufferAttribute(
      new Float32Array([-1, -1, 0,  3, -1, 0,  -1, 3, 0]), 3,
    ));
    fsGeo.setAttribute('uv', new THREE.BufferAttribute(
      new Float32Array([0, 0,  2, 0,  0, 2]), 2,
    ));

    this.fsScene  = new THREE.Scene();
    this.fsCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.fsScene.add(new THREE.Mesh(fsGeo, this.fsMaterial));
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Enable or disable the bloom approximation.
   * @param enabled  Whether bloom is active.
   * @param strength Bloom intensity [0, 1]. Defaults to POST.BLOOM_STRENGTH.
   */
  setBloom(enabled: boolean, strength: number = POST.BLOOM_STRENGTH): void {
    this.fsMaterial.uniforms['uBloom'].value = enabled ? strength : 0.0;
  }

  /**
   * Set speed-line radial blur intensity.
   * @param intensity 0 = off, 1 = maximum effect.
   */
  setSpeedLines(intensity: number): void {
    this.speedLinesIntensity = Math.max(0, Math.min(1, intensity));
    this.fsMaterial.uniforms['uSpeedLines'].value = this.speedLinesIntensity;
  }

  /**
   * Render a frame through the post-process pipeline.
   * Replaces calling renderer.render(scene, camera) directly.
   */
  render(): void {
    // Pass 1: render scene to off-screen target.
    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.render(this.scene, this.camera);

    // Pass 2: composite through effects shader to the canvas.
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.fsScene, this.fsCamera);
  }

  /**
   * Resize the render target to match a new canvas resolution.
   * Call from RenderSystem.resize().
   *
   * @param width   New pixel width.
   * @param height  New pixel height.
   */
  resize(width: number, height: number): void {
    this.renderTarget.setSize(width, height);
  }

  /**
   * Release GPU resources.
   */
  dispose(): void {
    this.renderTarget.dispose();
    this.fsMaterial.dispose();
    this.fsScene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
      }
    });
  }
}
