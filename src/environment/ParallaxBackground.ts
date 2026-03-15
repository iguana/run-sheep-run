/**
 * ParallaxBackground - Layered photographic backgrounds that scroll at
 * different speeds to create depth illusion.
 *
 * Three layers:
 *   1. Sky (farthest, barely moves)
 *   2. Mountains/far hills (slow scroll)
 *   3. Mid hills (medium scroll)
 *
 * Each layer is a large plane with a repeating texture, positioned behind
 * the track and scrolled based on the player's track progress.
 */

import * as THREE from 'three';


interface ParallaxLayer {
  mesh: THREE.Mesh;
  speed: number; // scroll multiplier relative to player progress
  baseX: number; // initial UV offset
}

export class ParallaxBackground {
  private readonly scene: THREE.Scene;
  private layers: ParallaxLayer[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Build the parallax layers. Call once when a race starts.
   */
  build(): void {
    this.dispose();

    // Dolomites panoramic backdrop — large cylinder surrounding the scene
    const loader = new THREE.TextureLoader();
    const tex = loader.load('/textures/backgrounds/dolomites.jpg');
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    });

    // Large cylinder — must be INSIDE the fog far plane to be visible
    const radius = 350;
    const height = 200;
    const geo = new THREE.CylinderGeometry(radius, radius, height, 64, 1, true);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = height * 0.35;
    mesh.renderOrder = -10;
    mesh.frustumCulled = false; // always render

    this.scene.add(mesh);
    this.layers.push({ mesh, speed: 0, baseX: 0 });
  }

  /**
   * Update parallax scroll based on player's forward progress and position.
   */
  update(playerPosition: THREE.Vector3, _playerProgress: number): void {
    // Keep the panorama cylinder centered on the player
    for (const layer of this.layers) {
      layer.mesh.position.x = playerPosition.x;
      layer.mesh.position.z = playerPosition.z;
    }
  }

  dispose(): void {
    for (const layer of this.layers) {
      this.scene.remove(layer.mesh);
      (layer.mesh.material as THREE.Material).dispose();
      layer.mesh.geometry.dispose();
    }
    this.layers = [];
  }
}
