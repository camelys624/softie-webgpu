import * as THREE from 'three/webgpu';
import { bumpMap, cameraPosition, color, mix, mx_noise_float, normalView, normalWorld, pmremTexture, positionLocal, positionViewDirection, positionWorld, reflect, uniform, vec3, vec4 } from 'three/tsl';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { FaceMotion } from './face-motion.js';

const HEIGHT = 2.36;
const WIDTH = 1.66;
const DEPTH = 1.18;

export function radiusAt(y) {
  const t = Math.pow(THREE.MathUtils.clamp((y - 0.035) / HEIGHT, 0, 1), 1 / 1.28);
  const c = t * 2 - 1;
  return Math.pow(Math.sqrt(Math.max(0, 1 - c * c)), 0.82) * (1 - 0.07 * c);
}

export function frontAt(x, y) {
  const r = radiusAt(y);
  return DEPTH * Math.sqrt(Math.max(0, r * r - (x / WIDTH) ** 2));
}

function remember(geometry) {
  geometry.userData.rest = Float32Array.from(geometry.attributes.position.array);
  geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  return geometry;
}

function makeBody() {
  const sphere = new THREE.SphereGeometry(1, 96, 64);
  sphere.deleteAttribute('uv');
  sphere.deleteAttribute('normal');
  const geometry = mergeVertices(sphere, 1e-5);
  sphere.dispose();
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const sy = positions.getY(i);
    const theta = Math.acos(THREE.MathUtils.clamp(sy, -1, 1));
    const radial = Math.sin(theta);
    const radius = Math.pow(radial, 0.82) * (1 - 0.07 * sy);
    const y = 0.035 + HEIGHT * Math.pow((sy + 1) / 2, 1.28);
    // Lift the existing crown into a rounded tuft with a smooth, pinched-in shoulder.
    const tuft = 0.42 * Math.exp(-theta * theta / 0.055);
    const s = radial > 0.00001 ? radius / radial : 0;
    positions.setXYZ(i, positions.getX(i) * WIDTH * s, y + tuft, positions.getZ(i) * DEPTH * s);
  }
  geometry.computeVertexNormals();
  return remember(geometry);
}

// Sculpted surface patches, not rigid eye meshes. Every point uses the body field.
function makeEye(cx) {
  const geometry = new THREE.SphereGeometry(1, 32, 24);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = cx + p.getX(i) * 0.128;
    const y = 1.20 + p.getY(i) * 0.137;
    p.setXYZ(i, x, y, frontAt(x, y) + 0.009 + p.getZ(i) * 0.055);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function makeMouth(open = false) {
  const points = [];
  for (let i = 0; i <= 24; i++) {
    const angle = (i / 24 - 0.5) * (open ? Math.PI * 2 : 2.7);
    const x = (open ? 0.052 : 0.1) * Math.sin(angle);
    const y = (open ? 1.075 : 1.111) - (open ? 0.065 : 0.076) * Math.cos(angle);
    points.push(new THREE.Vector3(x, y, frontAt(x, y) + 0.023));
  }
  const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, 0.014, 12, false);
  const caps = [points[0], points.at(-1)].map(point =>
    new THREE.SphereGeometry(0.014, 12, 8).translate(point.x, point.y, point.z));
  const mouth = mergeGeometries([tube, ...caps]);
  [tube, ...caps].forEach(geometry => geometry.dispose());
  return mouth;
}

function makeStarGeometry(outerRadius = 0.052, innerRadius = 0.023, thickness = 0.015) {
  const shape = new THREE.Shape();
  const points = 5;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.007,
    bevelThickness: 0.007,
  });
  geometry.center();
  return geometry;
}

