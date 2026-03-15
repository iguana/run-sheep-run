/**
 * TerrainSystem - Procedural ground terrain using chunk-based loading.
 *
 * Strategy:
 *   - The track is divided into logical "sections". For each section a flat
 *     (slightly subdivided) ground plane is generated, vertex-coloured to
 *     match the terrain type, and positioned below/around the track.
 *   - A fixed pool of chunk meshes is maintained. As the player advances,
 *     chunks behind the camera are repositioned ahead (ring-buffer pattern).
 *   - No heightmap or noise is used — keeping the geometry dead-simple so
 *     draw calls stay minimal on mobile.
 *
 * Terrain colours
 *   grass  → green family
 *   dirt   → brown family
 *   rock   → grey family
 *   desert → sandy/gold family
 */

import * as THREE from 'three';
import { TERRAIN_CONST } from '../game/constants';
import { asset } from '../game/assetPath';
import type { TrackPath } from './TrackPath';
import type { TerrainType } from '../data/races';

interface TerrainPalette {
  primary: number;    // THREE color int
  secondary: number;
  edge: number;       // colour where terrain meets track edge
}

interface TerrainChunk {
  mesh: THREE.Mesh;
  /** Centre position along the track (metres). */
  trackAnchor: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Width of the ground plane on each side of the track (metres). */
const CHUNK_HALF_WIDTH = 80;

/** Chunk length along the track (metres). */
const CHUNK_LENGTH = TERRAIN_CONST.CHUNK_SIZE;

/** Number of vertex subdivisions in both X and Z for colour variation. */
const CHUNK_SEGS = 12;

/** How many chunks to keep alive simultaneously. */
const ACTIVE_CHUNKS = 8;

/** Sample the track spline at this interval when placing chunk geometry. */
const TRACK_SAMPLE_STEP = 8; // metres

// ---------------------------------------------------------------------------
// Colour palettes per terrain type
// ---------------------------------------------------------------------------

const PALETTES: Record<string, TerrainPalette> = {
  grass: {
    primary: 0x4a7c3f,
    secondary: 0x3d6634,
    edge: 0x5a8c4f,
  },
  dirt: {
    primary: 0x8b6914,
    secondary: 0x7a5a0e,
    edge: 0xa07a28,
  },
  rock: {
    primary: 0x7a7a7a,
    secondary: 0x636363,
    edge: 0x8a8a8a,
  },
  desert: {
    primary: 0xd4a756,
    secondary: 0xc49040,
    edge: 0xe0b866,
  },
  urban: {
    primary: 0x6b7280,
    secondary: 0x555f6e,
    edge: 0x7d8794,
  },
  trail: {
    primary: 0x6b8f5e,
    secondary: 0x5a7a4e,
    edge: 0x7a9e6c,
  },
  mountain: {
    primary: 0x8a9e8a,
    secondary: 0x78887a,
    edge: 0x98ac98,
  },
  coastal: {
    primary: 0xb5a898,
    secondary: 0xa09080,
    edge: 0xc4b8a8,
  },
  park: {
    primary: 0x5d8a44,
    secondary: 0x4e7438,
    edge: 0x6d9a54,
  },
};

const PALETTE_FALLBACK: TerrainPalette = {
  primary: 0x55aa55,
  secondary: 0x448844,
  edge: 0x66bb66,
};

// ---------------------------------------------------------------------------
// Class
// ---------------------------------------------------------------------------

export class TerrainSystem {
  private readonly scene: THREE.Scene;
  private chunks: TerrainChunk[] = [];
  private palette: TerrainPalette = PALETTE_FALLBACK;
  private trackPath: TrackPath | null = null;
  private totalTrackLength: number = 0;

  /** Shared material — textured grass with vertex colour tint. */
  private readonly material: THREE.MeshLambertMaterial;
  private readonly grassTexture: THREE.Texture;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const loader = new THREE.TextureLoader();
    this.grassTexture = loader.load(asset('/textures/terrain/grass.jpg'));
    this.grassTexture.wrapS = THREE.RepeatWrapping;
    this.grassTexture.wrapT = THREE.RepeatWrapping;
    this.grassTexture.repeat.set(8, 8);
    this.grassTexture.colorSpace = THREE.SRGBColorSpace;

