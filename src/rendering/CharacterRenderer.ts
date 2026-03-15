/**
 * CharacterRenderer.ts - Procedural low-poly animal mesh builder and animator.
 *
 * All characters are built entirely from Three.js primitives — no external
 * assets required. Materials are MeshToonMaterial for the stylised look.
 *
 * Mesh hierarchy (each animal group)
 * ===================================
 *   Group (root, positioned by physics)
 *     ├─ body          (sphere / merged icosahedra for wool puffs)
 *     ├─ head          (sphere)
 *     │   ├─ eyeL      (sphere → white sclera)
 *     │   │   └─ pupilL (sphere → dark pupil, parented so it follows eye)
 *     │   ├─ eyeR
 *     │   │   └─ pupilR
 *     │   ├─ earL      (cone)
 *     │   └─ earR      (cone)
 *     ├─ legFrontL     (cylinder body + hoof sphere)
 *     ├─ legFrontR
 *     ├─ legBackL
 *     ├─ legBackR
 *     └─ tail          (small sphere / cone)
 *
 * userData keys on the root Group
 * ================================
 *   leftFrontLeg   → THREE.Object3D  (pivot for front-left leg)
 *   rightFrontLeg  → THREE.Object3D
 *   leftBackLeg    → THREE.Object3D
 *   rightBackLeg   → THREE.Object3D
 *   bodyMesh       → THREE.Object3D  (for bob animation)
 *
 * Pivots are placed at the top of each leg group so rotation swings the
 * leg naturally around the hip/shoulder attachment point.
 *
 * Animation
 * =========
 * updateRunAnimation mutates the rotation of each leg pivot using a
 * sinusoidal gait and shifts the body mesh vertically for bounce.
 */

import * as THREE from 'three';
import type { AnimalRunner } from '../data/characters';
import { ANIM } from '../game/constants';
import { asset } from '../game/assetPath';

// ---------------------------------------------------------------------------
// Texture-based sprite character cache
// ---------------------------------------------------------------------------

const _textureLoader = new THREE.TextureLoader();
const _spriteCache = new Map<string, THREE.Texture | null>();

/** Species-to-filename mapping for sprite textures (single idle frame). */
const SPRITE_FILES: Record<string, string> = {
  sheep: asset('/textures/characters/sheep_back.png'),
  fox: asset('/textures/characters/fox_back.png'),
  wolf: asset('/textures/characters/wolf_back.png'),
  cheetah: asset('/textures/characters/cheetah_back.png'),
  horse: asset('/textures/characters/horse.png'),
  bear: asset('/textures/characters/bear.png'),
  deer: asset('/textures/characters/deer.png'),
};

/** Multi-frame animation sequences — frames cycle every PI/2 radians of legPhase. */
const SPRITE_ANIM_FILES: Record<string, string[]> = {
  sheep: [
    asset('/textures/characters/sheep_run_1.png'),
    asset('/textures/characters/sheep_run_2.png'),
    asset('/textures/characters/sheep_run_3.png'),
    asset('/textures/characters/sheep_run_4.png'),
  ],
};

function loadSpriteTexture(species: string): THREE.Texture | null {
  const key = species.toLowerCase();
  if (_spriteCache.has(key)) return _spriteCache.get(key)!;

  const file = SPRITE_FILES[key];
  if (!file) { _spriteCache.set(key, null); return null; }

  const tex = _textureLoader.load(file, (loaded) => {
    // Remove green/white background once the image is actually loaded
    _removeBackground(loaded);
  });
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  _spriteCache.set(key, tex);
  return tex;
}

