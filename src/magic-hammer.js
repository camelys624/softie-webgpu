const overlap = (a, b) => b ? Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
  * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) : 0;
const HAMMER_HEAD = (() => {
  const angle = -28 * Math.PI / 180;
  const x = 81.5 - 88, y = 53 - 90;
  return { x: (88 + Math.cos(angle) * x - Math.sin(angle) * y) / 176,
    y: (90 + Math.sin(angle) * x + Math.cos(angle) * y) / 192 };
})();
const HAMMER_SWING_RADIANS = 24 * Math.PI / 180;
const hammerImpactOffset = (width, height, direction) => {
  const pivotX = width * 0.68, pivotY = height * 0.86;
  const dx = HAMMER_HEAD.x * width - pivotX, dy = HAMMER_HEAD.y * height - pivotY;
  const angle = direction * HAMMER_SWING_RADIANS;
  return { x: pivotX + Math.cos(angle) * dx - Math.sin(angle) * dy,
    y: pivotY + Math.sin(angle) * dx + Math.cos(angle) * dy };
};

// Keep the enlarged prop in the window and give the character's expression priority.
export function hammerPlacement(point, viewport, size, face, bubble) {
  const { width, height } = size;
  const swingInset = Math.max(3, Math.ceil(Math.min(width, height) * 0.36));
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
    const left = Math.max(swingInset, Math.min(viewport.width - width - swingInset, x));
    const top = Math.max(swingInset, Math.min(viewport.height - height - swingInset, y));
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
  element.innerHTML = '<div class="hammer-swing"><span class="hammer-aura"></span><img src="./hammer.svg" alt=""><span class="hammer-spark spark-one">✧</span><span class="hammer-spark spark-two">✦</span></div>';
  const swing = element.querySelector('.hammer-swing');
  const burst = document.createElement('div');
  burst.className = 'boss-purify';
  burst.hidden = true;
  burst.setAttribute('aria-hidden', 'true');
  burst.innerHTML = '<i class="purify-ring"></i><i class="purify-ring inner"></i>';
  const stars = document.createElement('div');
  stars.className = 'boss-impact-stars';
  stars.setAttribute('aria-hidden', 'true');
  document.body.append(element, burst, stars);
  const waves = new Set();
  let strikeIndex = 0;
  let lastScatterAt = -Infinity;
  let rect = null;
  let activeSwing = null;
  const cancel = target => target.getAnimations().forEach(animation => animation.cancel());
  const resetSwing = animation => {
    if (activeSwing !== animation) return;
    activeSwing = null;
    swing.style.transform = 'rotate(0deg)';
  };
  const cancelSwing = () => {
    const animation = activeSwing;
    if (!animation) {
      swing.style.transform = 'rotate(0deg)';
      return;
    }
    animation.cancel();
    if (activeSwing === animation) resetSwing(animation);
  };
  const swingIsActive = () => {
    if (!activeSwing) return false;
    if (activeSwing.playState === 'pending' || activeSwing.playState === 'running') return true;
    resetSwing(activeSwing);
    return false;
  };
  const clearSwingOffset = () => { swing.style.left = '0px'; swing.style.top = '0px'; };
  const clearBurst = () => { cancel(burst); burst.hidden = true; };
  const removeWave = wave => {
    wave.getAnimations({ subtree: true }).forEach(animation => animation.cancel());
    wave.remove(); waves.delete(wave);
  };
  const clearStars = () => { for (const wave of waves) removeWave(wave); lastScatterAt = -Infinity; };
  function scatterStars(point) {
    if (reducedMotion.matches) return;
    // Sparse bursts can finish fading even while the hammer keeps striking.
    const now = performance.now();
    if (now - lastScatterAt < 380 || waves.size >= 2) return;
    lastScatterAt = now;
    const wave = document.createElement('div');
    wave.className = 'boss-impact-wave';
    wave.style.left = `${point.x}px`;
    wave.style.top = `${point.y}px`;
    stars.append(wave); waves.add(wave);
    const reach = Math.min(72, Math.max(36, innerWidth * 0.12));
    const turn = (++strikeIndex % 3 - 1) * 0.08;
    const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
    for (let i = 0; i < 3; i++) {
      const star = document.createElement('span');
      star.className = 'boss-impact-star';
      star.innerHTML = '<svg viewBox="0 0 24 24"><path d="m12 2 3 6.3 7 .9-5.1 4.9 1.3 6.9-6.2-3.3L5.8 21l1.3-6.9L2 9.2l7-.9Z"/></svg>';
      star.style.width = star.style.height = `${(i === 0 ? 18 : 14) * Math.min(1.15, innerWidth / 340)}px`;
      if (i === 1) star.classList.add('is-lilac');
      wave.append(star);
      const angle = -Math.PI * (0.85 - i * 0.35) + turn;
      const x = Math.cos(angle) * reach, rise = 32 - Math.sin(angle) * reach * 0.5;
      const spin = (i % 2 ? -1 : 1) * (45 + i * 12);
      const transform = (x, y, scale, rotate) => `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${rotate}deg) scale(${scale})`;
      // Sample one continuous arc, without corners between flight keyframes.
      const frames = Array.from({ length: 31 }, (_, frame) => {
        const t = frame / 30, travel = (1 - Math.exp(-3 * t)) / (1 - Math.exp(-3));
        const appear = smooth(t / 0.12), fade = smooth((t - 0.3) / 0.7);
        return { offset: t, transform: transform(x * travel, -rise * (2 * t - t * t) + 24 * t * t,
          appear * (1 - smooth((t - 0.45) / 0.55)), spin * travel), opacity: appear * (1 - fade) * 0.9 };
      });
      const animation = star.animate(frames, { duration: 560 + i * 40, delay: 80, easing: 'linear', fill: 'both' });
      animation.onfinish = () => {
        star.remove();
        if (!wave.childElementCount) { wave.remove(); waves.delete(wave); }
      };
    }
  }
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
    const animation = burst.animate(frames, { duration: release ? 360 : 300, delay: release ? 0 : 80, fill: 'both', easing: 'ease-out' });
    animation.onfinish = () => { burst.hidden = true; };
  }
  const stopMotion = () => { if (reducedMotion.matches) { cancelSwing(); clearBurst(); clearStars(); } };
  reducedMotion.addEventListener('change', stopMotion);
  return {
    element,
    move(point, face, bubble) {
      if (swingIsActive()) return;
      rect = hammerPlacement(point, { width: innerWidth, height: innerHeight },
        { width: element.offsetWidth, height: element.offsetHeight }, face, bubble);
      element.style.left = `${rect.left}px`;
      element.style.top = `${rect.top}px`;
      const direction = point.x >= rect.left + element.offsetWidth * 0.68 ? 1 : -1;
      const impact = hammerImpactOffset(element.offsetWidth, element.offsetHeight, direction);
      swing.style.left = `${point.x - rect.left - impact.x}px`;
      swing.style.top = `${point.y - rect.top - impact.y}px`;
    },
    strike(point) {
      if (reducedMotion.matches) return;
      cancelSwing();
      if (!element.hidden && rect) {
        const pivotX = rect.left + element.offsetWidth * 0.68;
        const direction = point.x >= pivotX ? 1 : -1;
        const animation = swing.animate([
          { transform: 'rotate(0deg)', easing: 'cubic-bezier(.4,0,.8,.6)' },
          { transform: `rotate(${-direction * 22}deg)`, offset: 0.20, easing: 'cubic-bezier(.16,1,.3,1)' },
          { transform: `rotate(${direction * 24}deg)`, offset: 0.62, easing: 'cubic-bezier(.16,1,.3,1)' },
          { transform: `rotate(${-direction * 5}deg)`, offset: 0.84 },
          { transform: 'rotate(0deg)', offset: 1 },
        ], { duration: 180, easing: 'linear', fill: 'both' });
        activeSwing = animation;
        animation.onfinish = () => resetSwing(animation);
        animation.oncancel = () => resetSwing(animation);
      }
      flash(point, false);
      scatterStars(point);
    },
    release(point) { flash(point, true); },
    hideProp() { cancelSwing(); clearSwingOffset(); element.hidden = true; },
    hide() { cancelSwing(); clearSwingOffset(); element.hidden = true; clearBurst(); clearStars(); },
    dispose() { cancelSwing(); clearSwingOffset(); clearBurst(); clearStars(); reducedMotion.removeEventListener('change', stopMotion); element.remove(); burst.remove(); stars.remove(); },
  };
}
