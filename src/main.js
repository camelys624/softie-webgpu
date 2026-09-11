import * as THREE from 'three/webgpu';
import { JellyPhysics } from './physics.js';
import { makeSlime } from './slime.js';
import { makeStudio } from './studio.js';
import { setupUI } from './ui.js';
import { createPetController, gazeFromCursor, isPetMode, petCamera, PET_BOUNDS, petSizeFromSearch } from './pet.js';
import { sound } from './sound.js';
import './style.css';

const petMode = isPetMode(location.search);
const desktop = window.softieDesktop;
const initialPetSize = petSizeFromSearch(location.search);
const physics = new JellyPhysics();
if (petMode) physics.setBounds(PET_BOUNDS);
let slime, studio, ready = false;
let isDizzyPending = false;
physics.onLand = impact => {
  if (!ready) return;
  if (isDizzyPending) {
    isDizzyPending = false;
    sound.playDizzyLand(impact);
    slime?.faceMotion.react('dizzy');
  } else {
    sound.playLand(impact);
  }
};
physics.onEntryComplete = () => {
  slime?.faceMotion.react('happy');
  sound.playWakeup();
};
function poke() {
  if (!ready) return;
  physics.poke();
  slime.faceMotion.react('surprised');
  sound.playPoke();
}
const ui = setupUI({
  onColor: ({ color }) => { slime?.setColor(color); studio?.setColor(color); slime?.faceMotion.react('wink'); },
  onStiffness: stiffness => physics.setConfig({ stiffness }),
  onDamping: damping => physics.setConfig({ damping }),
  onPoke: poke,
  onReset: () => {
    isDizzyPending = false;
    physics.reset();
    slime?.setColor('#f17fa9');
    studio?.setColor('#f17fa9');
    slime?.faceMotion.reset();
  },
  onWakeup: () => {
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotion.matches || petMode) {
      sound.playWakeup();
    } else {
      physics.startEntry();
    }
  },
  pet: petMode,
});
const petController = petMode ? createPetController({
  desktop,
  ui,
  size: initialPetSize,
  onSize: level => desktop?.send('softie:resize', { level }),
}) : null;