/** Remove white or green background from a loaded texture using canvas. */
function _removeBackground(tex: THREE.Texture): void {
  const img = tex.image as HTMLImageElement;
  if (!img || !img.width) return;

  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;

  for (let i = 0; i < px.length; i += 4) {
    const r = px[i]!;
    const g = px[i + 1]!;
    const b = px[i + 2]!;

    // Remove bright green screen (generous thresholds)
    if (g > 130 && g > r * 1.3 && g > b * 1.3) {
      px[i + 3] = 0;
    }
    // Remove white/near-white background
    else if (r > 230 && g > 230 && b > 230) {
      px[i + 3] = 0;
    }
    // Remove gray backgrounds (uniform gray)
    else if (Math.abs(r - g) < 15 && Math.abs(g - b) < 15 && r > 100 && r < 200) {
      // Only remove if in the bottom 30% of the image (ground plane area)
      const pixelIndex = i / 4;
      const row = Math.floor(pixelIndex / canvas.width);
      if (row > canvas.height * 0.7) {
        px[i + 3] = 0;
      }
    }
    // Soften edges near green (anti-aliasing fringe)
    else if (g > 120 && g > r * 1.1 && g > b * 1.1) {
      const greenDominance = g / Math.max(1, (r + b) / 2);
      if (greenDominance > 1.2) {
        px[i + 3] = Math.round(255 * Math.max(0, 1 - (greenDominance - 1.2) / 0.5));
      }
    }
  }

  ctx.putImageData(data, 0, 0);
  tex.image = canvas;
  tex.needsUpdate = true;
}

/**
 * Create a billboard sprite character from a texture.
 * Returns a Group with a Sprite child, positioned at the origin.
 */
function createSpriteCharacter(species: string): THREE.Group | null {
  const tex = loadSpriteTexture(species);
  if (!tex) return null;

  const root = new THREE.Group();
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.1,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.8, 1.8, 1); // world-space size — smaller and proportional
  sprite.position.y = 0.9; // lift off ground
  sprite.castShadow = false;

  root.add(sprite);

  // Store refs for animation
  root.userData['isSprite'] = true;
  root.userData['spriteRef'] = sprite;
  root.userData['baseY'] = 1.5;
  root.userData['currentFrame'] = 0;

  // Pre-load animation frames if available for this species.
  const animFiles = SPRITE_ANIM_FILES[species.toLowerCase()];
  if (animFiles && animFiles.length > 0) {
    const frames: THREE.Texture[] = animFiles.map((file) => {
      const t = _textureLoader.load(file, (loaded) => _removeBackground(loaded));
      t.colorSpace = THREE.SRGBColorSpace;
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      return t;
    });
    root.userData['spriteFrames'] = frames;
  }

  return root;
}

// ---------------------------------------------------------------------------
// Shared geometry / material caches
// Geometries are shared — only materials are per-instance.
// ---------------------------------------------------------------------------

let _icoGeo: THREE.IcosahedronGeometry | null = null;
let _coneGeo: THREE.ConeGeometry | null = null;
let _smallSphereGeo: THREE.SphereGeometry | null = null;
let _tinyDotGeo: THREE.SphereGeometry | null = null;

function icoGeo(): THREE.IcosahedronGeometry {
  if (_icoGeo === null) _icoGeo = new THREE.IcosahedronGeometry(0.5, 1);
  return _icoGeo;
}
function coneGeo(): THREE.ConeGeometry {
  if (_coneGeo === null) _coneGeo = new THREE.ConeGeometry(0.12, 0.3, 5);
  return _coneGeo;
}
function smallSphereGeo(): THREE.SphereGeometry {
  if (_smallSphereGeo === null) _smallSphereGeo = new THREE.SphereGeometry(0.1, 6, 4);
  return _smallSphereGeo;
}
function tinyDotGeo(): THREE.SphereGeometry {
  if (_tinyDotGeo === null) _tinyDotGeo = new THREE.SphereGeometry(0.05, 5, 4);
  return _tinyDotGeo;
}

// ---------------------------------------------------------------------------
// Helper — toon material factory
// ---------------------------------------------------------------------------

function toon(hex: string | number, opts?: Partial<THREE.MeshToonMaterialParameters>): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color: new THREE.Color(hex), ...opts });
}

// ---------------------------------------------------------------------------
// Helper — build one leg group
// Returns an Object3D pivot whose origin is at the attachment point (hip).
// The pivot's userData.legMesh gives access to the visible mesh if needed.
// ---------------------------------------------------------------------------

function buildLeg(
  legLength: number,
  shaftColor: string,
  hoofColor: string,
): THREE.Object3D {
  const pivot = new THREE.Object3D();

  const legMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.09, legLength, 6),
    toon(shaftColor),
  );
  legMesh.position.y = -legLength / 2;
  legMesh.castShadow = true;
  pivot.add(legMesh);

  // Hoof — flattened sphere at the bottom of the leg.
  const hoofMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 6, 4),
    toon(hoofColor),
  );
  hoofMesh.scale.set(1.0, 0.6, 1.0);
  hoofMesh.position.y = -legLength;
  pivot.add(hoofMesh);

  return pivot;
}

