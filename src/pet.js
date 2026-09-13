// Desktop-pet mode: the same slime, framed alone inside a small transparent window.
// The pure helpers here (sizing, framing, gaze, menu) have no DOM dependency so Node can test them.

export const PET_BASE_SIZE = { width: 340, height: 300 };
export const PET_SIZES = { small: 0.75, medium: 1, large: 1.4 };
// World-space box the pet camera keeps in view: body, travel bounds, dizzy halo and contact shadow.
export const PET_FRAME = { halfWidth: 2.6, top: 4.2, bottom: -0.4 };
// How far the body centre may travel; small enough that the slime never leaves its window.
export const PET_BOUNDS = { x: 0.35, y: 0.9, z: 0.3 };
export const COLOR_PRESETS = [['strawberry', '#f17fa9'], ['mint', '#a5e0cd'], ['grape', '#c8afec']];
export const ACCESSORY_PRESETS = [['none', 'accNone'], ['badge', 'accBadge'], ['coffee', 'accCoffee'], ['bandaid', 'accBandaid']];
export const STIFFNESS_PRESETS = [['soft', 15], ['petDefault', 35], ['springy', 75]];
export const DAMPING_PRESETS = [['wobbly', 15], ['petDefault', 45], ['settled', 85]];
const SIZE_LABELS = { small: 'petSizeSmall', medium: 'petSizeMedium', large: 'petSizeLarge' };
const clamp = value => Math.max(-1, Math.min(1, value));

export function isPetMode(search) {
  return new URLSearchParams(search).has('pet');
}

export function petSizeFromSearch(search) {
  const level = new URLSearchParams(search).get('size');
  return PET_SIZES[level] ? level : 'medium';
}

export function petWindowSize(level = 'medium') {
  const scale = PET_SIZES[level] ?? PET_SIZES.medium;
  return { width: Math.round(PET_BASE_SIZE.width * scale), height: Math.round(PET_BASE_SIZE.height * scale) };
}

/** Contain-fit the pet frame in a window of the given CSS size. */
export function petCamera(width, height) {
  const aspect = width > 0 && height > 0 ? width / height : 1;
  const boxWidth = PET_FRAME.halfWidth * 2;
  const boxHeight = PET_FRAME.top - PET_FRAME.bottom;
  return {
    aspect,
    visibleHeight: Math.max(boxHeight, boxWidth / aspect),
    centerY: (PET_FRAME.top + PET_FRAME.bottom) / 2,
  };
}

/** Gaze from a cursor and an eye position in the same pixel space; saturates after `reach` pixels. */
export function gazeFromCursor(cursor, eye, reach = 420) {
  if (!cursor || !eye || !(reach > 0)) return { x: 0, y: 0 };
  const x = (cursor.x - eye.x) / reach;
  const y = (eye.y - cursor.y) / reach;
  return { x: Number.isFinite(x) ? clamp(x) : 0, y: Number.isFinite(y) ? clamp(y) : 0 };
}

/** Serializable tray / context menu. Ids are `kind:value`; labels come from the app dictionary. */
export function buildPetMenu(state, t) {
  const radio = (id, label, checked) => ({ id, label, type: 'radio', checked: Boolean(checked) });
  const colors = COLOR_PRESETS.map(([name]) => radio(`color:${name}`, t(name), state.colorName === name));
  if (state.colorName === 'custom') colors.push(radio('color:custom', t('custom'), true));
  return [
    { id: 'settings', label: t('settings') },
    { type: 'separator' },
    { id: 'poke', label: t('poke') },
    { id: 'boss', label: t('bossSummon') },
    { id: 'reset', label: t('reset') },
    { type: 'separator' },
    { label: t('color'), submenu: colors },
    { label: t('accessory'), submenu: ACCESSORY_PRESETS.map(([value, key]) => radio(`accessory:${value}`, t(key), state.accessory === value)) },
    { label: t('stiffness'), submenu: STIFFNESS_PRESETS.map(([key, value]) => radio(`stiffness:${value}`, t(key), state.stiffness === value)) },
    { label: t('damping'), submenu: DAMPING_PRESETS.map(([key, value]) => radio(`damping:${value}`, t(key), state.damping === value)) },
    { label: t('petSize'), submenu: Object.keys(PET_SIZES).map(level => radio(`size:${level}`, t(SIZE_LABELS[level]), state.size === level)) },
    { id: 'sound', label: t('petSound'), type: 'checkbox', checked: Boolean(state.soundEnabled) },
    { label: t('language'), submenu: [radio('language:zh', t('chinese'), state.language === 'zh'), radio('language:en', t('english'), state.language === 'en')] },
    { type: 'separator' },
    { id: 'quit', label: t('petQuit') },
  ];
}

