import * as THREE from 'three/webgpu';
import { BossEncounter } from './boss.js';
import { makeBoss } from './boss-model.js';
import { bossPose } from './boss-pose.js';
import { createMagicHammer } from './magic-hammer.js';
import { createBubblePositioner } from './speech-bubble.js';
import { BOSS_DIALOGUES } from './boss-dialogue.js';

const copy = {
  zh: {
    shocked: '哎？我还没说完呢！', defiant: '我只是要求高一点嘛……',
  },
  en: {
    shocked: 'Hey! I wasn’t finished!', defiant: 'I just have high standards…',
  },
};

export function setupBoss({ scene, slime, physics, canvas, camera, ui, sound, pet, canSpawn, onRelease }) {
  const encounter = new BossEncounter();
  const model = makeBoss(physics);
  scene.add(model.group);
  const costumeTargets = model.group.children.filter(mesh => mesh.userData.rig !== 'effect');
  const bubble = document.createElement('aside');
  bubble.className = 'speech-bubble boss-bubble';
  bubble.hidden = true;
  bubble.setAttribute('role', 'status');
  bubble.setAttribute('aria-live', 'polite');
  bubble.setAttribute('aria-atomic', 'true');
  bubble.innerHTML = '<p></p>';
  document.body.append(bubble);
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const placeBubble = createBubblePositioner({ physics, camera, canvas, pet });
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const magic = createMagicHammer(reducedMotion);
  const hammer = magic.element;
  const screenPoint = new THREE.Vector3();
  const projected = (x, y, z) => {
    physics.deform(x, y, z, screenPoint);
    screenPoint.add(physics.position).project(camera);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + (screenPoint.x + 1) * r.width / 2, y: r.top + (1 - screenPoint.y) * r.height / 2 };
  };
  const placeHammer = point => {
    const a = projected(-0.64, 1.58, 1.24), b = projected(0.64, 0.88, 1.24);
    magic.move({ x: point.clientX, y: point.clientY },
      { left: Math.min(a.x, b.x), right: Math.max(a.x, b.x), top: Math.min(a.y, b.y), bottom: Math.max(a.y, b.y) },
      bubble.hidden ? null : bubble.getBoundingClientRect());
  };
  let heldPointer = null, lastPoint = null, showing = false, textKey = '';
  let pose = null;
  const listeners = [];
  const listen = (target, type, listener, options) => {
    target.addEventListener(type, listener, options);
    listeners.push(() => target.removeEventListener(type, listener, options));
  };
  function overBoss(event) {
    const r = canvas.getBoundingClientRect();
    ndc.set((event.clientX - r.left) / r.width * 2 - 1, 1 - (event.clientY - r.top) / r.height * 2);
    raycaster.setFromCamera(ndc, camera);
    model.group.updateWorldMatrix(true, true);
    slime.body.updateWorldMatrix(true, false);
    return raycaster.intersectObject(slime.body, false).length > 0 || raycaster.intersectObjects(costumeTargets, false).length > 0;
  }
  function hover(event) {
    lastPoint = { clientX: event.clientX, clientY: event.clientY };
    const exiting = pose?.phase === 'exit';
    const hit = encounter.active && (!exiting || !encounter.hits) && overBoss(event);
    hammer.hidden = !hit || exiting;
    canvas.style.cursor = hit && !exiting ? 'none' : 'default';
    if (hit && !exiting) placeHammer(event);
    else magic.hide();
    return hit;
  }
  function hit() {
    if (pose?.phase === 'exit' && encounter.hits) return false;
    if (!encounter.hit()) return false;
    // A first hit can still interrupt an ignored visit right up to its 10s deadline.
    if (pose?.phase === 'exit') {
      pose = bossPose(encounter, performance.now(), reducedMotion.matches);
      if (lastPoint) hover(lastPoint);
    }
    physics.poke(reducedMotion.matches ? 0.28 : 0.34);
    sound.resume();
    sound.playPurify();
    if (pose?.phase !== 'exit') magic.strike(heldPointer !== null && lastPoint
      ? { x: lastPoint.clientX, y: lastPoint.clientY } : projected(0, 1.5, 1.2));
    return true;
  }
  function stopHold() {
    const id = heldPointer;
    heldPointer = null;
    if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }
  function sync(celebrate = true) {
    if (showing === encounter.active) return;
    showing = encounter.active;
    slime.faceMotion.bossPresent = showing;
    pose = showing ? bossPose(encounter, performance.now(), reducedMotion.matches) : null;
    slime.setBossPose(pose);
    model.group.visible = showing;
    bubble.hidden = !showing;
    document.body.classList.toggle('boss-active', showing);
    if (showing) {
      const arrival = encounter.startedAt;
      void sound.playBossArrival(() => encounter.active && encounter.startedAt === arrival
        && performance.now() - arrival < 1200);
      model.update(pose, reducedMotion.matches);
      if (lastPoint) hover(lastPoint);
    } else {
      stopHold();
      magic.hide();
      canvas.style.cursor = '';
      if (celebrate) {
        slime.faceMotion.wakeUp();
        slime.faceMotion.calmDown(0.35);
        if (encounter.hits) {
          slime.faceMotion.bossDefeated();
          sound.playHappyPurr();
        } else slime.faceMotion.bossIgnored();
        onRelease?.();
      }
    }
  }
  function reset() { encounter.end(); sync(false); }
  function summon() {
    if (!canSpawn() || document.hidden) return false;
    encounter.start(); sync(); canvas.focus({ preventScroll: true }); return true;
  }
  listen(canvas, 'pointerdown', event => {
    if (!encounter.active) return;
    event.stopImmediatePropagation();
    if (event.button !== 0 || heldPointer !== null || !hover(event)) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    heldPointer = event.pointerId;
    canvas.setPointerCapture(heldPointer);
    hit();
  }, true);
  listen(canvas, 'pointermove', event => {
    if (!encounter.active) { lastPoint = { clientX: event.clientX, clientY: event.clientY }; return; }
    event.stopImmediatePropagation();
    if (heldPointer === null || heldPointer === event.pointerId) hover(event);
  }, true);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    listen(canvas, type, event => {
      if (event.pointerId === heldPointer) { stopHold(); if (event.pointerType === 'touch') magic.hideProp(); }
    }, true);
  }
  listen(canvas, 'pointerleave', event => { lastPoint = null; if (event.pointerType === 'touch') magic.hideProp(); else magic.hide(); stopHold(); });
  listen(window, 'blur', () => { stopHold(); magic.hide(); });
  listen(window, 'softie:window-drag-start', stopHold);
  listen(document, 'visibilitychange', () => { if (document.hidden) reset(); });
  const button = document.querySelector('#boss-summon');
  if (button) listen(button, 'click', summon);
  return {
    encounter, model, hit, reset, summon,
    get pose() { return pose; },
    update(now) {
      encounter.update(canSpawn());
      sync();
      if (button) button.disabled = encounter.active || !canSpawn();
      if (!encounter.active) return;
      if (heldPointer !== null && lastPoint && overBoss(lastPoint)) hit();
      const previousPhase = pose?.phase;
      pose = bossPose(encounter, now, reducedMotion.matches);
      if (pose.phase === 'exit' && previousPhase !== 'exit') {
        stopHold();
        magic.hide();
        canvas.style.cursor = 'default';
        slime.faceMotion.wakeUp();
        slime.faceMotion.calmDown(0.35);
      }
      bubble.hidden = pose.phase === 'exit';
      slime.setBossPose(pose);
      model.setFaceColor(slime.face.material.color);
      model.update(pose, reducedMotion.matches);
      const lang = ui.state.language === 'en' ? 'en' : 'zh';
      const words = copy[lang];
      const key = `${lang}:${encounter.startedAt}:${pose.phase}`;
      if (textKey !== key) {
        textKey = key;
        const dialogue = BOSS_DIALOGUES[encounter.line][lang];
        bubble.querySelector('p').textContent = !encounter.hits ? dialogue.line
          : ['panic', 'exit'].includes(pose.phase) ? dialogue.apology : words[pose.phase];
      }
      bubble.dataset.hit = String(encounter.hits > 0);
      bubble.dataset.phase = pose.phase;
      if (!bubble.hidden) placeBubble(bubble);
      if (!hammer.hidden && lastPoint) placeHammer(lastPoint);
    },
    dispose() { reset(); listeners.forEach(remove => remove()); bubble.remove(); magic.dispose(); model.dispose(); },
  };
}