// ---------------------------------------------------------------------------
// Helper — build an eye pair on a head mesh
// ---------------------------------------------------------------------------

function addEyes(
  head: THREE.Object3D,
  radius: number,
  eyeOffsetX: number,
  eyeOffsetY: number,
  eyeOffsetZ: number,
  eyeWhiteColor: string = '#ffffff',
  pupilColor: string = '#111111',
): void {
  const whiteMat = toon(eyeWhiteColor);
  const pupilMat = toon(pupilColor);

  for (const side of [-1, 1]) {
    const eyeGroup = new THREE.Object3D();
    eyeGroup.position.set(side * eyeOffsetX, eyeOffsetY, eyeOffsetZ);

    const sclera = new THREE.Mesh(smallSphereGeo(), whiteMat);
    sclera.scale.setScalar(radius);
    eyeGroup.add(sclera);

    const pupil = new THREE.Mesh(tinyDotGeo(), pupilMat);
    pupil.position.z = radius * 0.6;
    eyeGroup.add(pupil);

    head.add(eyeGroup);
  }
}

// ---------------------------------------------------------------------------
// Helper — attach wool puffs (icosahedra) for the sheep body
// ---------------------------------------------------------------------------

function addWoolPuffs(
  parent: THREE.Object3D,
  mat: THREE.MeshToonMaterial,
  bodyScaleX: number,
  bodyScaleZ: number,
): void {
  // Distribute 6 puffs across the body surface for a fluffy silhouette.
  const puffPositions: [number, number, number, number][] = [
    // [x, y, z, scale]
    [0.0,  0.38,  0.0,  0.55], // top crown puff
    [0.32, 0.2,   0.1,  0.42],
    [-0.32, 0.2,  0.1,  0.42],
    [0.0,  0.15,  0.38, 0.45],
    [0.0,  0.15, -0.38, 0.45],
    [0.0, -0.1,   0.0,  0.48], // belly puff (slightly smaller)
  ];

  for (const [px, py, pz, s] of puffPositions) {
    const puff = new THREE.Mesh(icoGeo(), mat);
    puff.position.set(px * bodyScaleX, py, pz * bodyScaleZ);
    puff.scale.setScalar(s);
    puff.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      0,
    );
    puff.castShadow = false; // body receives shadow; puffs don't need to cast
    parent.add(puff);
  }
}

// ---------------------------------------------------------------------------
// CharacterRenderer
// ---------------------------------------------------------------------------

export class CharacterRenderer {
  // ---------------------------------------------------------------------------
  // Sheep — the player character
  // ---------------------------------------------------------------------------

