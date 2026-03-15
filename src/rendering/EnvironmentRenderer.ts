/**
 * EnvironmentRenderer.ts - Procedural world decoration for sheeprunner.
 *
 * Generates low-poly environment props scattered either side of the race
 * track.  Uses InstancedMesh for performance — each prop type gets one
 * draw call regardless of instance count.
 *
 * Supported terrain types
 * =======================
 *   park     — trees (cone on cylinder) and flower clusters
 *   trail    — pine trees and boulders
 *   urban    — buildings (box), lamp-posts, park benches
 *   mountain — mountain peaks (large cones), pine trees, boulders
 *   desert   — cacti (stacked cylinders), sand dunes, arches
 *   beach    — palm trees, beach umbrellas, sand piles
 *   snow     — snow-capped pines, ice boulders
 *
 * LOD / culling
 * =============
 * updateVisibility rebuilds each InstancedMesh's instance matrices to
 * include only objects within ENV.CULL_DISTANCE of the camera.  This is
 * done by keeping a master list of all object transforms and copying only
 * the visible subset into the InstancedMesh each call.
 *
 * Memory model
 * ============
 * All geometries and materials are created once in _buildPropDefs and
 * re-used across instances.  dispose() frees them together with the scene
 * nodes.
 *
 * Performance notes
 * =================
 * - InstancedMesh avoids per-object draw calls.
 * - Geometry polygon counts are kept very low (5–8 sided cylinders/cones).
 * - No shadows cast by env props (they receive shadows from the sun only).
 * - LOD switching (show/hide clusters) happens on updateVisibility.
 */

import * as THREE from 'three';
import { ENV } from '../game/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EnvColors {
  ground: string;
  accent: string;
  sky: string;
}

/** One category of prop: a geometry+material pair with a list of transforms. */
interface PropDef {
  mesh: THREE.InstancedMesh;
  /** All world-space transforms for this prop type (not all may be visible). */
  transforms: THREE.Matrix4[];
}

// ---------------------------------------------------------------------------
// EnvironmentRenderer
// ---------------------------------------------------------------------------

export class EnvironmentRenderer {
  private readonly scene: THREE.Scene;
  private props: PropDef[] = [];

  // Scratch objects for matrix manipulation (avoid per-frame allocation).
  private readonly _pos   = new THREE.Vector3();
  private readonly _rot   = new THREE.Euler();
  private readonly _quat  = new THREE.Quaternion();
  private readonly _scale = new THREE.Vector3(1, 1, 1);

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Generate environment decorations for a race.
   * Disposes any previously generated environment.
   *
   * @param trackPoints  World-space centre-line points of the track.
   * @param terrainType  One of the supported terrain type strings.
   * @param envColors    Theme colors from the race definition.
   */
  generateEnvironment(
    trackPoints: THREE.Vector3[],
    terrainType: string,
    envColors: EnvColors,
  ): void {
    this.dispose();

    const propDefs = this._buildPropDefs(terrainType, envColors);
    if (propDefs.length === 0) return;

    // Scatter objects along the track.
    this._scatterProps(trackPoints, propDefs);

    // Build InstancedMesh for each prop type and add to scene.
    for (const def of propDefs) {
      this.scene.add(def.mesh);
      this.props.push(def);
    }

    // Do an initial full-scene visibility pass (camera at track start).
    if (trackPoints.length > 0) {
      this.updateVisibility(trackPoints[0]);
    }
  }

