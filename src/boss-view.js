import * as THREE from 'three/webgpu';
import { BossEncounter } from './boss.js';
import { makeBoss } from './boss-model.js';
import { bossPose } from './boss-pose.js';
import { createMagicHammer } from './magic-hammer.js';

const copy = {
  zh: {
    title: '甩锅蟹总 · 上线训话', hint: '点击 / 按住净化 · 不理 5 秒消失',
    shocked: '哎？我还没说完呢！', defiant: '我只是要求高一点嘛……',
    lines: ['做了这么久，就这些？', '这个应该算在原来的费用里。', '还是第一版好，你怎么没坚持？', '这也需要我教？'],
    apologies: ['是我没认真看，你这版做得不错。', '新增的工作，费用另算！', '这版就定了，不改了！', '是我没说清楚，我把需求写好。'],
    count: n => `净化 × ${n} · 老板退散中`,
  },
  en: {
    title: 'THE BLAME-SHIFTING BOSS', hint: 'Click / hold to purify · Leaves in 5s',
    shocked: 'Hey! I wasn’t finished!', defiant: 'I just have high standards…',
    lines: ['All that time, and this is it?', 'That should be in the original fee.', 'V1 was better. Why didn’t you insist?', 'Do I have to teach you everything?'],
    apologies: ['I didn’t look properly. Good work.', 'Extra work gets extra pay!', 'This version is final. No more edits!', 'My fault. I’ll write a clear brief.'],
    count: n => `BONK × ${n} · Boss retreating`,
  },
};

export function setupBoss({ scene, slime, physics, canvas, camera, ui, sound, pet, canSpawn, onRelease }) {
  const encounter = new BossEncounter();
  const model = makeBoss(physics);
  scene.add(model.group);
  const costumeTargets = model.group.children.filter(mesh => mesh.userData.rig !== 'effect');
  const bubble = document.createElement('aside');
  bubble.className = 'boss-bubble';
  bubble.hidden = true;
  bubble.setAttribute('role', 'status');
  bubble.setAttribute('aria-live', 'polite');
  bubble.innerHTML = '<strong></strong><p></p><small></small><div class="boss-timer"><i></i></div>';
  document.body.append(bubble);
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const anchor = new THREE.Vector3();
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
    // A first hit can still interrupt an ignored visit right up to its 5s deadline.
    if (pose?.phase === 'exit') {
      pose = bossPose(encounter, performance.now(), reducedMotion.matches);
      if (lastPoint) hover(lastPoint);
    }
    physics.poke(0.28);
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
    pose = showing ? bossPose(encounter, performance.now(), reducedMotion.matches) : null;
    slime.setBossPose(pose);
    model.group.visible = showing;
    bubble.hidden = !showing;
    document.body.classList.toggle('boss-active', showing);
    if (showing) {
      model.update(pose, reducedMotion.matches);
      if (lastPoint) hover(lastPoint);
    } else {
      stopHold();
      magic.hide();
      canvas.style.cursor = '';
      if (celebrate) {
        slime.faceMotion.wakeUp();
        slime.faceMotion.calmDown(0.35);
        slime.faceMotion.react('happy');
        if (encounter.hits) sound.playHappyPurr();
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
      const key = `${lang}:${encounter.startedAt}:${encounter.hits}:${pose.phase}`;
      if (textKey !== key) {
        textKey = key;
        bubble.querySelector('strong').textContent = words.title;
        bubble.querySelector('p').textContent = !encounter.hits ? words.lines[encounter.line]
          : ['panic', 'exit'].includes(pose.phase) ? words.apologies[encounter.line] : words[pose.phase];
        bubble.querySelector('small').textContent = encounter.hits ? words.count(encounter.hits) : words.hint;
      }
      bubble.dataset.hit = String(encounter.hits > 0);
      bubble.dataset.phase = pose.phase;
      const duration = encounter.firstHitAt === null ? 5000 : 2000;
      bubble.querySelector('i').style.transform = `scaleX(${Math.max(0, (encounter.deadline - now) / duration)})`;
      const r = canvas.getBoundingClientRect();
      anchor.set(0, pet ? 2.8 : 3.35, 0).add(physics.position).project(camera);
      const width = bubble.offsetWidth;
      bubble.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, r.left + (anchor.x + 1) * r.width / 2 - width / 2))}px`;
      bubble.style.top = `${Math.max(pet ? 19 : 8, r.top + (1 - anchor.y) * r.height / 2 - bubble.offsetHeight - 10)}px`;
      if (!hammer.hidden && lastPoint) placeHammer(lastPoint);
    },
    dispose() { reset(); listeners.forEach(remove => remove()); bubble.remove(); magic.dispose(); model.dispose(); },
  };
}