  /**
   * Create the player sheep mesh group.
   * Returns a Group ready to be added to the scene. The root is positioned
   * at world origin; callers should update .position each frame.
   */
  static createSheep(): THREE.Group {
    // Try sprite texture first
    const spriteRoot = createSpriteCharacter('sheep');
    if (spriteRoot) return spriteRoot;

    const root = new THREE.Group();

    const bodyColor = '#f0ece0';
    const hoofColor = '#2a1a0e';
    const faceColor = '#2a1a0e';

    const woolMat = toon(bodyColor);
    const darkMat = toon(faceColor);

    // -- Body ----------------------------------------------------------------
    // Main body sphere, slightly squashed.
    const bodyGroup = new THREE.Group();
    bodyGroup.position.y = 1.1;

    const bodySphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.52, 8, 6),
      woolMat,
    );
    bodySphere.scale.set(1.0, 0.88, 0.9);
    bodySphere.castShadow = true;
    bodySphere.receiveShadow = true;
    bodyGroup.add(bodySphere);

    // Wool puffs for fluffy look.
    addWoolPuffs(bodyGroup, woolMat, 1.0, 0.9);

    root.add(bodyGroup);

    // -- Head ----------------------------------------------------------------
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.6, -0.55);

    const headMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 8, 6),
      darkMat,
    );
    headMesh.castShadow = true;
    headGroup.add(headMesh);

    // Muzzle — small ellipsoid protruding forward.
    const muzzleMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 6, 4),
      toon('#c8b090'),
    );
    muzzleMesh.scale.set(0.9, 0.7, 0.6);
    muzzleMesh.position.set(0, -0.06, -0.22);
    headGroup.add(muzzleMesh);

    addEyes(headGroup, 1.0, 0.13, 0.06, -0.24);

    // Ears — floppy cones tilted outward.
    const earMat = toon('#d4a878');
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(coneGeo(), earMat);
      ear.position.set(side * 0.22, 0.18, 0.1);
      ear.rotation.z = side * 0.4;
      ear.rotation.x = 0.2;
      headGroup.add(ear);
    }

    root.add(headGroup);

    // -- Legs ----------------------------------------------------------------
    const legLL = 0.7;
    const legPositions: [string, number, number, number][] = [
      ['leftFrontLeg',  -0.22, 1.0, -0.28],
      ['rightFrontLeg',  0.22, 1.0, -0.28],
      ['leftBackLeg',   -0.22, 1.0,  0.28],
      ['rightBackLeg',   0.22, 1.0,  0.28],
    ];

    for (const [key, lx, ly, lz] of legPositions) {
      const leg = buildLeg(legLL, bodyColor, hoofColor);
      leg.position.set(lx, ly, lz);
      root.add(leg);
      root.userData[key] = leg;
    }

    // -- Tail ----------------------------------------------------------------
    const tail = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 6, 4),
      woolMat,
    );
    tail.position.set(0, 1.15, 0.52);
    root.add(tail);

    root.userData['bodyMesh']  = bodyGroup;
    root.userData['bodyRestY'] = bodyGroup.position.y;

    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) obj.receiveShadow = true;
    });

    return root;
  }

  // ---------------------------------------------------------------------------
  // Competitor animals
  // ---------------------------------------------------------------------------

  /**
   * Create a competitor animal mesh group based on its AnimalRunner data.
   */
  static createCompetitor(animal: AnimalRunner): THREE.Group {
    // Try sprite texture first (match by species)
    const speciesKey = animal.species.toLowerCase().split(' ').pop() ?? '';
    const spriteRoot = createSpriteCharacter(speciesKey);
    if (spriteRoot) return spriteRoot;

    const root = new THREE.Group();
    const { bodyScale, legLength } = animal;
    // Resolve colour palette — prefer the explicit `colors` sub-object, then
    // fall back to the legacy flat fields for data that predates the grouped format.
    const colors = animal.colors ?? {
      body:      animal.bodyColor   ?? '#cccccc',
      accent:    animal.accentColor ?? '#aaaaaa',
      eyeWhite:  '#ffffff',
      pupil:     '#111111',
      extremity: animal.detailColor ?? '#222222',
    };

    // -- Body ----------------------------------------------------------------
    const bodyGroup = new THREE.Group();
    bodyGroup.position.y = 0.9 + legLength * 0.35;

    const bodyMat = toon(colors.body);
    const accentMat = toon(colors.accent);

    const bodySphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 8, 6),
      bodyMat,
    );
    bodySphere.scale.set(bodyScale.x, bodyScale.y * 0.85, bodyScale.z);
    bodySphere.castShadow = true;
    bodySphere.receiveShadow = true;
    bodyGroup.add(bodySphere);

    // Belly patch — accent color, smaller sphere blended into underside.
    const belly = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 7, 5),
      accentMat,
    );
    belly.scale.set(bodyScale.x * 0.7, bodyScale.y * 0.5, bodyScale.z * 0.7);
    belly.position.y = -0.15;
    bodyGroup.add(belly);

    root.add(bodyGroup);

    // -- Head ----------------------------------------------------------------
    const headGroup = new THREE.Group();
    const headY = bodyGroup.position.y + bodyScale.y * 0.5;
    const headZ = -(bodyScale.z * 0.5 + 0.18);
    headGroup.position.set(0, headY, headZ);

    const headRadius = 0.24 * Math.max(bodyScale.x, bodyScale.y);
    const headMesh = new THREE.Mesh(
      new THREE.SphereGeometry(headRadius, 8, 6),
      bodyMat,
    );
    headMesh.castShadow = true;
    headGroup.add(headMesh);

    // Muzzle / snout varies by species — use accent color.
    const muzzle = new THREE.Mesh(
      new THREE.SphereGeometry(headRadius * 0.6, 6, 4),
      accentMat,
    );
    muzzle.scale.set(0.9, 0.65, 0.55);
    muzzle.position.set(0, -headRadius * 0.2, -headRadius * 0.8);
    headGroup.add(muzzle);

    addEyes(
      headGroup,
      0.9,
      headRadius * 0.5,
      headRadius * 0.2,
      -(headRadius * 0.85),
      colors.eyeWhite,
      colors.pupil,
    );

    // Species-specific ear shape.
    CharacterRenderer._addEars(headGroup, animal, headRadius);

    root.add(headGroup);

    // -- Legs ----------------------------------------------------------------
    const baseY = bodyGroup.position.y - bodyScale.y * 0.4;
    const spreadX = bodyScale.x * 0.28;
    const spreadZ = bodyScale.z * 0.32;
    const legLen = legLength * 0.65;

    const legDefs: [string, number, number][] = [
      ['leftFrontLeg',  -spreadX, -spreadZ],
      ['rightFrontLeg',  spreadX, -spreadZ],
      ['leftBackLeg',   -spreadX,  spreadZ],
      ['rightBackLeg',   spreadX,  spreadZ],
    ];

    for (const [key, lx, lz] of legDefs) {
      const leg = buildLeg(legLen, colors.body, colors.extremity);
      leg.position.set(lx, baseY, lz);
      root.add(leg);
      root.userData[key] = leg;
    }

    // -- Tail ----------------------------------------------------------------
    const tail = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 5, 4),
      accentMat,
    );
    tail.position.set(0, bodyGroup.position.y, bodyScale.z * 0.52);
    root.add(tail);

    root.userData['bodyMesh']  = bodyGroup;
    root.userData['bodyRestY'] = bodyGroup.position.y;

    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) obj.receiveShadow = true;
    });

    return root;
  }

  // ---------------------------------------------------------------------------
  // Running animation
  // ---------------------------------------------------------------------------

  /**
   * Drive the running gait animation each frame.
   *
   * @param mesh      The character Group created by createSheep/createCompetitor.
   * @param legPhase  Accumulated gait phase in radians (advances with distance).
   * @param bodyBob   Current body-bob displacement in world units (from physics).
   * @param speed     Current speed in m/s (scales amplitude).
   */
  static updateRunAnimation(
    mesh: THREE.Group,
    legPhase: number,
    bodyBob: number,
    speed: number,
  ): void {
    const { userData } = mesh;

    // Sprite-based character: subtle bob and frame cycling.
    if (userData['isSprite']) {
      const sprite = userData['spriteRef'] as THREE.Sprite | undefined;
      const baseY = (userData['baseY'] as number) ?? 1.5;
      if (sprite) {
        const speedNorm = Math.min(speed / 12, 1);
        // Very subtle vertical bob — Math.sin gives a smooth curve.
        sprite.position.y = baseY + Math.sin(legPhase * 2) * 0.04 * speedNorm;

        // Cycle animation frames every PI/2 radians of legPhase.
        const frames = userData['spriteFrames'] as THREE.Texture[] | undefined;
        if (frames && frames.length > 1 && speed > 0.5) {
          const frameIndex = Math.floor(legPhase / (Math.PI / 2)) % frames.length;
          const clampedIndex = ((frameIndex % frames.length) + frames.length) % frames.length;
          if (userData['currentFrame'] !== clampedIndex) {
            userData['currentFrame'] = clampedIndex;
            const newTex = frames[clampedIndex];
            if (newTex) {
              (sprite.material as THREE.SpriteMaterial).map = newTex;
              (sprite.material as THREE.SpriteMaterial).needsUpdate = true;
            }
          }
        }
      }
      return;
    }

    // Speed normalised to [0, 1] for amplitude scaling.
    const speedNorm = Math.min(speed / 12, 1);
    const amp = ANIM.LEG_AMPLITUDE * speedNorm;
    const backPhase = legPhase + ANIM.LEG_BACK_PHASE_OFFSET;

    // Front legs swing opposite to each other, back legs offset by π.
    const lfl = userData['leftFrontLeg'] as THREE.Object3D | undefined;
    const rfl = userData['rightFrontLeg'] as THREE.Object3D | undefined;
    const lbl = userData['leftBackLeg'] as THREE.Object3D | undefined;
    const rbl = userData['rightBackLeg'] as THREE.Object3D | undefined;

    if (lfl !== undefined) lfl.rotation.x = Math.sin(legPhase) * amp;
    if (rfl !== undefined) rfl.rotation.x = Math.sin(legPhase + Math.PI) * amp;
    if (lbl !== undefined) lbl.rotation.x = Math.sin(backPhase) * amp;
    if (rbl !== undefined) rbl.rotation.x = Math.sin(backPhase + Math.PI) * amp;

    // Body bob — shift the body group relative to its rest Y to avoid drift.
    const bodyMesh = userData['bodyMesh'] as THREE.Object3D | undefined;
    if (bodyMesh !== undefined) {
      // bodyRestY is stamped onto userData at construction time.
      const restY = (userData['bodyRestY'] as number | undefined) ?? bodyMesh.position.y;
      if (userData['bodyRestY'] === undefined) userData['bodyRestY'] = restY;
      bodyMesh.position.y = restY + bodyBob * ANIM.BODY_BOB_AMPLITUDE * speedNorm;
    }
  }

  // ---------------------------------------------------------------------------
  // Private — species-specific ear geometry
  // ---------------------------------------------------------------------------

  private static _addEars(
    headGroup: THREE.Object3D,
    animal: AnimalRunner,
    headRadius: number,
  ): void {
    const earMat = toon(animal.accentColor);
    const bodyMat = toon(animal.bodyColor);
    // Match on the lowercased species display string, which may be multi-word.
    const sp = animal.species.toLowerCase();

    if (sp.includes('hare') || sp.includes('rabbit')) {
      // Long upright ears for lagomorphs.
      for (const side of [-1, 1] as const) {
        const ear = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.1, 0.5, 5),
          earMat,
        );
        ear.position.set(side * headRadius * 0.55, headRadius * 0.75, 0);
        ear.rotation.z = side * 0.08;
        headGroup.add(ear);
        const inner = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035, 0.07, 0.42, 5),
          bodyMat,
        );
        inner.position.z = -0.025;
        ear.add(inner);
      }
    } else if (
      sp.includes('fox') || sp.includes('wolf') || sp.includes('cheetah') ||
      sp.includes('husky') || sp.includes('cat')
    ) {
      // Tall, pointed ears for canids and felids.
      for (const side of [-1, 1] as const) {
        const ear = new THREE.Mesh(
          new THREE.ConeGeometry(0.14, 0.28, 5),
          earMat,
        );
        ear.position.set(side * headRadius * 0.55, headRadius * 0.65, 0);
        ear.rotation.z = side * 0.2;
        headGroup.add(ear);
      }
    } else if (sp.includes('dog')) {
      // Wide floppy ears.
      for (const side of [-1, 1] as const) {
        const ear = new THREE.Mesh(
          new THREE.ConeGeometry(0.18, 0.25, 5),
          earMat,
        );
        ear.position.set(side * headRadius * 0.6, 0, 0.05);
        ear.rotation.set(0.3, 0, side * 0.7);
        headGroup.add(ear);
      }
    } else if (sp.includes('bear') || sp.includes('pig')) {
      // Small round nubbin ears.
      for (const side of [-1, 1] as const) {
        const ear = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 5, 4),
          earMat,
        );
        ear.position.set(side * headRadius * 0.5, headRadius * 0.55, 0.05);
        headGroup.add(ear);
      }
    } else if (sp.includes('ostrich') || sp.includes('duck')) {
      // Bill / beak replaces ears.
      const billColor = animal.detailColor ?? animal.accentColor;
      const bill = new THREE.Mesh(
        new THREE.ConeGeometry(0.09, 0.22, 5),
        toon(billColor),
      );
      bill.rotation.x = Math.PI / 2;
      bill.position.set(0, -headRadius * 0.15, -headRadius * 0.95);
      headGroup.add(bill);
    } else {
      // Default: medium side-flaring ear (ungulates, kangaroo, sheep fallback).
      for (const side of [-1, 1] as const) {
        const ear = new THREE.Mesh(coneGeo(), earMat);
        ear.position.set(side * headRadius * 0.58, headRadius * 0.45, 0.05);
        ear.rotation.set(0.2, 0, side * 0.45);
        headGroup.add(ear);
      }
    }
  }
}
