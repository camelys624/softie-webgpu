import * as THREE from 'three/webgpu';

const clamp = t => Math.max(0, Math.min(1, t));
const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };

// A softly joined silhouette prevents individual smoke lobes looking like beads.
function cloudTexture() {
  const width = 320, height = 280;
  const data = new Uint8Array(width * height * 4);
  const lobes = [[0, 0, 0.66, 0.49], [-0.67, 0.04, 0.29, 0.32], [-0.48, 0.40, 0.32, 0.32],
    [-0.06, 0.55, 0.33, 0.30], [0.40, 0.43, 0.34, 0.32], [0.69, 0.10, 0.32, 0.31],
    [0.51, -0.30, 0.31, 0.30], [0.11, -0.46, 0.34, 0.28], [-0.34, -0.35, 0.32, 0.29]];
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    const x = (col / (width - 1) - 0.5) * 2.2, y = (row / (height - 1) - 0.5) * 1.9;
    let distance = 10, glow = 0;
    for (const [cx, cy, rx, ry] of lobes) {
      const d = (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry);
      const h = clamp(0.5 + 0.5 * (d - distance) / 0.10);
      distance = d + (distance - d) * h - 0.10 * h * (1 - h);
      glow = Math.max(glow, Math.exp(-3 * (((x - cx + 0.06) / rx) ** 2 + ((y - cy - 0.10) / ry) ** 2)));
    }
    const light = clamp(0.28 + 0.23 * (y + 0.9) / 1.8 + glow * 0.48);
    const n = (row * width + col) * 4;
    data[n] = 220 + 35 * light;
    data[n + 1] = 174 + 72 * light;
    data[n + 2] = 236 + 17 * light;
    data[n + 3] = 255 * smooth(0.5 - distance / 0.055);
  }
  const texture = new THREE.DataTexture(data, width, height);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

// Start dissolving before the launch settles so there is no frozen final pose.
export function exitMotion(exit) {
  const flight = smooth(exit / 0.58);
  const dissolve = smooth((exit - 0.50) / 0.50);
  const remaining = 1 - dissolve;
  return {
    flight, remaining, assemble: smooth(exit / 0.24),
    x: 1.35 * flight + 0.14 * dissolve, y: 0.48 + 2.22 * flight + 0.28 * dissolve,
    scale: (1 - 0.57 * flight) * remaining, angle: -0.32 * flight - 0.12 * dissolve,
    opacity: remaining,
    smoke: smooth((exit - 0.12) / 0.32) * remaining,
  };
}

// Scalloped lavender cloud, tapering curls and a few warm stars from panel A3.
export function makeBossExit() {
  const group = new THREE.Group();
  group.name = 'boss-exit-cloud';
  group.userData.rig = 'effect';
  const cloud = new THREE.Group();
  group.add(cloud);
  const plume = new THREE.Group();
  group.add(plume);
  const materials = [], geometries = [];
  const smokeTexture = cloudTexture();
  const puffMaterial = new THREE.MeshBasicNodeMaterial({
    map: smokeTexture,
    transparent: true, depthWrite: false, depthTest: false,
    toneMapped: false,
  });
  const curlMaterial = new THREE.MeshBasicNodeMaterial({ color: '#e9c5f3', transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
  const goldMaterial = new THREE.MeshBasicNodeMaterial({ color: '#ffcf81', transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
  materials.push(puffMaterial, curlMaterial, goldMaterial);
  const add = (geometry, material, parent, name) => {
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.renderOrder = 4;
    mesh.frustumCulled = false;
    parent.add(mesh);
    return mesh;
  };
  add(new THREE.PlaneGeometry(2.2, 1.9), puffMaterial, cloud, 'boss-exit-puff');
  // Each closed Bézier ribbon ends in a fine point, unlike round particle trails.
  const ribbon = new THREE.Shape();
  ribbon.moveTo(1.35, 0.43);
  ribbon.bezierCurveTo(1.75, 0.36, 2.30, 0.71, 2.02, 1.29);
  ribbon.bezierCurveTo(1.81, 1.62, 1.57, 1.75, 1.68, 2.31);
  ribbon.bezierCurveTo(1.10, 1.85, 1.43, 1.40, 1.64, 1.18);
  ribbon.bezierCurveTo(1.99, 0.85, 1.79, 0.49, 1.35, 0.43);
  const curl = add(new THREE.ShapeGeometry(ribbon, 30), curlMaterial, plume, 'boss-exit-curl');
  curl.position.z = 0;
  const wisp = new THREE.Shape();
  wisp.moveTo(1.38, 0.77);
  wisp.bezierCurveTo(1.74, 0.71, 2.00, 1.02, 1.69, 1.31);
  wisp.bezierCurveTo(1.80, 1.03, 1.60, 0.86, 1.38, 0.77);
  const tail = add(new THREE.ShapeGeometry(wisp, 24), curlMaterial, plume, 'boss-exit-wisp');
  tail.position.z = 0;
  const stars = [];
  for (const [x, y, size] of [[1.77, 1.52, 0.15], [2.10, 1.93, 0.09], [2.05, 1.0, 0.095], [1.06, 1.61, 0.045]]) {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? size * 0.45 : size, a = Math.PI / 2 + i * Math.PI / 5;
      if (!i) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    shape.closePath();
    const star = add(new THREE.ShapeGeometry(shape), goldMaterial, plume, 'boss-release-star');
    star.position.set(x, y, 0);
    stars.push(star);
  }
  // Small relief marks frame the happy pet, leaving its face clear.
  for (const [x, y, angle] of [[-1.40, 1.83, 0.42], [-1.23, 2.17, 0.75], [-0.06, 2.90, -0.3], [0.38, 2.74, -0.65]]) {
    const ray = add(new THREE.CapsuleGeometry(0.023, 0.15, 4, 8), goldMaterial, group, 'boss-relief-ray');
    ray.position.set(x, y, 0.6);
    ray.rotation.z = angle;
  }
  return {
    group,
    update(exit, reducedMotion, celebrate = true) {
      const motion = exitMotion(exit);
      group.visible = !reducedMotion && motion.smoke > 0.001;
      cloud.position.set(motion.x, motion.y, 0);
      cloud.scale.setScalar((0.6 + 0.28 * motion.flight) * motion.remaining);
      // Pull the entire smoke tail and its stars into the departing cloud.
      plume.scale.setScalar(motion.remaining);
      plume.position.set(motion.x * (1 - motion.remaining), motion.y * (1 - motion.remaining), 0);
      puffMaterial.opacity = motion.smoke * 0.94;
      curlMaterial.opacity = motion.smoke * 0.72;
      goldMaterial.opacity = smooth((exit - 0.25) / 0.20) * motion.opacity;
      for (const star of stars) star.rotation.z = (1 - motion.flight) * 0.3;
      for (const child of group.children) if (child.name === 'boss-relief-ray') child.visible = celebrate;
    },
    dispose() { smokeTexture.dispose(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); },
  };
}
