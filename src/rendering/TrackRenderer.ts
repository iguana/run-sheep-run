/**
 * TrackRenderer.ts - Procedural race-track mesh generation.
 *
 * The track is a flat ribbon extruded along an array of centre-line points.
 * Each pair of consecutive points produces a quad (two triangles) for the
 * road surface, and a narrower quad on each edge for the kerb stripe.
 *
 * Visibility budget
 * =================
 * For very long races the full track mesh can have tens of thousands of
 * triangles.  updateVisibility culls quads that are far behind or ahead
 * of the player by toggling a range of drawRanges on the geometry, which
 * avoids uploading new geometry data every frame.
 *
 * Coordinate convention
 * =====================
 * The path points are in world-space (x, y=0, z).  The ribbon lies in the
 * XZ plane with Y as up.  Slope is not yet modelled — all quads are flat.
 *
 * Material
 * ========
 * MeshLambertMaterial with the track's theme color.  Toon shading is not
 * used here because the track surface reads better without the cel-shade
 * border lines.  Edge stripes use a separate slightly-brighter material.
 */

import * as THREE from 'three';
import { asset as _asset } from '../game/assetPath';

// ---------------------------------------------------------------------------
// TrackRenderer
// ---------------------------------------------------------------------------

export class TrackRenderer {
  private readonly scene: THREE.Scene;

  private trackMesh: THREE.Mesh | null = null;
  private edgeMeshL: THREE.Mesh | null = null;
  private edgeMeshR: THREE.Mesh | null = null;

  /** Number of quads in the full track (one per path segment). */
  private segmentCount: number = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Generate track and edge stripe meshes from the given centre-line points.
   * Disposes any previously generated meshes.
   *
   * @param points    World-space centre-line positions.
   * @param width     Full track width in world units.
   * @param color     Track surface color (CSS hex string).
   * @param edgeColor Kerb/stripe color (CSS hex string).
   */
  generateTrack(
    points: THREE.Vector3[],
    width: number,
    color: string,
    edgeColor: string,
  ): void {
    this.dispose();

    if (points.length < 2) return;

    const halfW      = width / 2;
    const edgeW      = Math.max(0.4, width * 0.06); // ~6% of track width
    const n          = points.length - 1;
    this.segmentCount = n;

    // Build the ribbon geometry.
    const road = this._buildRibbon(points, -halfW, halfW);
    const edgeL = this._buildRibbon(points, -halfW, -(halfW - edgeW));
    const edgeR = this._buildRibbon(points,  halfW - edgeW, halfW);

    // Load track surface texture
    const loader = new THREE.TextureLoader();
    const trackTex = loader.load(_asset('/textures/terrain/track.jpg'));
    trackTex.wrapS = THREE.RepeatWrapping;
    trackTex.wrapT = THREE.RepeatWrapping;
    trackTex.repeat.set(1, points.length * 0.3);
    trackTex.colorSpace = THREE.SRGBColorSpace;

    const roadMat  = new THREE.MeshLambertMaterial({
      map: trackTex,
      color: new THREE.Color(color),
    });
    const edgeMat  = new THREE.MeshLambertMaterial({ color: new THREE.Color(edgeColor) });

    this.trackMesh = new THREE.Mesh(road, roadMat);
    this.trackMesh.receiveShadow = true;
    this.trackMesh.name = 'track-surface';

    this.edgeMeshL = new THREE.Mesh(edgeL, edgeMat);
    this.edgeMeshL.receiveShadow = true;
    this.edgeMeshL.name = 'track-edge-left';

    this.edgeMeshR = new THREE.Mesh(edgeR, edgeMat);
    this.edgeMeshR.receiveShadow = true;
    this.edgeMeshR.name = 'track-edge-right';

    this.scene.add(this.trackMesh, this.edgeMeshL, this.edgeMeshR);
  }

