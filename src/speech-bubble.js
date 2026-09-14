import * as THREE from 'three/webgpu';
import { translate } from './i18n.js';

// Both speakers share an anchor and keep the pet's face unobstructed.
export function createBubblePositioner({ physics, camera, canvas, pet }) {
  const point = new THREE.Vector3();
  const project = (x, y, z, rect) => {
    physics.deform(x, y, z, point);
    point.add(physics.position).project(camera);
    return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
  };
  return element => {
    const rect = canvas.getBoundingClientRect();
    const head = project(0, 2.8, 0, rect);
    const a = project(-0.72, 1.65, 1.24, rect), b = project(0.72, 0.82, 1.24, rect);
    const face = { left: Math.min(a.x, b.x), right: Math.max(a.x, b.x), top: Math.min(a.y, b.y), bottom: Math.max(a.y, b.y) };
    const w = element.offsetWidth, h = element.offsetHeight;
    const candidates = [[head.x + 10, head.y - h - 12], [head.x - w - 10, head.y - h - 12],
      [head.x - w / 2, face.top - h - 16], [face.right + 14, face.top - h / 2],
      [face.left - w - 14, face.top - h / 2], [head.x - w / 2, face.bottom + 16]];
    const positions = candidates.map(([x, y], i) => {
      const left = Math.max(8, Math.min(innerWidth - w - 8, x));
      const top = Math.max(pet ? 27 : 8, Math.min(innerHeight - h - 10, y));
      const overlap = Math.max(0, Math.min(left + w, face.right + 8) - Math.max(left, face.left - 8))
        * Math.max(0, Math.min(top + h, face.bottom + 8) - Math.max(top, face.top - 8));
      return { left, top, score: overlap * 1000 + i * 100 + Math.abs(left - x) + Math.abs(top - y) };
    }).sort((a, b) => a.score - b.score);
    const { left, top } = positions[0];
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.style.setProperty('--tail-x', `${Math.max(16, Math.min(w - 22, head.x - left))}px`);
    element.dataset.tail = top > face.bottom ? 'top' : 'bottom';
  };
}

const moodLines = { chill: 'bubbleChill', annoyed: 'bubbleAnnoyed', rage: 'bubbleRage', sleepy: 'bubbleSleepy',
  sad: 'rageSad', recovering: 'rageRecovering', reassured: 'rageReassured', happy: 'rageHappy' };

export function createMoodBubble({ face, ui, isBossActive, ...positionOptions }) {
  const element = document.createElement('aside');
  element.className = 'speech-bubble mood-bubble';
  element.hidden = true;
  element.setAttribute('role', 'status');
  element.setAttribute('aria-live', 'polite');
  element.setAttribute('aria-atomic', 'true');
  const line = document.createElement('p');
  element.append(line);
  document.body.append(element);
  const place = createBubblePositioner(positionOptions);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let previousKey = 'chill', started = -Infinity, textKey = '';
  const hide = () => { element.hidden = true; started = -Infinity; };
  const onVisibility = () => { if (document.hidden) hide(); };
  document.addEventListener('visibilitychange', onVisibility);
  return {
    element,
    reset() { previousKey = 'chill'; hide(); },
    update(now) {
      if (document.hidden) { hide(); return; }
      if (isBossActive()) { previousKey = null; hide(); return; }
      const key = face.reassured ? 'reassured' : face.mood;
      if (key !== previousKey) {
        previousKey = key;
        started = now;
        element.dataset.mood = key;
      }
      const age = now - started;
      if (age >= 4000 || !moodLines[key]) { element.hidden = true; return; }
      const nextTextKey = `${ui.state.language}:${key}`;
      if (nextTextKey !== textKey) {
        textKey = nextTextKey;
        line.textContent = translate(ui.state.language, moodLines[key]);
      }
      element.hidden = false;
      element.style.opacity = String(reduced.matches ? 1 : Math.min(1, age / 120, (4000 - age) / 350));
      place(element);
    },
    dispose() { document.removeEventListener('visibilitychange', onVisibility); element.remove(); },
  };
}