// Accessory 1: Worker ID Card Badge (Clip-on chest badge + AI-generated cute pass)
function makeBadge() {
  const group = new THREE.Group();
  group.name = 'accessory-badge';

  const cx = 0.44;
  const cy = 0.65;
  const cz = frontAt(cx, cy) + 0.040;

  // Natural slant and tilt tangent to curved chest, giving breathing room to eyes
  const transform = new THREE.Matrix4();
  const rot = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.06, 0.26, 0.22));
  const pos = new THREE.Matrix4().makeTranslation(cx, cy, cz);
  transform.multiplyMatrices(pos, rot);

  // 1. Scaled metallic crocodile clip at top
  const clipBody = new THREE.BoxGeometry(0.058, 0.070, 0.026);
  clipBody.translate(0, 0.225, 0.008);
  const clipPin = new THREE.CylinderGeometry(0.009, 0.009, 0.060, 12);
  clipPin.rotateZ(Math.PI / 2);
  clipPin.translate(0, 0.238, 0.015);
  const strap = new THREE.BoxGeometry(0.028, 0.048, 0.010);
  strap.translate(0, 0.200, 0.005);
  const clipGeomRaw = mergeGeometries([clipBody, clipPin, strap]);
  clipBody.dispose(); clipPin.dispose(); strap.dispose();
  clipGeomRaw.applyMatrix4(transform);
  const clipGeom = remember(clipGeomRaw);

  // 2. Scaled acrylic card holder frame (~1.3x size for clear readability)
  const holderGeomRaw = new THREE.BoxGeometry(0.290, 0.435, 0.012);
  holderGeomRaw.applyMatrix4(transform);
  const holderGeom = remember(holderGeomRaw);

  // 3. Card face with texture
  const cardGeomRaw = new THREE.PlaneGeometry(0.265, 0.410);
  const cardTransform = new THREE.Matrix4();
  const cardOffset = new THREE.Matrix4().makeTranslation(0, 0, 0.008);
  cardTransform.multiplyMatrices(transform, cardOffset);
  cardGeomRaw.applyMatrix4(cardTransform);
  const cardGeom = remember(cardGeomRaw);

  // All badge materials use transparent: true & depthWrite: false so they render
  // in the post-transmission composite pass. This completely prevents the glass body
  // from capturing and refractively projecting an inverted duplicate inside the jelly belly!
  const clipMat = new THREE.MeshStandardNodeMaterial({
    color: '#e2e8f0', roughness: 0.16, metalness: 0.88,
    transparent: true, depthWrite: false,
  });
  const holderMat = new THREE.MeshStandardNodeMaterial({
    color: '#1a2233', roughness: 0.35, metalness: 0.12,
    transparent: true, depthWrite: false,
  });

  const isBrowser = typeof document !== 'undefined';
  let cardMat;
  if (isBrowser) {
    // Generate immediate high-res Canvas texture fallback
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 420;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Background & header
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 256, 420);
      ctx.fillStyle = '#1c283f';
      ctx.fillRect(0, 0, 256, 120);
      ctx.fillStyle = '#67e8f9';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SOFTIE CORP', 128, 70);
      // Mini slime avatar circle
      ctx.beginPath();
      ctx.arc(128, 190, 48, 0, Math.PI * 2);
      ctx.fillStyle = '#a5f3fc';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#1c283f';
      ctx.stroke();
      // Eyes & smile
      ctx.fillStyle = '#1c283f';
      ctx.beginPath(); ctx.arc(114, 185, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(142, 185, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(128, 195, 12, 0.2, Math.PI - 0.2); ctx.stroke();
      // Text info
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('SOFTIE', 128, 275);
      ctx.fillStyle = '#64748b';
      ctx.font = '14px sans-serif';
      ctx.fillText('CHIEF CHILL OFFICER', 128, 305);
      // Barcode
      ctx.fillStyle = '#1e293b';
      for (let i = 40; i < 216; i += 7) {
        ctx.fillRect(i, 340, (i % 3 === 0 ? 4 : 2), 40);
      }
    }
    const canvasTex = new THREE.CanvasTexture(canvas);
    cardMat = new THREE.MeshStandardNodeMaterial({
      map: canvasTex, roughness: 0.4, metalness: 0.05,
      transparent: true, depthWrite: false,
    });
    // Upgrade to AI-generated card artwork when loaded (WebP compressed)
    const loader = new THREE.TextureLoader();
    loader.load('./textures/worker_badge.webp', (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      cardMat.map = tex;
      cardMat.needsUpdate = true;
    });
  } else {
    cardMat = new THREE.MeshStandardNodeMaterial({
      color: '#edf1f5', roughness: 0.45, metalness: 0.05,
      transparent: true, depthWrite: false,
    });
  }

  const holderMesh = new THREE.Mesh(holderGeom, holderMat);
  const cardMesh = new THREE.Mesh(cardGeom, cardMat);
  const clipMesh = new THREE.Mesh(clipGeom, clipMat);

  // Layered renderOrder ensures strict back-to-front sorting without z-fighting
  holderMesh.renderOrder = 3;
  cardMesh.renderOrder = 4;
  clipMesh.renderOrder = 5;

  for (const m of [holderMesh, cardMesh, clipMesh]) {
    m.frustumCulled = false;
  }

  group.add(holderMesh, cardMesh, clipMesh);
  return {
    group,
    meshes: [holderMesh, cardMesh, clipMesh],
    materials: [holderMat, cardMat, clipMat],
    geometries: [holderGeom, cardGeom, clipGeom],
  };
}