    this.material = new THREE.MeshLambertMaterial({
      map: this.grassTexture,
      vertexColors: true,
      side: THREE.FrontSide,
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Build the initial set of terrain chunks around the track.
   * Chunks are spread evenly along the track from distance 0.
   */
  generate(
    trackPath: TrackPath,
    terrainType: TerrainType,
    groundColor: string,
  ): void {
    this.trackPath = trackPath;
    this.totalTrackLength = trackPath.totalLength;
    this.palette = this._resolvePalette(terrainType, groundColor);

    // Clear any previously generated terrain.
    this.dispose();

    // Pre-create the chunk pool positioned at regular intervals.
    const spacing = this.totalTrackLength / ACTIVE_CHUNKS;
    for (let i = 0; i < ACTIVE_CHUNKS; i++) {
      const anchor = i * spacing;
      const chunk = this._createChunk(anchor);
      this.chunks.push(chunk);
      this.scene.add(chunk.mesh);
    }
  }

  /**
   * Reposition chunks that have fallen behind the player so they appear ahead.
   * Called every frame; designed to be cheap (no allocations in steady state).
   */
  update(playerPosition: THREE.Vector3): void {
    if (this.trackPath === null || this.chunks.length === 0) return;

    // Estimate player distance along track using the closest forward approach.
    const playerDist = this._estimateTrackDistance(playerPosition);

    const halfWindow = (ACTIVE_CHUNKS / 2) * CHUNK_LENGTH;

    for (const chunk of this.chunks) {
      const distToPlayer = playerDist - chunk.trackAnchor;

      // If this chunk is more than one chunk length behind, recycle it ahead.
      if (distToPlayer > halfWindow + CHUNK_LENGTH) {
        const newAnchor = chunk.trackAnchor + ACTIVE_CHUNKS * CHUNK_LENGTH;
        this._repositionChunk(chunk, newAnchor);
      }
    }
  }

  dispose(): void {
    for (const chunk of this.chunks) {
      this.scene.remove(chunk.mesh);
      chunk.mesh.geometry.dispose();
    }
    this.chunks = [];
  }

  // ---------------------------------------------------------------------------
  // Chunk creation
  // ---------------------------------------------------------------------------

  private _createChunk(trackAnchor: number): TerrainChunk {
    const geometry = this._buildChunkGeometry(trackAnchor);
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.receiveShadow = true;
    return { mesh, trackAnchor };
  }

  /**
   * Repositions an existing chunk to a new track anchor, rebuilding its
   * geometry to conform to the new section of track.
   */
  private _repositionChunk(chunk: TerrainChunk, newAnchor: number): void {
    chunk.mesh.geometry.dispose();
    chunk.mesh.geometry = this._buildChunkGeometry(newAnchor);
    chunk.trackAnchor = newAnchor;
  }

  /**
   * Build a PlaneGeometry-like quad grid that follows the track curve for its
   * `CHUNK_LENGTH` span, vertex-coloured by terrain palette.
   *
   * The geometry is constructed in world space (no additional mesh transform
   * needed — mesh stays at origin).
   */
  private _buildChunkGeometry(trackAnchor: number): THREE.BufferGeometry {
    if (this.trackPath === null) return new THREE.BufferGeometry();

    // Number of samples along the chunk's length.
    const lengthSegs = Math.ceil(CHUNK_LENGTH / TRACK_SAMPLE_STEP);
    const widthSegs = CHUNK_SEGS;

    const positions: number[] = [];
    const colors: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];

    const colPrimary = new THREE.Color(this.palette.primary);
    const colSecondary = new THREE.Color(this.palette.secondary);
    const colEdge = new THREE.Color(this.palette.edge);

    const tmpColor = new THREE.Color();

    // Build vertex grid.
    for (let li = 0; li <= lengthSegs; li++) {
      const dist = trackAnchor + (li / lengthSegs) * CHUNK_LENGTH;

      const { position: trackCentre, heading } =
        this.trackPath.progressToWorld(
          dist / this.trackPath.totalLength,
          0,
        );

      // Right direction from heading.
      const rightX = Math.sin(heading + Math.PI / 2);
      const rightZ = Math.cos(heading + Math.PI / 2);

      for (let wi = 0; wi <= widthSegs; wi++) {
        const t = wi / widthSegs; // 0 = left edge, 1 = right edge
        const lateral = (t - 0.5) * 2 * CHUNK_HALF_WIDTH;

        const x = trackCentre.x + rightX * lateral;
        const z = trackCentre.z + rightZ * lateral;
        const y = trackCentre.y - 0.05; // slightly below track surface

        positions.push(x, y, z);
        normals.push(0, 1, 0);

        // Vertex colour: blend from edge→primary based on proximity to track.
        const edgeProximity = Math.max(
          0,
          1 - Math.abs(lateral) / (CHUNK_HALF_WIDTH * 0.5),
        );
        const noiseOffset = (Math.sin(li * 3.7 + wi * 2.3) * 0.5 + 0.5) * 0.12;
        tmpColor
          .copy(colSecondary)
          .lerp(colPrimary, edgeProximity + noiseOffset)
          .lerp(colEdge, Math.max(0, edgeProximity - 0.7) * 3);

        colors.push(tmpColor.r, tmpColor.g, tmpColor.b);
      }
    }

    // Build index buffer (two triangles per quad).
    const cols = widthSegs + 1;
    for (let li = 0; li < lengthSegs; li++) {
      for (let wi = 0; wi < widthSegs; wi++) {
        const a = li * cols + wi;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    return geo;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Estimate the track distance closest to a world position.
   * Uses a coarse sample across the full track (fast; not exact).
   */
  private _estimateTrackDistance(pos: THREE.Vector3): number {
    if (this.trackPath === null) return 0;
    const samples = 100;
    let bestDist = Infinity;
    let bestT = 0;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const pt = this.trackPath.getPointAtDistance(t * this.totalTrackLength);
      const d = pos.distanceToSquared(pt);
      if (d < bestDist) {
        bestDist = d;
        bestT = t;
      }
    }
    return bestT * this.totalTrackLength;
  }

  private _resolvePalette(terrainType: TerrainType, _groundColor: string): TerrainPalette {
    return PALETTES[terrainType] ?? PALETTE_FALLBACK;
  }
}