  /**
   * Update which instances are visible based on camera world position.
   * Call once per frame.
   *
   * @param cameraPosition  Current camera world-space position.
   */
  updateVisibility(cameraPosition: THREE.Vector3): void {
    const cullDist2 = ENV.CULL_DISTANCE * ENV.CULL_DISTANCE;

    for (const def of this.props) {
      let visIdx = 0;
      for (const m of def.transforms) {
        // Extract world position from the matrix's translation column.
        const ox = m.elements[12];
        const oz = m.elements[14];
        const dx = ox - cameraPosition.x;
        const dz = oz - cameraPosition.z;
        if (dx * dx + dz * dz < cullDist2) {
          def.mesh.setMatrixAt(visIdx++, m);
        }
      }
      def.mesh.count = visIdx;
      def.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * Remove all environment objects from the scene and release GPU resources.
   */
  dispose(): void {
    for (const def of this.props) {
      this.scene.remove(def.mesh);
      def.mesh.geometry.dispose();
      if (Array.isArray(def.mesh.material)) {
        def.mesh.material.forEach((m) => m.dispose());
      } else {
        def.mesh.material.dispose();
      }
    }
    this.props = [];
  }

  // ---------------------------------------------------------------------------
  // Private — prop type definitions per terrain
  // ---------------------------------------------------------------------------

  private _buildPropDefs(terrain: string, colors: EnvColors): PropDef[] {
    switch (terrain) {
      case 'park':    return this._parkProps(colors);
      case 'trail':   return this._trailProps(colors);
      case 'urban':   return this._urbanProps(colors);
      case 'mountain':return this._mountainProps(colors);
      case 'desert':  return this._desertProps(colors);
      case 'beach':   return this._beachProps(colors);
      case 'snow':    return this._snowProps(colors);
      default:        return this._parkProps(colors);
    }
  }

  // ------- Park ---------------------------------------------------------------

  private _parkProps(colors: EnvColors): PropDef[] {
    return [
      this._makePropDef(
        this._treeGeo(),
        lambert(colors.accent),
        ENV.MAX_OBJECTS * 0.6 | 0,
      ),
      this._makePropDef(
        this._bushGeo(),
        lambert('#6aab3a'),
        ENV.MAX_OBJECTS * 0.4 | 0,
      ),
    ];
  }

  // ------- Trail --------------------------------------------------------------

  private _trailProps(_colors: EnvColors): PropDef[] {
    return [
      this._makePropDef(this._pineGeo(), lambert('#2a6a2a'), ENV.MAX_OBJECTS * 0.7 | 0),
      this._makePropDef(this._boulderGeo(), lambert('#888880'), ENV.MAX_OBJECTS * 0.3 | 0),
    ];
  }

  // ------- Urban --------------------------------------------------------------

  private _urbanProps(_colors: EnvColors): PropDef[] {
    // Use a mix of soft pastel building colors so they read as cheerful props
    // rather than dark featureless blocks.
    const buildingColors = ['#f4c2c2', '#c2d4f4', '#c2f4d4', '#f4e6c2', '#e2c2f4'];
    const colorIdx = Math.floor(Math.random() * buildingColors.length);
    const buildingColor = buildingColors[colorIdx] ?? '#f4c2c2';
    return [
      this._makePropDef(this._buildingGeo(), lambert(buildingColor), ENV.MAX_OBJECTS * 0.5 | 0),
      this._makePropDef(this._lampPostGeo(), lambert('#e8e8e8'), ENV.MAX_OBJECTS * 0.3 | 0),
      this._makePropDef(this._bushGeo(), lambert('#7acc50'), ENV.MAX_OBJECTS * 0.2 | 0),
    ];
  }

  // ------- Mountain -----------------------------------------------------------

  private _mountainProps(_colors: EnvColors): PropDef[] {
    return [
      this._makePropDef(this._mountainPeakGeo(), lambert('#d8d0c8'), ENV.MAX_OBJECTS * 0.3 | 0),
      this._makePropDef(this._pineGeo(), lambert('#2a5a2a'), ENV.MAX_OBJECTS * 0.5 | 0),
      this._makePropDef(this._boulderGeo(), lambert('#908880'), ENV.MAX_OBJECTS * 0.2 | 0),
    ];
  }

  // ------- Desert -------------------------------------------------------------

  private _desertProps(_colors: EnvColors): PropDef[] {
    return [
      this._makePropDef(this._cactusGeo(), lambert('#4a7840'), ENV.MAX_OBJECTS * 0.5 | 0),
      this._makePropDef(this._boulderGeo(), lambert('#b8a870'), ENV.MAX_OBJECTS * 0.3 | 0),
      this._makePropDef(this._duneMoundGeo(), lambert('#d4b860'), ENV.MAX_OBJECTS * 0.2 | 0),
    ];
  }

  // ------- Beach --------------------------------------------------------------

  private _beachProps(_colors: EnvColors): PropDef[] {
    return [
      this._makePropDef(this._palmTreeGeo(), lambert('#5a8020'), ENV.MAX_OBJECTS * 0.5 | 0),
      this._makePropDef(this._boulderGeo(), lambert('#d4c8a0'), ENV.MAX_OBJECTS * 0.3 | 0),
      this._makePropDef(this._duneMoundGeo(), lambert('#e0d4a8'), ENV.MAX_OBJECTS * 0.2 | 0),
    ];
  }

  // ------- Snow ---------------------------------------------------------------

  private _snowProps(_colors: EnvColors): PropDef[] {
    return [
      this._makePropDef(this._snowPineGeo(), lambert('#e8f0f8'), ENV.MAX_OBJECTS * 0.6 | 0),
      this._makePropDef(this._boulderGeo(), lambert('#d0d8e0'), ENV.MAX_OBJECTS * 0.4 | 0),
    ];
  }

  // ---------------------------------------------------------------------------
  // Private — geometry factories
  // ---------------------------------------------------------------------------

  // Simple deciduous tree: cone canopy on a cylinder trunk.
  private _treeGeo(): THREE.BufferGeometry {
    const trunk   = new THREE.CylinderGeometry(0.12, 0.18, 1.2, 6);
    const canopy  = new THREE.ConeGeometry(0.8, 2.2, 7);
    _translate(trunk,  0, 0.6, 0);
    _translate(canopy, 0, 2.4, 0);
    return mergeGeos([trunk, canopy]);
  }

  // Conical pine (taller, narrower).
  private _pineGeo(): THREE.BufferGeometry {
    const trunk = new THREE.CylinderGeometry(0.1, 0.15, 1.0, 5);
    const tier1 = new THREE.ConeGeometry(0.9, 1.4, 6);
    const tier2 = new THREE.ConeGeometry(0.65, 1.2, 6);
    const tier3 = new THREE.ConeGeometry(0.4, 1.0, 6);
    _translate(trunk,  0, 0.5,  0);
    _translate(tier1,  0, 1.5,  0);
    _translate(tier2,  0, 2.3,  0);
    _translate(tier3,  0, 3.0,  0);
    return mergeGeos([trunk, tier1, tier2, tier3]);
  }

  // Snow-capped pine — same shape, white tips handled by material.
  private _snowPineGeo(): THREE.BufferGeometry {
    return this._pineGeo(); // material handles the white look
  }

  // Round bush — low-poly icosahedron.
  private _bushGeo(): THREE.BufferGeometry {
    return new THREE.IcosahedronGeometry(0.5, 1);
  }

  // Generic rounded boulder.
  private _boulderGeo(): THREE.BufferGeometry {
    const geo = new THREE.DodecahedronGeometry(0.6, 0);
    // Non-uniform scale via matrix — done in scatter instead.
    return geo;
  }

  // Cactus: a vertical cylinder with two side arms.
  private _cactusGeo(): THREE.BufferGeometry {
    const body  = new THREE.CylinderGeometry(0.18, 0.22, 2.0, 6);
    const armL  = new THREE.CylinderGeometry(0.10, 0.12, 0.9, 5);
    const armR  = new THREE.CylinderGeometry(0.10, 0.12, 0.9, 5);
    _translate(body, 0, 1.0, 0);
    // Horizontal arms rotated 90° around Z, then offset to the sides.
    _rotateZ(armL, Math.PI / 2);
    _translate(armL, -0.5, 1.2, 0);
    _rotateZ(armR, -Math.PI / 2);
    _translate(armR, 0.5, 1.4, 0);
    return mergeGeos([body, armL, armR]);
  }

  // Palm tree: trunk with angled crown.
  private _palmTreeGeo(): THREE.BufferGeometry {
    const trunk = new THREE.CylinderGeometry(0.12, 0.2, 2.5, 6);
    const crown = new THREE.ConeGeometry(0.9, 0.8, 8);
    _translate(trunk, 0, 1.25, 0);
    _translate(crown, 0, 3.0, 0);
    return mergeGeos([trunk, crown]);
  }

  // Mountain peak: large low-poly cone, roughly 6 m tall.
  private _mountainPeakGeo(): THREE.BufferGeometry {
    return new THREE.ConeGeometry(3.5, 7.0, 5);
  }

  // Urban building: smaller pastel box with a slightly protruding ledge.
  private _buildingGeo(): THREE.BufferGeometry {
    const body   = new THREE.BoxGeometry(1.4, 2.8, 1.4);
    const ledge  = new THREE.BoxGeometry(1.55, 0.12, 1.55);
    _translate(body,  0, 1.4, 0);
    _translate(ledge, 0, 2.86, 0);
    return mergeGeos([body, ledge]);
  }

  // Simple lamp-post: thin tall cylinder with a horizontal arm.
  private _lampPostGeo(): THREE.BufferGeometry {
    const post = new THREE.CylinderGeometry(0.04, 0.06, 3.5, 5);
    const arm  = new THREE.CylinderGeometry(0.03, 0.03, 0.6, 4);
    _translate(post, 0, 1.75, 0);
    _rotateZ(arm, Math.PI / 2);
    _translate(arm, 0.3, 3.4, 0);
    return mergeGeos([post, arm]);
  }

  // Low mound for desert dunes / beach piles.
  private _duneMoundGeo(): THREE.BufferGeometry {
    const geo = new THREE.SphereGeometry(1.4, 7, 4);
    // Flatten to look like a mound — done via non-uniform scale in scatter.
    return geo;
  }

  // ---------------------------------------------------------------------------
  // Private — InstancedMesh factory and scatter
  // ---------------------------------------------------------------------------

  private _makePropDef(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    maxCount: number,
  ): PropDef {
    const mesh = new THREE.InstancedMesh(geo, mat, maxCount);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false; // We do our own culling in updateVisibility.
    mesh.count = 0;
    return { mesh, transforms: [] };
  }

  /**
   * Distribute transforms randomly either side of the track.
   * Each segment of the track gets objects on both flanks.
   */
  private _scatterProps(
    trackPoints: THREE.Vector3[],
    defs: PropDef[],
  ): void {
    if (trackPoints.length < 2) return;

    const n = trackPoints.length - 1;

    // Stride: how many segments between object placements.
    const stride = Math.max(
      1,
      Math.ceil(n / (ENV.MAX_OBJECTS / Math.max(defs.length, 1))),
    );

    const dir   = new THREE.Vector3();
    const perp  = new THREE.Vector3();
    const pos   = new THREE.Vector3();

    for (let i = 0; i < n; i += stride) {
      const p0 = trackPoints[i];
      const p1 = trackPoints[Math.min(i + 1, n)];

      dir.subVectors(p1, p0).normalize();
      perp.set(-dir.z, 0, dir.x);

      for (const side of [-1, 1] as const) {
        // Pick a random def weighted roughly equally.
        const def = defs[Math.floor(Math.random() * defs.length)];
        if (def.transforms.length >= def.mesh.instanceMatrix.count) continue;

        const lateralOffset =
          ENV.OBJECT_SIDE_OFFSET_MIN +
          Math.random() * (ENV.OBJECT_SIDE_OFFSET_MAX - ENV.OBJECT_SIDE_OFFSET_MIN);

        const longitudinalJitter = (Math.random() - 0.5) * 4;

        pos.set(
          p0.x + perp.x * side * lateralOffset + dir.x * longitudinalJitter,
          p0.y,
          p0.z + perp.z * side * lateralOffset + dir.z * longitudinalJitter,
        );

        const yaw   = Math.random() * Math.PI * 2;
        const scale = 0.7 + Math.random() * 0.6;

        this._pos.copy(pos);
        this._rot.set(0, yaw, 0);
        this._quat.setFromEuler(this._rot);
        this._scale.set(scale, scale, scale);
        const m = new THREE.Matrix4();
        m.compose(this._pos, this._quat, this._scale);
        def.transforms.push(m);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Module-level helpers (no allocation; static geometry manipulation)
// ---------------------------------------------------------------------------

function lambert(hex: string): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color: new THREE.Color(hex) });
}

/**
 * Apply a translation to all positions in a BufferGeometry in-place.
 * Used to combine multiple geometries before merging.
 */
function _translate(geo: THREE.BufferGeometry, x: number, y: number, z: number): void {
  geo.translate(x, y, z);
}

/**
 * Apply a Z-axis rotation to a BufferGeometry in-place.
 */
function _rotateZ(geo: THREE.BufferGeometry, angle: number): void {
  geo.rotateZ(angle);
}

/**
 * Merge an array of BufferGeometries into one by concatenating their
 * position / normal / uv attributes and index buffers.
 *
 * This is a minimal merge that handles indexed geometries with position
 * and normal attributes.  It does not support morph targets or skinning.
 */
function mergeGeos(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Compute total vertex and index counts.
  let totalVerts = 0;
  let totalIdxs  = 0;
  let hasIndex   = false;

  // Ensure vertex normals exist on all pieces.
  for (const g of geos) {
    g.computeVertexNormals();
    if (g.index !== null) hasIndex = true;
  }

  for (const g of geos) {
    const pos = g.attributes['position'] as THREE.BufferAttribute;
    totalVerts += pos.count;
    if (hasIndex) {
      totalIdxs += g.index !== null ? g.index.count : pos.count;
    }
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals   = new Float32Array(totalVerts * 3);
  const uvs       = new Float32Array(totalVerts * 2);
  const indices   = hasIndex ? new Uint32Array(totalIdxs) : null;

  let vOffset = 0;
  let iOffset = 0;

  for (const g of geos) {
    const pos = g.attributes['position'] as THREE.BufferAttribute;
    const nor = g.attributes['normal']   as THREE.BufferAttribute | undefined;
    const uv  = g.attributes['uv']       as THREE.BufferAttribute | undefined;

    const vc = pos.count;

    positions.set(pos.array as Float32Array, vOffset * 3);
    if (nor !== undefined) normals.set(nor.array as Float32Array, vOffset * 3);
    if (uv  !== undefined) uvs.set(uv.array as Float32Array, vOffset * 2);

    if (indices !== null) {
      if (g.index !== null) {
        const srcIdx = g.index.array;
        for (let i = 0; i < srcIdx.length; i++) {
          indices[iOffset + i] = (srcIdx[i] as number) + vOffset;
        }
        iOffset += srcIdx.length;
      } else {
        // Non-indexed: generate sequential indices.
        for (let i = 0; i < vc; i++) {
          indices[iOffset + i] = vOffset + i;
        }
        iOffset += vc;
      }
    }

    vOffset += vc;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal',   new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));
  if (indices !== null) {
    merged.setIndex(new THREE.BufferAttribute(indices, 1));
  }

  // Dispose the source geometries to free memory.
  for (const g of geos) g.dispose();

  return merged;
}
