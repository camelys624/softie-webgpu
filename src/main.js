import * as THREE from 'three/webgpu';
import { JellyPhysics } from './physics.js';
import { makeSlime } from './slime.js';
import { makeStudio } from './studio.js';
import { setupUI } from './ui.js';
import { createPetController, gazeFromCursor, isPetMode, petCamera, PET_BOUNDS, petSizeFromSearch } from './pet.js';
import { sound } from './sound.js';
import { RageMeter } from './rage-meter.js';
import { setupBoss } from './boss-view.js';
import { createMoodBubble } from './speech-bubble.js';
import './style.css';

const petMode = isPetMode(location.search);
const desktop = window.softieDesktop;
const initialPetSize = petSizeFromSearch(location.search);
const physics = new JellyPhysics();
if (petMode) physics.setBounds(PET_BOUNDS);
const rageMeter = petMode ? null : new RageMeter();
let slime, studio, ready = false;
let boss;
let moodBubble;
let isDizzyPending = false;
let lastSnoreTime = 0;
let lastActivity = performance.now();
const registerActivity = () => {
  // Only update activity when awake so mouse movement never disturbs sleep
  if (!slime?.faceMotion.isSleeping) {
    lastActivity = performance.now();
  }
};

physics.onLand = impact => {
  if (!ready) return;
  if (isDizzyPending) {
    isDizzyPending = false;
    sound.playDizzyLand(impact);
    slime?.faceMotion.react('dizzy');
  } else if (slime?.faceMotion.anger > 0.48) {
    sound.playAngryLand(impact);
  } else {
    sound.playLand(impact);
  }
};
physics.onEntryComplete = () => {
  slime?.faceMotion.react('happy');
  sound.playWakeup();
};
let lastPokeTime = 0;
let rapidPokeCount = 0;