async function start() {
  if (!navigator.gpu) throw new Error('gpuUnsupported');
  const canvas = document.querySelector('#slime-canvas');
  const stage = document.querySelector('#stage');
  // Renderer + one explicit backend: no fallback backend is even registered.
  const renderer = new THREE.Renderer(new THREE.WebGPUBackend({
    canvas, antialias: true, alpha: petMode, powerPreference: 'high-performance',
  }), { antialias: true, alpha: petMode, getFallback: null });
  renderer.library = new THREE.StandardNodeLibrary();
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor('#f5f5f3', petMode ? 0 : 1);
  await renderer.init();
  if (!renderer.backend.isWebGPUBackend) throw new Error('nativeRequired');

  const scene = new THREE.Scene();
  scene.background = petMode ? null : new THREE.Color('#f5f5f3');
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
  studio = makeStudio(renderer, scene);
  studio.setColor('#f17fa9');
  slime = makeSlime(physics, scene.environment, { transparentBackdrop: petMode });
  scene.add(slime.group);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const syncMotionPreference = () => { slime.faceMotion.reducedMotion = reducedMotion.matches; };
  syncMotionPreference();
  reducedMotion.addEventListener('change', syncMotionPreference);
  let dpr = Math.min(Math.max(devicePixelRatio, 1), 1.5);
  const resize = () => {
    const rect = stage.getBoundingClientRect();
    const { width, height } = rect;
    renderer.setPixelRatio(dpr);
    if (petMode) {
      Object.assign(canvas.style, { position: 'absolute', left: '0', top: '0', width: `${width}px`, height: `${height}px` });
      renderer.setSize(width, height, false);
      const framing = petCamera(width, height);
      camera.aspect = framing.aspect;
      const distance = framing.visibleHeight / (2 * Math.tan(THREE.MathUtils.degToRad(16)));
      camera.position.set(0, framing.centerY + distance * 0.12, distance);
      camera.lookAt(0, framing.centerY, 0);
      camera.clearViewOffset();
    } else {
      // Overscan the designed hero viewport so a lifted jelly is not sliced by its box.
      // A camera view offset preserves the reference framing and its pixel scale.
      const desktopLayout = window.innerWidth >= 900;
      const left = Math.max(0, rect.left);
      const top = desktopLayout ? Math.max(0, rect.top) : 0;
      const right = Math.max(0, (desktopLayout ? window.innerWidth * 0.744 - 12 : window.innerWidth) - rect.right);
      const bottom = desktopLayout ? Math.max(0, window.innerHeight - rect.bottom) : 0;
      const canvasWidth = width + left + right, canvasHeight = height + top + bottom;
      Object.assign(canvas.style, {
        position: 'absolute', left: `${-left}px`, top: `${-top}px`,
        width: `${canvasWidth}px`, height: `${canvasHeight}px`,
      });
      renderer.setSize(canvasWidth, canvasHeight, false);
      camera.aspect = width / height;
      const visibleHeight = Math.max(desktopLayout ? 3.25 : 3.85, (desktopLayout ? 4.12 : 4.45) / camera.aspect);
      const distance = visibleHeight / (2 * Math.tan(THREE.MathUtils.degToRad(16)));
      const camY = desktopLayout ? 1.1 + distance * 0.15 : 1.30 + distance * 0.12;
      const lookAtY = desktopLayout ? 1.03 : 1.22;
      camera.position.set(0.19, camY, distance);
      camera.lookAt(0.19, lookAtY, 0);
      camera.setViewOffset(width, height, -left, -top, canvasWidth, canvasHeight);
    }
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane();
  const worldTarget = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const gazeOrigin = new THREE.Vector3();
  const clearGaze = () => slime.faceMotion.lookAt(0, 0);
  const eyeInWindow = () => {
    const r = canvas.getBoundingClientRect();
    physics.deform(0, 1.2, 1.15, gazeOrigin);
    gazeOrigin.add(slime.group.position).project(camera);
    return {
      x: r.left + (gazeOrigin.x + 1) * r.width / 2,
      y: r.top + (1 - gazeOrigin.y) * r.height / 2,
    };
  };
  const followPointer = event => {
    if (event.pointerType !== 'mouse' || !finePointer.matches) { clearGaze(); return; }
    const eye = eyeInWindow();
    const r = canvas.getBoundingClientRect();
    slime.faceMotion.lookAt((event.clientX - eye.x) / (r.width * 0.24), (eye.y - event.clientY) / (r.height * 0.24));
  };
  const removePetCursor = petController?.onCursor(point => {
    if (!finePointer.matches || !point) { clearGaze(); return; }
    const eye = eyeInWindow();
    const gaze = gazeFromCursor(point, { x: window.screenX + eye.x, y: window.screenY + eye.y });
    slime.faceMotion.lookAt(gaze.x, gaze.y);
  }) ?? (() => {});
  window.addEventListener('pointermove', followPointer, { passive: true });
  document.documentElement.addEventListener('pointerleave', clearGaze);
  let pointerId = null;
  let pressTime = 0, pressX = 0, pressY = 0, moved = false;
  let lastMoveTime = 0, lastMoveX = 0, lastMoveY = 0;
  let maxStretchDist = 0;
  let shakePathDist = 0, shakeWindowStart = 0, shakeStartX = 0, shakeStartY = 0;
  let dizzyUntil = 0, dizzyPendingUntil = 0;
  const ray = event => {
    const r = canvas.getBoundingClientRect();
    ndc.set((event.clientX - r.left) / r.width * 2 - 1, -(event.clientY - r.top) / r.height * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  };
  canvas.addEventListener('pointerdown', event => {
    if (pointerId !== null || event.button !== 0) return;
    ray(event);
    const hit = raycaster.intersectObject(slime.body, false)[0];
    if (!hit) return;
    pointerId = event.pointerId;
    pressTime = performance.now(); pressX = event.clientX; pressY = event.clientY; moved = false;
    lastMoveTime = performance.now(); lastMoveX = event.clientX; lastMoveY = event.clientY;
    maxStretchDist = 0;
    shakePathDist = 0;
    shakeWindowStart = performance.now();
    shakeStartX = event.clientX;
    shakeStartY = event.clientY;
    dizzyUntil = 0;
    dizzyPendingUntil = 0;
    isDizzyPending = false;
    canvas.setPointerCapture(pointerId);
    camera.getWorldDirection(normal);
    plane.setFromNormalAndCoplanarPoint(normal, hit.point);
    const local = hit.point.clone().sub(slime.group.position);
    physics.beginGrab(local, hit.point);
    slime.faceMotion.grab(true);
    ui.setInteraction('grabbing');
    sound.playSquish();
    event.preventDefault();
  });
  canvas.addEventListener('pointermove', event => {
    if (pointerId !== null) {
      if (event.pointerId !== pointerId) return;
      const now = performance.now();
      const dt = Math.max(1, now - lastMoveTime);
      const dx = event.clientX - lastMoveX;
      const dy = event.clientY - lastMoveY;
      const moveDist = Math.hypot(dx, dy);
      const speed = moveDist / dt;
      lastMoveTime = now; lastMoveX = event.clientX; lastMoveY = event.clientY;

      const totalDist = Math.hypot(event.clientX - pressX, event.clientY - pressY);
      if (totalDist > 8) moved = true;

      // 1. Shake Detection via Path Curvature / Back-and-Forth Motion
      // Linear dragging has netDist ≈ shakePathDist (turnaround ≈ 0) -> Never triggers!
      // Rapid shaking (back-and-forth or rapid circular motions) produces huge turnaround!
      if (now - shakeWindowStart > 420) {
        shakeWindowStart = now;
        shakeStartX = event.clientX;
        shakeStartY = event.clientY;
        shakePathDist = 0;
      }

      if (speed > 0.60) {
        shakePathDist += moveDist;
      }

      const netDist = Math.hypot(event.clientX - shakeStartX, event.clientY - shakeStartY);
      const turnaround = shakePathDist - netDist;

      // When vigorously shaken back-and-forth or in rapid tight circles:
      if (turnaround > 150 && shakePathDist > 220) {
        dizzyUntil = now + 650;
        isDizzyPending = true;
        dizzyPendingUntil = now + 2000;
        sound.playDizzy();
        shakeWindowStart = now;
        shakeStartX = event.clientX;
        shakeStartY = event.clientY;
        shakePathDist = 0;
      }

      // 2. Stretch sound (only when not dizzy-shaking and actively pulling outward)
      const isDizzy = now < dizzyUntil;
      if (!isDizzy && totalDist > 32 && totalDist > maxStretchDist + 8) {
        maxStretchDist = totalDist;
        const stretchRatio = Math.min(1.0, (totalDist - 25) / 170);
        sound.playStretch(stretchRatio);
      } else if (totalDist < maxStretchDist - 25) {
        maxStretchDist = totalDist + 10;
      }

      ray(event);
      if (raycaster.ray.intersectPlane(plane, worldTarget)) physics.moveGrab(worldTarget);
      return;
    }
    ray(event);
    const hit = raycaster.intersectObject(slime.body, false).length > 0;
    canvas.style.cursor = hit ? 'grab' : 'default';
  });
  const triggerDizzyLand = (impact = 1.3) => {
    if (!isDizzyPending) return;
    isDizzyPending = false;
    sound.playDizzyLand(impact);
    slime?.faceMotion.react('dizzy');
  };
  const release = event => {
    if (pointerId === null || (event?.pointerId !== undefined && event.pointerId !== pointerId)) return;
    const id = pointerId;
    pointerId = null;
    dizzyUntil = 0;
    physics.endGrab();

    const willBeDizzy = isDizzyPending && performance.now() < dizzyPendingUntil;
    const shouldCelebrate = event?.type === 'pointerup' && !willBeDizzy;
    slime.faceMotion.grab(false, shouldCelebrate);

    if (event?.type === 'pointerup') {
      if (!moved && performance.now() - pressTime < 160) poke();
      else sound.playBounce(moved ? 1.15 : 0.8);
    }

    // Guarantee landing trigger when touching ground
    if (willBeDizzy) {
      let settled = false;
      const checkLand = () => {
        if (settled) return;
        if (physics.position.y <= 0.08 || !isDizzyPending) {
          settled = true;
          triggerDizzyLand(1.3);
        }
      };
      const timer = setInterval(checkLand, 16);
      setTimeout(() => { settled = true; clearInterval(timer); }, 900);
    } else {
      isDizzyPending = false;
    }

    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    ui.setInteraction('idle');
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);
  window.addEventListener('blur', () => { release(); clearGaze(); });
  window.addEventListener('keydown', event => {
    if (event.code !== 'Space' || event.repeat || /INPUT|BUTTON|TEXTAREA/.test(event.target.tagName)) return;
    event.preventDefault(); poke();
  });
  const unlockAudio = () => sound.resume();
  window.addEventListener('pointerdown', unlockAudio, { once: true, passive: true });
  window.addEventListener('keydown', unlockAudio, { once: true, passive: true });

  let lastActivity = performance.now();
  const registerActivity = () => { lastActivity = performance.now(); };
  window.addEventListener('pointermove', registerActivity, { passive: true });
  window.addEventListener('pointerdown', registerActivity, { passive: true });
  window.addEventListener('keydown', registerActivity, { passive: true });

  const ambientInterval = setInterval(() => {
    if (!ready || document.hidden || pointerId !== null) return;
    if (performance.now() - lastActivity > 12000) {
      sound.playAmbientBubble();
      lastActivity = performance.now() - 3000;
    }
  }, 3000);

  let frames = 0, fps = 0, previous = performance.now(), windowStart = previous, windowFrames = 0;
  let time = 0, slowWindows = 0;
  const frameTimes = [];
  slime.update(0);
  await renderer.compileAsync(scene, camera);
  ready = true;
  ui.setStatus('ready');
  petController?.ready();
  renderer.setAnimationLoop(now => {
    const elapsed = now - previous;
    previous = now;
    if (document.hidden) return;
    const dt = Math.min(Math.max(elapsed / 1000, 0), 1 / 15);
    time += dt;
    physics.update(dt);
    slime.update(time);
    studio.update(physics.position);
    renderer.render(scene, camera);
    frames++; windowFrames++;
    frameTimes.push(elapsed);
    if (frameTimes.length > 600) frameTimes.shift();
    if (now - windowStart >= 1000) {
      fps = windowFrames * 1000 / (now - windowStart);
      ui.setFps(fps);
      if (fps < 52 && frames > 180) slowWindows++; else slowWindows = 0;
      if (slowWindows >= 3 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); resize(); slowWindows = 0; }
      windowStart = now; windowFrames = 0;
    }
  });
  renderer.backend.device.lost.then(info => {
    if (info.reason === 'destroyed') return;
    ready = false;
    renderer.setAnimationLoop(null);
    ui.showError('deviceLost');
  });
  document.addEventListener('visibilitychange', () => {
    previous = performance.now(); windowStart = previous; windowFrames = 0;
    if (document.hidden) { release(); clearGaze(); }
  });
  const getDiagnostics = () => ({
    backend: renderer.backend.isWebGPUBackend ? 'native-WebGPU' : 'unexpected',
    fps, frames, dpr, frameTimes: [...frameTimes],
    drawCalls: renderer.info.render.drawCalls, triangles: renderer.info.render.triangles,
    memory: { ...renderer.info.memory },
    face: { expression: slime.faceMotion.expression, ...slime.faceMotion.state },
    physics: { ...physics.diagnostics, center: { ...physics.position }, dragging: pointerId !== null },
  });
  if (import.meta.env.DEV || new URLSearchParams(location.search).has('test')) {
    window.__SOFTIE__ = { getDiagnostics, physics, renderer, slime, studio, camera };
  }
  window.addEventListener('pagehide', () => {
    renderer.setAnimationLoop(null); observer.disconnect();
    clearInterval(ambientInterval);
    window.removeEventListener('pointermove', followPointer);
    document.documentElement.removeEventListener('pointerleave', clearGaze);
    reducedMotion.removeEventListener('change', syncMotionPreference);
    removePetCursor();
    slime.dispose(); studio.dispose(); renderer.dispose();
  }, { once: true });
}

start().catch(error => {
  console.error('[softie] WebGPU initialization:', error);
  ui.showError(error.message || 'initFailed');
});