  /**
   * Restrict the track's draw range so that only segments near the player
   * are submitted to the GPU.  Called each frame with the player's progress
   * (0 = start, 1 = finish) and a desired view distance in world units.
   *
   * @param playerProgress  Normalised player distance [0, 1].
   * @param viewDistance    How many world units of track to show around player.
   */
  updateVisibility(playerProgress: number, viewDistance: number): void {
    if (this.trackMesh === null) return;

    const n = this.segmentCount;
    if (n === 0) return;

    // Estimate segments per world unit from the stored segment count and
    // the known track length proxy (segments are roughly 1–2 m each).
    // We use the simpler index-space approach to avoid needing the full
    // path array at call time.
    const playerSeg = Math.floor(playerProgress * n);
    const visSegs   = Math.ceil(viewDistance * 0.5); // ~2 m per segment
    const startSeg  = Math.max(0, playerSeg - Math.floor(visSegs * 0.3));
    const endSeg    = Math.min(n - 1, playerSeg + visSegs);

    // Each segment = 2 triangles = 6 indices.
    const indexStart = startSeg * 6;
    const indexCount = (endSeg - startSeg + 1) * 6;

    for (const mesh of [this.trackMesh, this.edgeMeshL, this.edgeMeshR]) {
      if (mesh === null) continue;
      mesh.geometry.setDrawRange(indexStart, indexCount);
    }
  }

  /**
   * Remove track meshes from the scene and release GPU geometry.
   */
  dispose(): void {
    for (const mesh of [this.trackMesh, this.edgeMeshL, this.edgeMeshR]) {
      if (mesh === null) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else {
        mesh.material.dispose();
      }
    }
    this.trackMesh = null;
    this.edgeMeshL = null;
    this.edgeMeshR = null;
    this.segmentCount = 0;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Build a flat ribbon BufferGeometry along the path points.
   *
   * @param points   Centre-line positions.
   * @param leftOff  Lateral offset of the left edge from centre (negative = left).
   * @param rightOff Lateral offset of the right edge from centre (positive = right).
   */
  private _buildRibbon(
    points: THREE.Vector3[],
    leftOff: number,
    rightOff: number,
  ): THREE.BufferGeometry {
    const n = points.length - 1; // number of quads

    // 2 vertices per side per segment + the shared end cap vertex.
    // Each segment: 4 vertices (left0, right0, left1, right1); indices shared.
    // We store (n+1) pairs of edge vertices.
    const vertCount = (n + 1) * 2;
    const idxCount  = n * 6;

    const positions = new Float32Array(vertCount * 3);
    const uvs       = new Float32Array(vertCount * 2);
    const indices   = new Uint32Array(idxCount);

    // Scratch vectors.
    const cur    = new THREE.Vector3();
    const next   = new THREE.Vector3();
    const dir    = new THREE.Vector3();
    const left   = new THREE.Vector3();

    for (let i = 0; i <= n; i++) {
      cur.copy(points[i]);

      // Segment direction — use forward or backward diff at ends.
      if (i < n) {
        next.copy(points[i + 1]);
        dir.subVectors(next, cur).normalize();
      }
      // At the last point we reuse the last computed dir so the ribbon
      // closes cleanly without a degenerate normal.

      // Left-hand perpendicular in XZ (world up = Y).
      left.set(-dir.z, 0, dir.x);

      const vi = i * 2;

      // Left edge vertex.
      positions[(vi)     * 3 + 0] = cur.x + left.x * leftOff;
      positions[(vi)     * 3 + 1] = cur.y + TRACK_Y_BIAS;
      positions[(vi)     * 3 + 2] = cur.z + left.z * leftOff;

      // Right edge vertex.
      positions[(vi + 1) * 3 + 0] = cur.x + left.x * rightOff;
      positions[(vi + 1) * 3 + 1] = cur.y + TRACK_Y_BIAS;
      positions[(vi + 1) * 3 + 2] = cur.z + left.z * rightOff;

      // UVs — U spans left-to-right, V along track length.
      const vCoord = i / n;
      uvs[(vi)     * 2 + 0] = 0;
      uvs[(vi)     * 2 + 1] = vCoord;
      uvs[(vi + 1) * 2 + 0] = 1;
      uvs[(vi + 1) * 2 + 1] = vCoord;
    }

    // Fill index buffer: two CCW triangles per quad.
    for (let i = 0; i < n; i++) {
      const base = i * 2;
      const ii   = i * 6;
      // Triangle 1: left0, right0, right1
      indices[ii + 0] = base;
      indices[ii + 1] = base + 1;
      indices[ii + 2] = base + 3;
      // Triangle 2: left0, right1, left1
      indices[ii + 3] = base;
      indices[ii + 4] = base + 3;
      indices[ii + 5] = base + 2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();
    return geo;
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Slight Y offset keeps the track surface just above the terrain ground plane
 * to prevent Z-fighting.
 */
const TRACK_Y_BIAS = 0.01;