function poke() {
  if (!ready) return;
  if (boss?.encounter.active) { boss.hit(); return; }
  const now = performance.now();
  lastActivity = now;

  if (slime.faceMotion.comfort()) {
    rapidPokeCount = 0;
    lastPokeTime = 0;
    physics.poke(0.28);
    sound.playHappyPurr();
    return;
  }

  if (slime?.faceMotion.isSleeping) {
    rapidPokeCount = 0;
    slime.faceMotion.wakeUp(true);
    sound.playStartle();
    physics.poke();
    return;
  }

  physics.poke();
  rageMeter?.pulse(1.0);

  const dtPoke = now - lastPokeTime;
  lastPokeTime = now;

  if (dtPoke < 750) {
    rapidPokeCount++;
  } else {
    rapidPokeCount = 1;
  }

  if (rapidPokeCount >= 2) {
    // Rapid continuous poking: emotion shifts towards annoyed and angry
    slime?.faceMotion.addAnger(0.20);
    rageMeter?.pulse(1.4);
    if (slime?.faceMotion.anger > 0.55) {
      sound.playAngryPoke(slime.faceMotion.anger);
    } else {
      sound.playPoke();
    }
  } else {
    // Single poke: restore original surprised round circle ':O' mouth!
    slime?.faceMotion.react('surprised');
    sound.playPoke();
  }
}
const ui = setupUI({
  onColor: ({ color }) => { slime?.setColor(color); studio?.setColor(color); slime?.faceMotion.react('wink'); },
  onAccessory: type => {
    slime?.setAccessory(type);
    slime?.faceMotion.react('wink');
  },
  onStiffness: stiffness => physics.setConfig({ stiffness }),
  onDamping: damping => physics.setConfig({ damping }),
  onPoke: poke,
  onReset: () => {
    boss?.reset();
    isDizzyPending = false;
    physics.reset();
    slime?.setColor('#f17fa9');
    studio?.setColor('#f17fa9');
    slime?.setAccessory('none');
    slime?.faceMotion.reset();
    moodBubble?.reset();
    ui.setMood('chill');
    rageMeter?.reset();
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
  onBoss: () => boss?.summon(),
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
  rageMeter?.setDevice(renderer.backend.device);

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
    let renderedLeft = 0;
    let renderedWidth = width;
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
      renderedLeft = left;
      renderedWidth = canvasWidth;
      Object.assign(canvas.style, {
        position: 'absolute', left: `${-left}px`, top: `${-top}px`,
        width: `${canvasWidth}px`, height: `${canvasHeight}px`,
      });
      renderer.setSize(canvasWidth, canvasHeight, false);
      camera.aspect = width / height;
      const visibleHeight = Math.max(desktopLayout ? 3.25 : 3.85, (desktopLayout ? 4.12 : 4.45) / camera.aspect);
      const distance = visibleHeight / (2 * Math.tan(THREE.MathUtils.degToRad(16)));
      const camY = desktopLayout ? 1.1 + distance * 0.15 : 1.18 + distance * 0.08;
      const lookAtY = desktopLayout ? 1.03 : 1.10;
      camera.position.set(0.19, camY, distance);
      camera.lookAt(0.19, lookAtY, 0);
      camera.setViewOffset(width, height, -left, -top, canvasWidth, canvasHeight);
    }
    camera.updateProjectionMatrix();
    rageMeter?.resize();
    if (rageMeter?.container && !petMode && width > 0) {
      const centerVec = new THREE.Vector3(0, 0, 0);
      centerVec.project(camera);
      const slimeStageX = -renderedLeft + (centerVec.x + 1) * renderedWidth / 2;
      rageMeter.container.style.left = `${Math.round(slimeStageX)}px`;
    }
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
    if (slime?.faceMotion.isSleeping) return;
    const eye = eyeInWindow();
    const r = canvas.getBoundingClientRect();
    slime.faceMotion.lookAt((event.clientX - eye.x) / (r.width * 0.24), (eye.y - event.clientY) / (r.height * 0.24));
  };
  const removePetCursor = petController?.onCursor(point => {
    if (!finePointer.matches || !point) { clearGaze(); return; }
    if (slime?.faceMotion.isSleeping) return;
    const eye = eyeInWindow();
    const gaze = gazeFromCursor(point, { x: window.screenX + eye.x, y: window.screenY + eye.y });
    slime.faceMotion.lookAt(gaze.x, gaze.y);
  }) ?? (() => {});
  window.addEventListener('pointermove', followPointer, { passive: true });
  document.documentElement.addEventListener('pointerleave', clearGaze);
  let pointerId = null;
  const touches = new Map();
  let pinchDistance = 0;
  let pinchSoundRatio = 1;
  const pinchA = new THREE.Vector3();
  const pinchB = new THREE.Vector3();
  const pinchMid = new THREE.Vector3();
  const pinchAxis = new THREE.Vector3();
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
    if (event.button !== 0) return;
    if (pointerId !== null) {
      if (event.pointerType !== 'touch' || touches.size !== 1 || touches.has(event.pointerId)) return;
      // The first finger must hit the body; the second may land beside its edge.
      ray(touches.get(pointerId));
      if (!raycaster.ray.intersectPlane(plane, pinchA)) return;
      ray(event);
      if (!raycaster.ray.intersectPlane(plane, pinchB)) return;
      const first = touches.get(pointerId);
      pinchDistance = Math.hypot(event.clientX - first.clientX, event.clientY - first.clientY);
      if (pinchDistance < 16) return;
      touches.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
      canvas.setPointerCapture(event.pointerId);
      pinchMid.copy(pinchA).add(pinchB).multiplyScalar(0.5);
      physics.beginGrab(pinchMid.clone().sub(slime.group.position), pinchMid);
      physics.beginPinch(pinchAxis.copy(pinchB).sub(pinchA));
      pinchSoundRatio = 1;
      moved = true;
      isDizzyPending = false;
      dizzyUntil = 0;
      event.preventDefault();
      return;
    }
    lastActivity = performance.now();
    ray(event);
    const hit = raycaster.intersectObject(slime.body, false)[0];

    // Clicking / tapping when asleep startles the slime awake!
    if (slime?.faceMotion.isSleeping) {
      slime.faceMotion.wakeUp(true);
      sound.playStartle();
      physics.poke();
      if (!hit) return;
    }

    if (!hit) return;
    pointerId = event.pointerId;
    if (event.pointerType === 'touch') touches.set(pointerId, { clientX: event.clientX, clientY: event.clientY });
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
    if (touches.has(event.pointerId)) {
      Object.assign(touches.get(event.pointerId), { clientX: event.clientX, clientY: event.clientY });
      if (touches.size === 2) {
        const [a, b] = touches.values();
        ray(a);
        const hitA = raycaster.ray.intersectPlane(plane, pinchA);
        ray(b);
        if (hitA && raycaster.ray.intersectPlane(plane, pinchB)) {
          physics.moveGrab(pinchMid.copy(pinchA).add(pinchB).multiplyScalar(0.5));
          const ratio = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY) / pinchDistance;
          physics.movePinch(ratio);
          if (Math.abs(ratio - pinchSoundRatio) > 0.12) {
            if (ratio > pinchSoundRatio) sound.playStretch(Math.min(1, Math.abs(ratio - 1)));
            else sound.playSquish();
            pinchSoundRatio = ratio;
          }
        }
        event.preventDefault();
        return;
      }
    }
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
        slime?.faceMotion.addAnger(0.42);
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
    if (touches.size === 2 && touches.has(event?.pointerId) && event.type === 'pointerup') {
      touches.delete(event.pointerId);
      const [id, remaining] = touches.entries().next().value;
      pointerId = id;
      physics.endPinch();
      ray(remaining);
      if (raycaster.ray.intersectPlane(plane, worldTarget)) {
        physics.beginGrab(worldTarget.clone().sub(slime.group.position), worldTarget);
      }
      pressX = lastMoveX = shakeStartX = remaining.clientX;
      pressY = lastMoveY = shakeStartY = remaining.clientY;
      lastMoveTime = shakeWindowStart = performance.now();
      shakePathDist = maxStretchDist = 0;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      return;
    }
    if (touches.has(event?.pointerId) && event.type !== 'pointerup') event = undefined;
    if (pointerId === null || (event?.pointerId !== undefined && event.pointerId !== pointerId)) return;
    const id = pointerId;
    pointerId = null;
    const capturedTouches = [...touches.keys()];
    touches.clear();
    for (const touchId of capturedTouches) {
      if (canvas.hasPointerCapture(touchId)) canvas.releasePointerCapture(touchId);
    }
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
  if (petMode) {
    window.addEventListener('softie:window-drag-start', () => {
      if (pointerId !== null) release();
    });
  }
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

  window.addEventListener('pointermove', registerActivity, { passive: true });
  window.addEventListener('pointerdown', registerActivity, { passive: true });
  window.addEventListener('keydown', registerActivity, { passive: true });

  const ambientInterval = setInterval(() => {
    if (!ready || document.hidden || pointerId !== null || boss?.encounter.active) return;
    if (performance.now() - lastActivity > 12000 && !slime?.faceMotion.isSleeping) {
      sound.playAmbientBubble();
      lastActivity = performance.now() - 3000;
    }
  }, 3000);

  boss = setupBoss({ scene, slime, physics, canvas, camera, ui, sound, pet: petMode,
    canSpawn: () => ready && pointerId === null && stage.getAttribute('aria-busy') === 'false',
    onRelease: () => { lastActivity = performance.now(); },
  });

  let frames = 0, fps = 0, previous = performance.now(), windowStart = previous, windowFrames = 0;
  moodBubble = createMoodBubble({ face: slime.faceMotion, ui, physics, camera, canvas, pet: petMode,
    isBossActive: () => boss.encounter.active });
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

    // Sleep mode when inactive for 15 seconds
    if (!boss.encounter.active && pointerId === null && !slime.faceMotion.isSleeping && now - lastActivity > 15000 && slime.faceMotion.anger < 0.25) {
      slime.faceMotion.fallAsleep();
    }

    // Gentle rhythmic snoring when sleeping
    if (!boss.encounter.active && slime.faceMotion.isSleeping && now - lastSnoreTime > 2400) {
      lastSnoreTime = now;
      sound.playSnore();
    }

    physics.update(dt);
    boss.update(now);
    slime.update(time);
    moodBubble.update(now);
    studio.update(physics.position);
    ui.setMood(slime.faceMotion.mood, slime.faceMotion.reassured);
    rageMeter?.update(dt, slime.faceMotion.anger, slime.faceMotion.mood, slime.faceMotion.isSleeping);
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
    boss.reset();
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
    face: { expression: slime.faceMotion.expression, ...slime.faceMotion.state,
      mood: slime.faceMotion.mood, sadnessCount: slime.faceMotion.sadnessCount,
      comfortDuration: slime.faceMotion.comfortDuration, comfortElapsed: slime.faceMotion.comfortElapsed },
    boss: { active: boss.encounter.active, hits: boss.encounter.hits, phase: boss.pose?.phase ?? 'idle', deadline: boss.encounter.deadline, nextAt: boss.encounter.nextAt },
    physics: { ...physics.diagnostics, center: { ...physics.position }, dragging: pointerId !== null },
  });
  if (import.meta.env.DEV || new URLSearchParams(location.search).has('test')) {
    window.__SOFTIE__ = { getDiagnostics, physics, renderer, slime, studio, camera, rageMeter, boss, sound };
  }
  window.addEventListener('pagehide', () => {
    renderer.setAnimationLoop(null); observer.disconnect();
    clearInterval(ambientInterval);
    window.removeEventListener('pointermove', followPointer);
    document.documentElement.removeEventListener('pointerleave', clearGaze);
    reducedMotion.removeEventListener('change', syncMotionPreference);
    removePetCursor();
    moodBubble.dispose(); boss.dispose(); slime.dispose(); studio.dispose(); renderer.dispose(); rageMeter?.dispose();
  }, { once: true });
}

start().catch(error => {
  console.error('[softie] WebGPU initialization:', error);
  ui.showError(error.message || 'initFailed');
});