/** Wires the desktop bridge (menu commands, global cursor, drag handle) to the page UI. */
export function createPetController({ desktop, ui, size = 'medium', onSize, onBoss }) {
  let level = PET_SIZES[size] ? size : 'medium';
  const cursorListeners = new Set();
  const state = () => ({ ...ui.state, size: level });
  const publish = () => {
    const current = state();
    desktop?.send('softie:menu', { template: buildPetMenu(current, ui.t), state: current, tooltip: ui.t('title') });
  };

  function run(id) {
    const [kind, value] = String(id).split(':');
    if (id === 'settings') desktop?.send('softie:open-settings');
    else if (id === 'poke') ui.poke();
    else if (id === 'boss') onBoss?.();
    else if (id === 'reset') ui.reset();
    else if (id === 'sound') ui.toggleSound();
    else if (id === 'quit') desktop?.send('softie:quit');
    else if (kind === 'color') ui.pickColor(value);
    else if (kind === 'accessory') ui.pickAccessory(value);
    else if (kind === 'stiffness' || kind === 'damping') ui.setParameter(kind, Number(value));
    else if (kind === 'size' && PET_SIZES[value]) { level = value; onSize?.(value); }
    else if (kind === 'language') ui.setLanguage(value);
    else return false;
    publish();
    return true;
  }

  desktop?.on('softie:command', payload => run(payload?.id));
  desktop?.on('softie:cursor', point => { for (const listener of cursorListeners) listener(point); });

  const handle = document.querySelector('#pet-handle');
  if (handle && desktop) handle.hidden = false;

  if (handle && desktop) {
    let dragPointer = null;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    const endDrag = event => {
      if (dragPointer === null || (event?.pointerId !== undefined && event.pointerId !== dragPointer)) return;
      if (dragging) desktop.send('softie:drag', { active: false });
      dragPointer = null;
      dragging = false;
      handle?.classList.remove('is-dragging');
    };
    const startDrag = event => {
      if (
        dragPointer !== null
        || event.button !== 0
        || !['mouse', 'pen'].includes(event.pointerType)
      ) return;
      dragPointer = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      dragging = false;
      event.target?.setPointerCapture?.(event.pointerId);
    };
    const moveDrag = event => {
      if (dragPointer !== event.pointerId) return;
      if (!dragging) {
        if (Math.hypot(event.clientX - startX, event.clientY - startY) < 8) return;
        dragging = true;
        window.dispatchEvent(new Event('softie:window-drag-start'));
        desktop.send('softie:drag', { active: true });
        handle?.classList.add('is-dragging');
      }
      event.preventDefault();
    };
    // Native window dragging is intentionally limited to the visible top handle.
    // Body pointer events must remain available to the slime interaction logic.
    handle.addEventListener('pointerdown', startDrag, true);
    window.addEventListener('pointermove', moveDrag, true);
    window.addEventListener('pointerup', endDrag, true);
    window.addEventListener('pointercancel', endDrag, true);
    window.addEventListener('blur', endDrag);
  }

  window.addEventListener('contextmenu', event => {
    if (!desktop) return;
    event.preventDefault();
    desktop.send('softie:context-menu');
  });
  window.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key === ',') {
      event.preventDefault();
      desktop?.send('softie:open-settings');
    } else if (event.key.toLowerCase() === 'q') {
      event.preventDefault();
      desktop?.send('softie:quit');
    }
  });

  return {
    run,
    publish,
    get size() { return level; },
    onCursor(listener) { cursorListeners.add(listener); return () => cursorListeners.delete(listener); },
    ready() { desktop?.send('softie:ready'); publish(); },
  };
}