// Accessory 2: Iced Americano Coffee (Die-cut direct sticker attached to body, sipping by mouth)
function makeCoffee() {
  const group = new THREE.Group();
  group.name = 'accessory-coffee';

  // Positioned near left cheek/mouth so the green straw directly touches the mouth corner
  const cx = -0.22;
  const cy = 0.82;
  const rotZ = -0.28;

  // Iced Coffee Cutout Graphic (Aspect ratio of cute iced_coffee.png is 398/708 ≈ 0.5621)
  const cardW = 0.27;
  const cardH = cardW / 0.5621;

  // Conformal curved geometry: 12x12 grid that curves along the slime body.
  // Setting z = frontAt(x, y) + 0.032 ensures the entire cup, lid, ice, and straw
  // are 100% visible and NEVER sliced/clipped by the spherical chest!
  const segX = 12;
  const segY = 12;
  const cardGeomRaw = new THREE.PlaneGeometry(cardW, cardH, segX, segY);
  const posAttr = cardGeomRaw.attributes.position;
  const cos = Math.cos(rotZ);
  const sin = Math.sin(rotZ);

  for (let i = 0; i < posAttr.count; i++) {
    const u = posAttr.getX(i);
    const v = posAttr.getY(i);
    const x = cx + u * cos - v * sin;
    const y = cy + u * sin + v * cos;
    const z = frontAt(x, y) + 0.032;
    posAttr.setXYZ(i, x, y, z);
  }
  posAttr.needsUpdate = true;
  cardGeomRaw.computeVertexNormals();
  const cardGeom = remember(cardGeomRaw);

  const isBrowser = typeof document !== 'undefined';
  let coffeeMat;
  if (isBrowser) {
    const loader = new THREE.TextureLoader();
    const coffeeTex = loader.load('./textures/iced_coffee.webp');
    coffeeTex.colorSpace = THREE.SRGBColorSpace;
    coffeeMat = new THREE.MeshStandardNodeMaterial({
      map: coffeeTex,
      transparent: true,
      alphaTest: 0.05,
      roughness: 0.35,
      metalness: 0.02,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  } else {
    coffeeMat = new THREE.MeshStandardNodeMaterial({
      color: '#2a170b', roughness: 0.3, metalness: 0.05,
      transparent: true, depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  const coffeeMesh = new THREE.Mesh(cardGeom, coffeeMat);
  coffeeMesh.renderOrder = 4;
  coffeeMesh.frustumCulled = false;

  group.add(coffeeMesh);
  return {
    group,
    meshes: [coffeeMesh],
    materials: [coffeeMat],
    geometries: [cardGeom],
  };
}

// Accessory 3: Band-aid (War-damaged resilient worker, AI-illustrated plaster directly applied)
function makeBandaid() {
  const group = new THREE.Group();
  group.name = 'accessory-bandaid';

  // Moved higher up on the forehead (cy: 1.46 -> 1.68) so it does not crowd the left eye
  const cx = -0.34;
  const cy = 1.68;
  const rotZ = 0.44;

  // Band-aid aspect ratio is 1257 / 485 ≈ 2.59
  const bandW = 0.32;
  const bandH = bandW / 2.59;

  // Conformal curved geometry: 12x6 grid that hugs the forehead surface.
  // Setting z = frontAt(x, y) + offset for every vertex completely eliminates
  // spherical clipping/cut-off and ensures the full plaster with both rounded ends is 100% visible!
  const segX = 12;
  const segY = 6;
  const frontGeomRaw = new THREE.PlaneGeometry(bandW, bandH, segX, segY);
  const posAttr = frontGeomRaw.attributes.position;
  const cos = Math.cos(rotZ);
  const sin = Math.sin(rotZ);

  for (let i = 0; i < posAttr.count; i++) {
    const u = posAttr.getX(i);
    const v = posAttr.getY(i);
    const x = cx + u * cos - v * sin;
    const y = cy + u * sin + v * cos;
    const z = frontAt(x, y) + 0.024;
    posAttr.setXYZ(i, x, y, z);
  }
  posAttr.needsUpdate = true;
  frontGeomRaw.computeVertexNormals();
  const frontGeom = remember(frontGeomRaw);

  const isBrowser = typeof document !== 'undefined';
  let frontMat;
  if (isBrowser) {
    const loader = new THREE.TextureLoader();
    const bandaidTex = loader.load('./textures/bandaid.webp');
    bandaidTex.colorSpace = THREE.SRGBColorSpace;
    frontMat = new THREE.MeshStandardNodeMaterial({
      map: bandaidTex,
      transparent: true,
      alphaTest: 0.05,
      roughness: 0.55,
      metalness: 0.02,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  } else {
    frontMat = new THREE.MeshStandardNodeMaterial({
      color: '#f8f4f0', roughness: 0.55, metalness: 0.0,
      transparent: true, depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  const frontMesh = new THREE.Mesh(frontGeom, frontMat);
  frontMesh.renderOrder = 4;
  frontMesh.frustumCulled = false;

  group.add(frontMesh);
  return {
    group,
    meshes: [frontMesh],
    materials: [frontMat],
    geometries: [frontGeom],
  };
}

function seededRandom() {
  let n = 71561;
  return () => { n = (Math.imul(n, 1664525) + 1013904223) | 0; return (n >>> 0) / 4294967296; };
}

function glassTint(value) {
  const tint = new THREE.Color(value);
  const max = Math.max(tint.r, tint.g, tint.b);
  if (max <= 0.008) {
    return new THREE.Color(0.015, 0.015, 0.015);
  }
  // Keep the dominant channel lossless: absorption adds hue, not a gray veil.
  return tint.multiplyScalar(1 / max).lerp(new THREE.Color('white'), 0.23);
}

export function makeSlime(physics, environment, { transparentBackdrop = false } = {}) {
  const group = new THREE.Group();
  group.name = 'softie';
  const gel = new THREE.MeshPhysicalNodeMaterial({
    color: 'white', metalness: 0, roughness: 0.018,
    transmission: 1, thickness: 2.4, ior: 1.46,
    attenuationColor: glassTint('#f17fa9'), attenuationDistance: 2.4,
    clearcoat: 1, clearcoatRoughness: 0.025,
    specularIntensity: 1, envMapIntensity: 1.1,
  });
  const tint = uniform(gel.attenuationColor);
  const facing = normalView.dot(positionViewDirection).abs().clamp(0, 1);
  // Tint only transmitted light; a short optical path stays clear at the silhouette.
  gel.thicknessNode = facing.pow(0.55).mul(2.25).add(0.15);
  // Grazing Fresnel writes a gray stroke the volume cannot tint. Replace only
  // that limb in the final output; the interior lighting stays clear glass.
  const limb = facing.smoothstep(0.14, 0.34).oneMinus();
  const candy = mix(color('#f5f5f3'), tint, 0.7);
  const setupOutput = gel.setupOutput.bind(gel);
  gel.setupOutput = function setupOutputRim(builder, outputNode) {
    const rimmed = mix(outputNode, vec4(candy, outputNode.a), limb);
    return setupOutput(builder, rimmed);
  };
  // Very shallow surface undulations break up perfectly plastic softbox outlines.
  gel.normalNode = bumpMap(mx_noise_float(positionLocal.mul(9)), 0.012);
  gel.clearcoatNormalNode = gel.normalNode;
  const body = new THREE.Mesh(makeBody(), gel);
  body.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.2, 0), 6);
  body.name = 'deformable-gel';
  body.frustumCulled = false;
  group.add(body);

  // Render the rear interface into the transmission buffer. The front glass then
  // refracts its reflections, rather than only sampling the featureless page color.
  const rearMaterial = new THREE.MeshBasicNodeMaterial({
    side: THREE.BackSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const rearDirection = reflect(positionWorld.sub(cameraPosition).normalize(), normalWorld);
  const rearReflection = environment ? pmremTexture(environment, rearDirection, 0.025).rgb : vec3(1);
  const rearFresnel = facing.oneMinus().pow(3).mul(0.85).add(0.035);
  rearMaterial.colorNode = mix(color('#f5f5f3'), rearReflection.mul(tint.pow(0.3)), rearFresnel);
  // Over a transparent window nothing sits behind the gel, so the rear interface must reach
  // almost all the way to the silhouette or the transmission pass would refract empty pixels.
  rearMaterial.maskNode = facing.greaterThan(transparentBackdrop ? 0.03 : 0.12);
  const rear = new THREE.Mesh(body.geometry, rearMaterial);
  rear.name = 'rear-glass-interface';
  rear.renderOrder = -1;
  rear.frustumCulled = false;
  group.add(rear);

  const black = new THREE.MeshPhysicalNodeMaterial({
    color: '#030203', roughness: 0.17, metalness: 0,
    clearcoat: 0.85, clearcoatRoughness: 0.08, envMapIntensity: 0.45,
    transparent: true, depthWrite: false,
  });
  const faceParts = [makeEye(-0.41), makeEye(0.41), makeMouth()];
  const eyeVertices = faceParts[0].attributes.position.count;
  const faceGeometry = remember(mergeGeometries(faceParts));
  faceParts.forEach(g => g.dispose());
  const openMouth = makeMouth(true);
  const mouthTarget = Float32Array.from(openMouth.attributes.position.array);
  openMouth.dispose();
  const faceMotion = new FaceMotion();
  const posed = Float32Array.from(faceGeometry.userData.rest);
  faceGeometry.userData.posed = posed;
  // Save each point's distance from the gel surface, then reproject after posing.
  const faceDepth = new Float32Array(posed.length / 3);
  const mouthDepth = new Float32Array(mouthTarget.length / 3);
  for (let i = 0; i < faceDepth.length; i++) faceDepth[i] = posed[i * 3 + 2] - frontAt(posed[i * 3], posed[i * 3 + 1]);
  for (let i = 0; i < mouthDepth.length; i++) mouthDepth[i] = mouthTarget[i * 3 + 2] - frontAt(mouthTarget[i * 3], mouthTarget[i * 3 + 1]);
  const face = new THREE.Mesh(faceGeometry, black);
  face.name = 'skin-attached-face';
  face.renderOrder = 2;
  face.frustumCulled = false;
  group.add(face);

  const browMaterial = black.clone();
  browMaterial.roughness = 0.5;
  const moodBrows = new THREE.Group();
  moodBrows.name = 'mood-brows';
  moodBrows.visible = false;
  for (const side of [-1, 1]) {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-0.095, 0.008, 0), new THREE.Vector3(0, -0.014, 0), new THREE.Vector3(0.095, 0.008, 0));
    const parts = [new THREE.TubeGeometry(curve, 16, 0.012, 8, false)];
    for (const x of [-0.095, 0.095]) parts.push(new THREE.SphereGeometry(0.012, 8, 6).translate(x, 0.008, 0));
    const brow = new THREE.Mesh(remember(mergeGeometries(parts)), browMaterial);
    parts.forEach(g => g.dispose());
    brow.userData.side = side;
    brow.renderOrder = 3;
    brow.frustumCulled = false;
    moodBrows.add(brow);
  }
  group.add(moodBrows);

  // Air pockets use faint reflective shells, composited after the refractive gel.
  // This avoids magnifying small pockets into beads in the screen-space refraction.
  const bubbleGeometry = new THREE.SphereGeometry(1, 12, 8);
  const bubbleMaterial = new THREE.MeshPhysicalNodeMaterial({
    color: new THREE.Color('#f17fa9').lerp(new THREE.Color('white'), 0.65), metalness: 0, roughness: 0.028,
    clearcoat: 1, envMapIntensity: 1.1,
    transparent: true, depthWrite: false, depthTest: false,
  });
  // An air pocket has a reflective edge, not a solid candy-colored core.
  const bubbleGlint = normalView.dot(vec3(-0.3, 0.45, 0.85).normalize()).max(0).pow(48);
  bubbleMaterial.opacityNode = normalView.dot(positionViewDirection).abs().oneMinus().pow(3).mul(0.45)
    .add(bubbleGlint.mul(0.8)).add(0.008).clamp(0, 1);
  const count = 116;
  const bubbles = new THREE.InstancedMesh(bubbleGeometry, bubbleMaterial, count);
  bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bubbles.frustumCulled = false;
  bubbles.name = 'suspended-air-bubbles';
  bubbles.renderOrder = 1;
  const random = seededRandom();
  const bubbleSeeds = [];
  for (let i = 0; i < count; i++) {
    const y = 0.19 + random() * 1.96;
    const x = (random() * 2 - 1) * WIDTH * radiusAt(y) * 0.89;
    const front = frontAt(x, y);
    const z = front * (0.15 + random() * 0.8);
    const size = 0.009 + Math.pow(random(), 2.8) * 0.033;
    const radius = radiusAt(y);
    bubbleSeeds.push({
      x: x / (WIDTH * radius), y,
      z: Math.min(front - size * 2.3, z) / (DEPTH * radius),
      size, phase: random() * Math.PI * 2,
    });
  }
  group.add(bubbles);

  // 3D Dizzy Stars: Gold cartoon stars orbiting above crown during dizzy reaction
  const starGeometry = makeStarGeometry();
  const starMaterial = new THREE.MeshStandardNodeMaterial({
    color: '#ffc820',
    emissive: '#ffa200',
    emissiveIntensity: 0.45,
    roughness: 0.16,
    metalness: 0.84,
    transparent: true,
    depthWrite: false,
  });
  const dizzyStarsGroup = new THREE.Group();
  dizzyStarsGroup.name = 'dizzy-stars-halo';
  dizzyStarsGroup.visible = false;
  const STAR_COUNT = 5;
  const stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    const starMesh = new THREE.Mesh(starGeometry, starMaterial);
    starMesh.name = `dizzy-star-${i}`;
    starMesh.frustumCulled = false;
    dizzyStarsGroup.add(starMesh);
    stars.push(starMesh);
  }
  group.add(dizzyStarsGroup);

  // Four rounded strokes match the small, hand-drawn forehead mark in the concept.
  const crossParts = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(sx * 0.035, sy * 0.12, 0),
      new THREE.Vector3(sx * 0.018, sy * 0.018, 0),
      new THREE.Vector3(sx * 0.12, sy * 0.035, 0));
    crossParts.push(new THREE.TubeGeometry(curve, 16, 0.016, 8, false));
    for (const point of [curve.v0, curve.v2]) crossParts.push(new THREE.SphereGeometry(0.016, 8, 6).translate(point.x, point.y, 0));
  }
  const angerCrossGeom = mergeGeometries(crossParts);
  crossParts.forEach(g => g.dispose());
  const angerMaterial = new THREE.MeshStandardNodeMaterial({
    color: '#d74454',
    roughness: 0.55,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const angerCrossMesh = new THREE.Mesh(angerCrossGeom, angerMaterial);
  angerCrossMesh.name = 'mood-anger-cross';
  angerCrossMesh.visible = false;
  angerCrossMesh.frustumCulled = false;
  // renderOrder 5 ensures it composites cleanly on top of the jelly body, bubbles, and face
  angerCrossMesh.renderOrder = 5;
  group.add(angerCrossMesh);

  // 3D Sleep Bubble: Translucent bubble expanding & contracting with breathing rhythm
  const sleepBubbleGeom = new THREE.SphereGeometry(0.085, 24, 16);
  const sleepBubbleMat = new THREE.MeshPhysicalNodeMaterial({
    color: '#cbe7f8',
    transmission: 0.92,
    roughness: 0.06,
    ior: 1.25,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
  });
  const sleepBubbleMesh = new THREE.Mesh(sleepBubbleGeom, sleepBubbleMat);
  sleepBubbleMesh.name = 'mood-sleep-bubble';
  sleepBubbleMesh.visible = false;
  sleepBubbleMesh.frustumCulled = false;
  group.add(sleepBubbleMesh);

  // Accessories: Worker badge, iced coffee, war-damaged bandaid
  const badge = makeBadge();
  const coffee = makeCoffee();
  const bandaid = makeBandaid();
  const accessories = {
    badge,
    coffee,
    bandaid,
    get darkCircles() { return coffee; },
  };

  badge.group.visible = false;
  coffee.group.visible = false;
  bandaid.group.visible = false;
  group.add(badge.group, coffee.group, bandaid.group);
  let currentAccessory = 'none';

  const p = { x: 0, y: 0, z: 0 };
  const crownP = { x: 0, y: 0, z: 0 };
  const moodP = { x: 0, y: 0, z: 0 };
  const matrix = new THREE.Matrix4();
  const geometries = [body.geometry, face.geometry];
  let baseColorHex = '#f17fa9';
  let bossPose = null;
  let baseGlassTint = glassTint(baseColorHex);
  const rageGlassTint = glassTint('#fa6685');

  return {
    group, body, face, bubbles, gel, faceMotion, dizzyStars: dizzyStarsGroup,
    angerCross: angerCrossMesh, moodBrows, sleepBubble: sleepBubbleMesh,
    accessories,
    setBossPose(pose) { bossPose = pose; },
    get bossPose() { return bossPose; },
    get color() { return baseColorHex; },
    setAccessory(type = 'none') {
      currentAccessory = accessories[type] ? type : 'none';
      badge.group.visible = currentAccessory === 'badge';
      coffee.group.visible = currentAccessory === 'coffee' || currentAccessory === 'darkCircles';
      bandaid.group.visible = currentAccessory === 'bandaid';
      return currentAccessory;
    },
    get accessory() {
      return currentAccessory;
    },
    setColor(color) {
      baseColorHex = color;
      baseGlassTint = glassTint(color);
      const c = new THREE.Color(color);
      const isBlack = Math.max(c.r, c.g, c.b) <= 0.008;
      if (isBlack) {
        face.material.color.set('#6e7886');
        face.material.roughness = 0.04;
        face.material.clearcoat = 1.0;
        face.material.clearcoatRoughness = 0.02;
        face.material.envMapIntensity = 1.5;
      } else {
        face.material.color.set('#030203');
        face.material.roughness = 0.17;
        face.material.clearcoat = 0.85;
        face.material.clearcoatRoughness = 0.08;
        face.material.envMapIntensity = 0.45;
      }
      gel.attenuationColor.copy(baseGlassTint);
      bubbleMaterial.color.set(color).lerp(new THREE.Color('white'), 0.65);
    },
    update(time) {
      group.position.copy(physics.position);
      const expression = faceMotion.update(time);

      const moodWeight = bossPose ? 0 : (1 - (expression.sad ?? 0)) * (1 - (expression.sleepy ?? 0))
        * (1 - (expression.dizzy ?? 0)) * (1 - (expression.startle ?? 0));
      const angerLevel = (expression.angerLevel ?? 0) * moodWeight;
      const angryPose = Math.max(expression.angry ?? 0, THREE.MathUtils.smoothstep(angerLevel, 0.55, 0.8)) * moodWeight;
      const annoyedPose = Math.max(expression.annoyed ?? 0, THREE.MathUtils.smoothstep(angerLevel, 0.28, 0.48)) * moodWeight;
      const browWeight = Math.max(angryPose, annoyedPose);
      // A little puff and warmth, while retaining the original translucent jelly.
      const puffX = 1 + angryPose * 0.06, puffZ = 1 + angryPose * 0.02;
      group.scale.set(puffX, 1 / (puffX * puffZ), puffZ);
      if (angerLevel > 0.02) {
        gel.attenuationColor.copy(baseGlassTint).lerp(rageGlassTint, angerLevel * 0.30);
      } else {
        gel.attenuationColor.copy(baseGlassTint);
      }

      const restFace = faceGeometry.userData.rest;
      const angry = expression.angry ?? 0;
      const annoyed = expression.annoyed ?? 0;
      const sleepy = expression.sleepy ?? 0;
      const startle = expression.startle ?? 0;

      for (let i = 0; i < faceDepth.length; i++) {
        const n = i * 3;
        let x = restFace[n], y = restFace[n + 1], depth = faceDepth[i];
        if (i < eyeVertices * 2) {
          const left = i < eyeVertices, cx = left ? -0.41 : 0.41;
          const dizzy = expression.dizzy ?? 0;
          const spinAngle = time * 18;
          const orbitR = 0.042 * dizzy;
          const eyeOffsetX = (left ? Math.cos(spinAngle) : Math.cos(-spinAngle + Math.PI * 0.5)) * orbitR;
          const eyeOffsetY = (left ? Math.sin(spinAngle) : Math.sin(-spinAngle + Math.PI * 0.5)) * orbitR;
          const wobbleScaleX = 1 + Math.sin(spinAngle * 2 + (left ? 0 : Math.PI)) * 0.28 * dizzy;
          const wobbleScaleY = 1 - Math.sin(spinAngle * 2 + (left ? 0 : Math.PI)) * 0.28 * dizzy;

          const closed = Math.max(
            expression.blink,
            sleepy * 0.92,
            (1 - dizzy) * expression.squish * 0.9,
            expression.happy * 0.7,
            left ? expression.wink * 0.94 : 0,
            annoyed * (left ? 0.32 : 0.06)
          );

          const localX = (x - cx) * wobbleScaleX;
          const browTilt = (left ? localX : -localX) * 0.38 * angry;
          const annoyedLift = (left ? 0.022 : -0.008) * annoyed;
          const sleepyDrop = -0.018 * sleepy;

          x = cx + eyeOffsetX + localX * (1 + expression.surprised * 0.12 + startle * 0.35) + expression.gazeX * 0.05;
          y = 1.2 + eyeOffsetY + browTilt + annoyedLift + sleepyDrop
            + (y - 1.2) * (1 - closed) * wobbleScaleY * (1 + expression.surprised * 0.14 + startle * 0.38)
            + closed * 0.025 * (1 - (localX / 0.128) ** 2) + expression.gazeY * 0.028;
        } else {
          const m = (i - eyeVertices * 2) * 3;
          const open = Math.max(expression.surprised, startle * 1.25);
          const dizzy = expression.dizzy ?? 0;
          x += (mouthTarget[m] - x) * open;
          y += (mouthTarget[m + 1] - y) * open;
          depth += (mouthDepth[m / 3] - depth) * open;

          x *= 1 + expression.happy * 0.25 + expression.squish * 0.1 + startle * 0.22;
          y = 1.111 + (y - 1.111) * (1 + expression.happy * 0.2) + expression.wink * x * 0.16;

          // Grumpy inverted mouth curvature when angry
          y -= (x * x) * 2.8 * angry;
          // Subtly slanted mouth when annoyed
          x += annoyed * 0.015;
          y -= annoyed * 0.012;
          // Downward slack when sleepy
          y -= sleepy * 0.022;

          y += Math.sin(x * 42 + time * 20) * 0.024 * dizzy - 0.015 * dizzy;
        }
        if (browWeight > 0) {
          const rx = restFace[n], ry = restFace[n + 1];
          let ex = rx, ey;
          if (i < eyeVertices * 2) {
            const side = i < eyeVertices ? -1 : 1;
            const localX = rx - side * 0.41;
            const tilt = THREE.MathUtils.lerp(side < 0 ? -0.08 : 0.24, side * 0.2, angryPose);
            ey = Math.min(ry, 1.22 + localX * tilt);
            ex -= 0.015 * (1 - angryPose);
            // Keep blinking possible beneath the slanted upper lid.
            ey = THREE.MathUtils.lerp(ey, 1.16 + (ry - 1.2) * 0.1, expression.blink);
          } else {
            ex = rx * 0.88;
            ey = THREE.MathUtils.lerp(1.08 + (1.075 - ry) * 0.35 + rx * 0.18, 2 * 1.08 - ry, angryPose);
          }
          x += (ex - x) * browWeight;
          y += (ey - y) * browWeight;
          depth += (faceDepth[i] - depth) * browWeight;
        }
        if (bossPose) {
          const { weight, fear, shock, relief = 0 } = bossPose;
          let bx = restFace[n], by = restFace[n + 1], bd = faceDepth[i];
          if (i < eyeVertices * 2) {
            const left = i < eyeVertices, cx = left ? -0.41 : 0.41;
            const openness = Math.max(fear, shock);
            // A straight upper lid over the familiar black eye, not a new pair of eyes.
            const lid = 1.21 + (left ? -0.14 : 0.17) * (bx - cx);
            const halfLidded = Math.min(by, lid);
            by = halfLidded + (by - halfLidded) * openness;
            by += openness * 0.015;
            // The last storyboard panel has two curved, closed smiling eyes.
            const smileEye = 1.2 + (restFace[n + 1] - 1.2) * 0.10
              + 0.09 * (1 - ((bx - cx) / 0.128) ** 2);
            by += (smileEye - by) * relief;
          } else {
            const m = (i - eyeVertices * 2) * 3;
            const open = Math.max(shock * 0.75, fear * 0.65);
            bx += (mouthTarget[m] - bx) * open;
            by += (mouthTarget[m + 1] - by) * open;
            bd += (mouthDepth[m / 3] - bd) * open;
            by += (1 - open) * (bx * 0.32 + 0.016);
            bx += (1 - open) * 0.02;
            bx += (restFace[n] - bx) * relief;
            by += (restFace[n + 1] - by) * relief;
            bd += (faceDepth[i] - bd) * relief;
          }
          x += (bx - x) * weight;
          y += (by - y) * weight;
          depth += (bd - depth) * weight;
        }
        const sad = bossPose ? bossPose.sadness ?? 0 : expression.sad;
        if (sad > 0) {
          // Drooping outer eye corners and a small downturned mouth.
          const rx = restFace[n], ry = restFace[n + 1];
          if (i < eyeVertices * 2) {
            const cx = i < eyeVertices ? -0.41 : 0.41;
            const sy = 1.17 + (ry - 1.2) * 0.42 - (rx - cx) * Math.sign(cx) * 0.42;
            x += (rx - x) * sad;
            y += (sy - y) * sad;
          } else {
            x += (rx * 0.85 - x) * sad;
            y += (2 * 1.111 - ry - 0.035 - y) * sad;
          }
          depth += (faceDepth[i] - depth) * sad;
        }
        posed[n] = x; posed[n + 1] = y; posed[n + 2] = frontAt(x, y) + depth;
      }
      for (const geometry of geometries) {
        const rest = geometry.userData.posed ?? geometry.userData.rest;
        const positions = geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const n = i * 3;
          physics.deform(rest[n], rest[n + 1], rest[n + 2], p);
          positions.setXYZ(i, p.x, p.y, p.z);
        }
        positions.needsUpdate = true;
        geometry.computeVertexNormals();
      }

      moodBrows.visible = browWeight > 0.01;
      browMaterial.color.copy(black.color);
      browMaterial.opacity = browWeight;
      if (moodBrows.visible) for (const brow of moodBrows.children) {
        const side = brow.userData.side;
        const tilt = THREE.MathUtils.lerp(side < 0 ? 0.12 : 0.45, side * 0.48, angryPose);
        const rest = brow.geometry.userData.rest;
        const positions = brow.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const n = i * 3;
          const x = side * 0.41 + rest[n];
          const y = 1.40 + rest[n + 1] + rest[n] * tilt + (1 - angryPose) * (side > 0 ? 0.015 : 0);
          physics.deform(x, y, frontAt(x, y) + 0.028 + rest[n + 2], p);
          positions.setXYZ(i, p.x, p.y, p.z);
        }
        positions.needsUpdate = true;
        brow.geometry.computeVertexNormals();
      }

      // Bubbles bubble faster as temperature/anger rises
      const angerSpeedMult = 1 + angerLevel * 2.2;
      for (let i = 0; i < count; i++) {
        const b = bubbleSeeds[i];
        const speed = (0.026 + b.size * 0.65 + b.phase * 0.002) * angerSpeedMult;
        const progress = ((b.y - 0.19 + time * speed) % 1.96) / 1.96;
        const y = 0.19 + progress * 1.96;
        const radius = radiusAt(y);
        const drift = time * (0.5 + b.phase * 0.06);
        let x = b.x + Math.sin(drift + b.phase) * 0.045;
        let z = b.z + Math.cos(drift * 0.73 + b.phase) * 0.035;
        const inset = 1 - b.size * 2.8 / (DEPTH * radius);
        const fit = Math.min(1, inset / Math.hypot(x, z));
        x *= WIDTH * radius * fit;
        z *= DEPTH * radius * fit;
        const fade = THREE.MathUtils.smoothstep(progress, 0, 0.08)
          * (1 - THREE.MathUtils.smoothstep(progress, 0.9, 1));
        const size = b.size * Math.max(0.001, fade);
        physics.deform(x, y, z, p);
        matrix.makeScale(size, size * 1.12, size);
        matrix.setPosition(p.x, p.y, p.z);
        bubbles.setMatrixAt(i, matrix);
      }
      bubbles.instanceMatrix.needsUpdate = true;

      // Update 3D Dizzy Stars Halo above the slime crown
      const dizzy = expression.dizzy ?? 0;
      if (dizzy <= 1e-4) {
        if (dizzyStarsGroup.visible) dizzyStarsGroup.visible = false;
      } else {
        dizzyStarsGroup.visible = true;
        physics.deform(0, 2.38, 0, crownP);
        dizzyStarsGroup.position.set(crownP.x, crownP.y + 0.30, crownP.z);
        dizzyStarsGroup.rotation.x = 0.32 + Math.sin(time * 3.5) * 0.05;
        dizzyStarsGroup.rotation.z = Math.cos(time * 3.0) * 0.05;

        const orbitRadius = (0.38 + Math.sin(time * 5.0) * 0.02) * Math.min(1, dizzy * 1.35);
        const baseScale = Math.min(1, dizzy * 1.35);
        starMaterial.opacity = Math.min(1, dizzy * 1.8);

        for (let i = 0; i < STAR_COUNT; i++) {
          const star = stars[i];
          const orbitAngle = time * 6.6 + (i * Math.PI * 2) / STAR_COUNT;
          const wobbleY = Math.sin(time * 7.5 + i * 1.25) * 0.042;
          star.position.set(
            Math.cos(orbitAngle) * orbitRadius,
            wobbleY,
            Math.sin(orbitAngle) * orbitRadius
          );
          star.rotation.y = time * 8.5 + i * 1.8;
          star.rotation.z = time * 6.0 + i * 1.2;
          star.rotation.x = Math.sin(time * 6.5 + i) * 0.5;
          const twinkle = 1 + 0.14 * Math.sin(time * 13 + i * 2.1);
          star.scale.setScalar(baseScale * twinkle);
        }
      }

      // A quiet, rounded mark appears only for the full angry expression.
      const angerEffect = angryPose;
      if (angerEffect <= 0.10) {
        if (angerCrossMesh.visible) angerCrossMesh.visible = false;
      } else {
        angerCrossMesh.visible = true;
        // Sample forehead right temple coordinates on the outer surface
        const templeX = 0.70;
        const templeY = 1.67;
        const templeZ = frontAt(templeX, templeY) + 0.045;
        physics.deform(templeX, templeY, templeZ, moodP);

        angerCrossMesh.position.set(moodP.x, moodP.y, moodP.z);
        const popProgress = THREE.MathUtils.smoothstep(angerEffect, 0.10, 0.55);
        angerCrossMesh.scale.setScalar(popProgress);
        angerCrossMesh.rotation.set(-0.30, 0.25, 0.16);
        angerMaterial.opacity = popProgress;
      }

      // Update 3D Sleep Bubble expanding & contracting with breathing rhythm
      if (bossPose || sleepy <= 0.05) {
        if (sleepBubbleMesh.visible) sleepBubbleMesh.visible = false;
      } else {
        sleepBubbleMesh.visible = true;
        physics.deform(0.18, 1.10, frontAt(0.18, 1.10) + 0.09, moodP);
        const breath = (Math.sin(time * 2.6) + 1) * 0.5;
        const bScale = sleepy * (0.35 + breath * 0.85);
        sleepBubbleMesh.scale.setScalar(bScale);
        sleepBubbleMesh.position.set(moodP.x + breath * 0.03, moodP.y + breath * 0.05, moodP.z);
        sleepBubbleMat.opacity = Math.min(0.85, sleepy * 1.2);
      }

      // Update active accessory with full soft-body deformation field
      if (currentAccessory !== 'none' && accessories[currentAccessory]) {
        const acc = accessories[currentAccessory];
        for (const mesh of acc.meshes) {
          const rest = mesh.geometry.userData.rest;
          const positions = mesh.geometry.attributes.position;
          for (let i = 0; i < positions.count; i++) {
            const n = i * 3;
            physics.deform(rest[n], rest[n + 1], rest[n + 2], p);
            positions.setXYZ(i, p.x, p.y, p.z);
          }
          positions.needsUpdate = true;
          mesh.geometry.computeVertexNormals();
        }
      }
    },
    dispose() {
      geometries.forEach(g => g.dispose());
      gel.dispose(); rearMaterial.dispose(); black.dispose(); bubbleGeometry.dispose(); bubbleMaterial.dispose();
      starGeometry.dispose(); starMaterial.dispose();
      angerCrossGeom.dispose(); angerMaterial.dispose();
      moodBrows.children.forEach(brow => brow.geometry.dispose()); browMaterial.dispose();
      sleepBubbleGeom.dispose(); sleepBubbleMat.dispose();
      [badge, coffee, bandaid].forEach(acc => {
        acc.geometries.forEach(g => g.dispose());
        acc.materials.forEach(m => m.dispose());
      });
    },
  };
}
