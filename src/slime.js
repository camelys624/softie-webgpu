import * as THREE from 'three/webgpu';
import { bumpMap, cameraPosition, color, mix, mx_noise_float, normalView, normalWorld, pmremTexture, positionLocal, positionViewDirection, positionWorld, reflect, uniform, vec3, vec4 } from 'three/tsl';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { FaceMotion } from './face-motion.js';

const HEIGHT = 2.36;
const WIDTH = 1.66;
const DEPTH = 1.18;

function radiusAt(y) {
  const t = Math.pow(THREE.MathUtils.clamp((y - 0.035) / HEIGHT, 0, 1), 1 / 1.28);
  const c = t * 2 - 1;
  return Math.pow(Math.sqrt(Math.max(0, 1 - c * c)), 0.82) * (1 - 0.07 * c);
}

function frontAt(x, y) {
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

  const p = { x: 0, y: 0, z: 0 };
  const crownP = { x: 0, y: 0, z: 0 };
  const matrix = new THREE.Matrix4();
  const geometries = [body.geometry, face.geometry];
  return {
    group, body, face, bubbles, gel, faceMotion, dizzyStars: dizzyStarsGroup,
    setColor(color) {
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
      gel.attenuationColor.copy(glassTint(color));
      bubbleMaterial.color.set(color).lerp(new THREE.Color('white'), 0.65);
    },
    update(time) {
      group.position.copy(physics.position);
      const expression = faceMotion.update(time);
      const restFace = faceGeometry.userData.rest;
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

          const closed = Math.max(expression.blink, (1 - dizzy) * expression.squish * 0.9,
            expression.happy * 0.7, left ? expression.wink * 0.94 : 0);
          const localX = (x - cx) * wobbleScaleX;
          x = cx + eyeOffsetX + localX * (1 + expression.surprised * 0.12) + expression.gazeX * 0.05;
          y = 1.2 + eyeOffsetY + (y - 1.2) * (1 - closed) * wobbleScaleY * (1 + expression.surprised * 0.14)
            + closed * 0.025 * (1 - (localX / 0.128) ** 2) + expression.gazeY * 0.028;
        } else {
          const m = (i - eyeVertices * 2) * 3;
          const open = expression.surprised;
          const dizzy = expression.dizzy ?? 0;
          x += (mouthTarget[m] - x) * open;
          y += (mouthTarget[m + 1] - y) * open;
          depth += (mouthDepth[m / 3] - depth) * open;
          x *= 1 + expression.happy * 0.25 + expression.squish * 0.1;
          y = 1.111 + (y - 1.111) * (1 + expression.happy * 0.2) + expression.wink * x * 0.16;
          y += Math.sin(x * 42 + time * 20) * 0.024 * dizzy - 0.015 * dizzy;
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
      for (let i = 0; i < count; i++) {
        const b = bubbleSeeds[i];
        const speed = 0.026 + b.size * 0.65 + b.phase * 0.002;
        const progress = ((b.y - 0.19 + time * speed) % 1.96) / 1.96;
        const y = 0.19 + progress * 1.96;
        const radius = radiusAt(y);
        const drift = time * (0.5 + b.phase * 0.06);
        let x = b.x + Math.sin(drift + b.phase) * 0.045;
        let z = b.z + Math.cos(drift * 0.73 + b.phase) * 0.035;
        // Follow the narrowing volume near the crown, leaving room for the whole bubble.
        const inset = 1 - b.size * 2.8 / (DEPTH * radius);
        const fit = Math.min(1, inset / Math.hypot(x, z));
        x *= WIDTH * radius * fit;
        z *= DEPTH * radius * fit;
        // Shrink out/in at the ends so the upward loop has no visible teleport.
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
        // Anchor to the dynamically deformed crown apex (tuft) of the jelly
        physics.deform(0, 2.38, 0, crownP);
        dizzyStarsGroup.position.set(crownP.x, crownP.y + 0.30, crownP.z);
        // Tilted halo plane for cartoon 3D perspective
        dizzyStarsGroup.rotation.x = 0.32 + Math.sin(time * 3.5) * 0.05;
        dizzyStarsGroup.rotation.z = Math.cos(time * 3.0) * 0.05;

        const orbitRadius = (0.38 + Math.sin(time * 5.0) * 0.02) * Math.min(1, dizzy * 1.35);
        const baseScale = Math.min(1, dizzy * 1.35);
        starMaterial.opacity = Math.min(1, dizzy * 1.8);

        for (let i = 0; i < STAR_COUNT; i++) {
          const star = stars[i];
          const orbitAngle = time * 6.6 + (i * Math.PI * 2) / STAR_COUNT;
          // Undulating wave pattern along the circular halo
          const wobbleY = Math.sin(time * 7.5 + i * 1.25) * 0.042;
          star.position.set(
            Math.cos(orbitAngle) * orbitRadius,
            wobbleY,
            Math.sin(orbitAngle) * orbitRadius
          );
          // Star self-rotation and sparkling micro-twinkle
          star.rotation.y = time * 8.5 + i * 1.8;
          star.rotation.z = time * 6.0 + i * 1.2;
          star.rotation.x = Math.sin(time * 6.5 + i) * 0.5;
          const twinkle = 1 + 0.14 * Math.sin(time * 13 + i * 2.1);
          star.scale.setScalar(baseScale * twinkle);
        }
      }
    },
    dispose() {
      geometries.forEach(g => g.dispose());
      gel.dispose(); rearMaterial.dispose(); black.dispose(); bubbleGeometry.dispose(); bubbleMaterial.dispose();
      starGeometry.dispose(); starMaterial.dispose();
    },
  };
}
