import * as THREE from 'three/webgpu';
import { radiusAt, frontAt } from './slime.js';
import { exitMotion, makeBossExit } from './boss-exit.js';

const mix = (a, b, t) => a + (b - a) * t;
const restingPose = { fear: 0, shock: 0, point: 0, exit: 0, weight: 1, recoil: 0, shake: 0 };

// Costume A: the original jelly and face, purple trousers and tiny back-held claws.
export function makeBoss(physics) {
  const group = new THREE.Group();
  group.name = 'crab-boss-costume';
  group.visible = false;
  const materials = {};
  for (const [name, color] of Object.entries({ shell: '#df656b', foot: '#df656b', pants: '#796086', belt: '#423346', stitch: '#66516f', ink: '#342b32', gold: '#d8aa56' })) {
    const cloth = ['pants', 'belt', 'stitch'].includes(name);
    materials[name] = new THREE.MeshPhysicalNodeMaterial({
      color, roughness: cloth ? 0.85 : 0.32, metalness: name === 'gold' ? 0.35 : 0,
      clearcoat: cloth ? 0.04 : 0.6, clearcoatRoughness: 0.15,
      transparent: true, depthWrite: false,
    });
  }
  const meshes = [];
  function add(geometry, material, name, rig = 'clothes') {
    geometry.userData.rest = Float32Array.from(geometry.attributes.position.array);
    geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const mesh = new THREE.Mesh(geometry, materials[material]);
    mesh.name = name;
    mesh.userData.rig = rig;
    mesh.renderOrder = 5;
    mesh.frustumCulled = false;
    group.add(mesh);
    meshes.push(mesh);
    return mesh;
  }
  function oval(material, position, scale, name, tilt = 0, rig) {
    const geometry = new THREE.SphereGeometry(1, 24, 16);
    geometry.scale(...scale).rotateZ(tilt).translate(...position);
    return add(geometry, material, name, rig);
  }
  function block(material, position, scale, name, rig) {
    const geometry = new THREE.BoxGeometry(...scale, 4, 2, 2);
    geometry.translate(...position);
    return add(geometry, material, name, rig);
  }
  function line(points, radius, material, name, rig) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    return add(new THREE.TubeGeometry(curve, 24, radius, 8, false), material, name, rig);
  }
  function garment(bottom, top, material, name) {
    const vertices = [], indices = [];
    const rings = 10, segments = 64;
    for (let row = 0; row <= rings; row++) {
      const y = bottom + (top - bottom) * row / rings;
      const radius = radiusAt(y) + 0.025;
      for (let col = 0; col <= segments; col++) {
        const angle = col / segments * Math.PI * 2;
        vertices.push(Math.sin(angle) * 1.66 * radius, y, Math.cos(angle) * 1.18 * radius);
      }
    }
    for (let row = 0; row < rings; row++) {
      for (let col = 0; col < segments; col++) {
        const a = row * (segments + 1) + col, b = a + segments + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    add(geometry, material, name);
  }
  garment(0.045, 0.66, 'pants', 'boss-trousers');
  garment(0.66, 0.76, 'belt', 'boss-belt');
  const buckleZ = 1.18 * (radiusAt(0.71) + 0.025);
  block('gold', [0, 0.71, buckleZ + 0.025], [0.2, 0.15, 0.06], 'boss-buckle', 'buckle');
  block('belt', [0, 0.71, buckleZ + 0.062], [0.115, 0.068, 0.018], 'boss-buckle-inset', 'buckle');
  for (const side of [-1, 1]) {
    for (const x of [0.5, 1.03]) {
      block('pants', [side * x, 0.7, frontAt(side * x, 0.7) + 0.06], [0.07, 0.21, 0.045], 'boss-belt-loop');
    }
    const pocket = [[side * 0.76, 0.63], [side * 0.82, 0.48], [side * 1.0, 0.39], [side * 1.18, 0.46]];
    line(pocket.map(([x, y]) => [x, y, frontAt(x, y) + 0.055]), 0.008, 'stitch', 'boss-pocket');
    oval('foot', [side * 0.69, 0.065, 0.5], [0.23, 0.1, 0.32], 'boss-foot', side * 0.15);
    const rig = side < 0 ? 'hand-left' : 'hand-right';
    // Local hand coordinates are posed before entering the jelly deformation field.
    oval('shell', [0, 0, 0], [0.06, 0.5, 0.06], 'boss-arm', 0, side < 0 ? 'arm-left' : 'arm-right');
    oval('shell', [0, 0, 0], [0.17, 0.20, 0.14], 'boss-claw', 0, rig);
    for (const finger of [-1, 1]) {
      oval('shell', [finger * 0.09, 0.15, 0], [0.067, 0.15, 0.11], 'boss-pincer', finger * 0.38, rig);
    }
    line([[-0.12, 0, 0], [0, 0.035, 0], [0.12, 0.025, 0]], 0.012, 'ink', 'boss-brow', side < 0 ? 'brow-left' : 'brow-right');
  }
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.037 : 0.085, a = Math.PI / 2 + i * Math.PI / 5;
    if (i) starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    else starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  starShape.closePath();
  const effects = [];
  for (let i = 0; i < 5; i++) {
    const star = add(new THREE.ShapeGeometry(starShape), 'gold', 'boss-hit-star', 'effect');
    star.userData.effectIndex = i;
    effects.push(star);
  }
  const departure = makeBossExit();
  group.add(departure.group);
  const point = new THREE.Vector3();
  const armStart = new THREE.Vector3(), armEnd = new THREE.Vector3(), armAxis = new THREE.Vector3();
  const armRotation = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  return {
    group,
    setFaceColor(color) { materials.ink.color.copy(color); },
    update(pose = restingPose, reducedMotion = false) {
      group.position.copy(physics.position);
      const { fear, shock, point: pointing, exit, recoil, shake } = pose;
      const flight = exitMotion(exit);
      const detach = reducedMotion ? 0 : flight.assemble;
      const guard = Math.max(fear, shock * 0.4);
      for (const [name, material] of Object.entries(materials)) {
        material.opacity = ['ink', 'foot'].includes(name) || reducedMotion ? 1 - (pose.relief ?? exit) : flight.opacity;
        material.depthTest = exit === 0 || ['ink', 'foot'].includes(name) || reducedMotion;
      }
      for (const mesh of meshes) {
        const rig = mesh.userData.rig;
        if (rig === 'effect') continue;
        const positions = mesh.geometry.attributes.position;
        const rest = mesh.geometry.userData.rest;
        const hand = rig.startsWith('hand'), brow = rig.startsWith('brow'), arm = rig.startsWith('arm');
        const side = rig.endsWith('left') ? -1 : 1;
        const pointingHand = side > 0 ? pointing : 0;
        const handX = side * mix(mix(1.62 + pointingHand * 0.22, 0.75, guard), 1.35, detach);
        const handY = mix(mix(0.82 + pointingHand * 0.65, 1.96, guard), 1.22, detach);
        const handZ = mix(mix(-0.12 + pointingHand * 0.9, 0.96, guard), 0.28, detach);
        let armLength = 0;
        if (arm) {
          armStart.set(side * 1.43, mix(0.88 + guard * 0.16, 0.70, detach), mix(mix(-0.12, 0.48, Math.max(guard, pointingHand)), 0.18, detach));
          armEnd.set(handX, handY, handZ);
          armAxis.copy(armEnd).sub(armStart);
          armLength = armAxis.length();
          armRotation.setFromUnitVectors(up, armAxis.normalize());
          armStart.add(armEnd).multiplyScalar(0.5);
        }
        for (let i = 0; i < positions.count; i++) {
          let x = rest[i * 3], y = rest[i * 3 + 1], z = rest[i * 3 + 2];
          if (arm) {
            point.set(x, y * armLength, z).applyQuaternion(armRotation).add(armStart);
            x = point.x; y = point.y; z = point.z;
          } else if (hand) {
            const angle = mix(mix(side * -1.15, side * 0.35, guard) + pointingHand * -1.0, side * -0.3, detach);
            const localX = x * Math.cos(angle) - y * Math.sin(angle);
            const localY = x * Math.sin(angle) + y * Math.cos(angle);
            x = localX + handX;
            y = localY + handY;
            z += handZ;
            x += shake * side * (1 - detach);
          } else if (brow) {
            const tilt = mix(side < 0 ? -0.28 : 0.5, -side * 0.55, guard);
            y += 1.33 + (side > 0 ? 0.075 : 0) * (1 - guard) + guard * 0.15 + x * tilt;
            x += side * 0.41;
            z += frontAt(x, y) + 0.028;
          } else if (rig === 'buckle') {
            const angle = reducedMotion ? 0 : (fear * 0.2 + recoil * 0.15) * (1 - detach);
            const localY = y - 0.71;
            const localX = x;
            x = localX * Math.cos(angle) - localY * Math.sin(angle);
            y = 0.71 + localX * Math.sin(angle) + localY * Math.cos(angle);
          }
          physics.deform(x, y, z, point);
          if (exit && !reducedMotion && !brow && mesh.name !== 'boss-foot') {
            // Pants, belt and raised claws leave together as a recognizable bundle.
            // Blend out the jelly deformation as it detaches, then move rigidly.
            const px = mix(point.x, x, flight.flight);
            const py = mix(point.y, y, flight.flight) - 0.48;
            point.x = flight.x + flight.scale * (px * Math.cos(flight.angle) - py * Math.sin(flight.angle));
            point.y = flight.y + flight.scale * (px * Math.sin(flight.angle) + py * Math.cos(flight.angle));
            point.z = mix(point.z, z, flight.flight) * flight.scale;
          }
          positions.setXYZ(i, point.x, point.y, point.z);
        }
        positions.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
        mesh.geometry.computeBoundingSphere();
      }
      for (const effect of effects) {
        const i = effect.userData.effectIndex;
        const strength = exit ? 0 : recoil;
        effect.visible = !reducedMotion && strength > 0.01;
        const a = i / 5 * Math.PI * 2 + recoil * 0.4;
        effect.position.set(Math.cos(a) * 0.65, 2.28 + Math.sin(a) * 0.25, 1.32);
        effect.scale.setScalar(strength);
        effect.rotation.z = a;
      }
      departure.update(exit, reducedMotion);
    },
    dispose() { departure.dispose(); meshes.forEach(mesh => mesh.geometry.dispose()); Object.values(materials).forEach(material => material.dispose()); group.removeFromParent(); },
  };
}
