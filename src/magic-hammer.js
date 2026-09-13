const overlap = (a, b) => b ? Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
  * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) : 0;

// Keep the enlarged prop in the window and give the character's expression priority.
export function hammerPlacement(point, viewport, size, face, bubble) {
  const { width, height } = size;
  const candidates = [[point.x + 12, point.y - height - 12]];
  if (face) candidates.push(
    [face.right + 8, face.top - height * 0.55],
    [face.left - width - 8, face.top - height * 0.55],
    [face.right + 8, face.top - 12],
    [face.left - width - 8, face.top - 12],
    [point.x + 12, face.bottom + 8],
    [point.x - width / 2, face.top - height - 8],
  );
  return candidates.map(([x, y]) => {
    const left = Math.max(3, Math.min(viewport.width - width - 3, x));
    const top = Math.max(3, Math.min(viewport.height - height - 3, y));
    const rect = { left, top, right: left + width, bottom: top + height };
    return { ...rect, score: overlap(rect, face) * 12 + overlap(rect, bubble) * 3
      + (face && rect.left < face.right + 6 && rect.right > face.left - 6 ? 10 : 0)
      + Math.hypot(left + width / 2 - point.x, top + height / 2 - point.y) * 0.025 };
  }).sort((a, b) => a.score - b.score)[0];
}

export function createMagicHammer(reducedMotion) {
  const element = document.createElement('div');
  element.className = 'boss-hammer';
  element.hidden = true;
  element.setAttribute('aria-hidden', 'true');
  element.innerHTML = '<span class="hammer-aura"></span><img src="./hammer.svg" alt=""><span class="hammer-spark spark-one">✧</span><span class="hammer-spark spark-two">✦</span>';
  const burst = document.createElement('div');
  burst.className = 'boss-purify';
  burst.hidden = true;
  burst.setAttribute('aria-hidden', 'true');
  burst.innerHTML = '<i class="purify-ring"></i><i class="purify-ring inner"></i><b>✦</b><b>✧</b><b>✦</b><b>✧</b>';
  document.body.append(element, burst);
  let rect = null;
  const cancel = target => target.getAnimations().forEach(animation => animation.cancel());
  const clearBurst = () => { cancel(burst); burst.hidden = true; };
  function flash(point, release) {
    if (reducedMotion.matches) return;
    cancel(burst);
    burst.classList.toggle('is-release', release);
    burst.style.left = `${point.x}px`;
    burst.style.top = `${point.y}px`;
    burst.hidden = false;
    const frames = release ? [
      { transform: 'translate(-50%, -50%) scale(1.25) rotate(0deg)', opacity: 0.8 },
      { transform: 'translate(-50%, -50%) scale(0.3) rotate(65deg)', opacity: 0 },
    ] : [
      { transform: 'translate(-50%, -50%) scale(0.35) rotate(-15deg)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(0.85) rotate(0deg)', opacity: 0.85, offset: 0.2 },
      { transform: 'translate(-50%, -50%) scale(1.35) rotate(20deg)', opacity: 0 },
    ];
    const animation = burst.animate(frames, { duration: release ? 360 : 300, easing: 'ease-out' });
    animation.onfinish = () => { burst.hidden = true; };
  }
  const stopMotion = () => { if (reducedMotion.matches) { cancel(element); clearBurst(); } };
  reducedMotion.addEventListener('change', stopMotion);
  return {
    element,
    move(point, face, bubble) {
      rect = hammerPlacement(point, { width: innerWidth, height: innerHeight },
        { width: element.offsetWidth, height: element.offsetHeight }, face, bubble);
      element.style.left = `${rect.left}px`;
      element.style.top = `${rect.top}px`;
    },
    strike(point) {
      if (reducedMotion.matches) return;
      cancel(element);
      if (!element.hidden && rect) {
        const dx = point.x - rect.left - element.offsetWidth * 0.4;
        const dy = point.y - rect.top - element.offsetHeight * 0.3;
        element.animate([
          { transform: 'translate(0, 0) rotate(12deg)' },
          { transform: `translate(${dx}px, ${dy}px) rotate(-16deg)`, offset: 0.42 },
          { transform: 'translate(0, 0) rotate(0deg)' },
        ], { duration: 175, easing: 'ease-out' });
      }
      flash(point, false);
    },
    release(point) { flash(point, true); },
    hideProp() { cancel(element); element.hidden = true; },
    hide() { cancel(element); element.hidden = true; clearBurst(); },
    dispose() { cancel(element); clearBurst(); reducedMotion.removeEventListener('change', stopMotion); element.remove(); burst.remove(); },
  };
}
