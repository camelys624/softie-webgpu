import { translate } from './i18n.js';
import { sound } from './sound.js';

const DEFAULTS = { color: '#f17fa9', stiffness: 35, damping: 45, volume: 80 };
const PRESET_NAMES = { '#f17fa9': 'strawberry', '#a5e0cd': 'mint', '#c8afec': 'grape' };

export function setupUI({ onColor, onStiffness, onDamping, onPoke, onReset, onWakeup, pet = false }) {
  if (pet) {
    document.documentElement.dataset.mode = 'pet';
    document.body.dataset.mode = 'pet';
  }
  const stage = document.querySelector('#stage');
  const settings = document.querySelector('#settings-fieldset');
  const loading = document.querySelector('#loading');
  const unsupported = document.querySelector('#unsupported');
  const status = document.querySelector('#renderer-status');
  const statusText = document.querySelector('#status-text');
  const fpsText = document.querySelector('#fps');
  const swatches = [...document.querySelectorAll('[data-color]')];
  const colorName = document.querySelector('#color-name');
  let language = 'zh', selectedColor = DEFAULTS.color, rendererState = 'pending', errorKey = 'initFailed';
  const values = { stiffness: DEFAULTS.stiffness, damping: DEFAULTS.damping };
  try { if (localStorage.getItem('softie-language') === 'en') language = 'en'; } catch { /* Storage may be disabled. */ }
  const t = key => translate(language, key);

  function renderStatus() {
    statusText.textContent = t(rendererState === 'ready' ? 'connected' : rendererState === 'error' ? 'disconnected' : 'connecting');
    document.querySelector('#error-message').textContent = t(errorKey) ?? t('initFailed');
  }

  function setLanguage(value) {
    language = value === 'en' ? 'en' : 'zh';
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    const langSwitch = document.querySelector('.language-switch');
    if (langSwitch) {
      langSwitch.dataset.lang = language;
    }
    for (const [attribute, target] of [['data-i18n', null], ['data-i18n-label', 'aria-label'], ['data-i18n-title', 'title'], ['data-i18n-content', 'content']]) {
      for (const element of document.querySelectorAll(`[${attribute}]`)) {
        const text = t(element.getAttribute(attribute));
        if (target) element.setAttribute(target, text); else element.textContent = text;
      }
    }
    for (const button of document.querySelectorAll('[data-language]')) {
      button.setAttribute('aria-pressed', String(button.dataset.language === language));
    }
    selectColor(selectedColor);
    renderStatus();
  }

  const PRESET_COLORS = ['#f17fa9', '#a5e0cd', '#c8afec'];
  const customInput = document.querySelector('#custom-color');
  const customSwatch = document.querySelector('.swatch-custom');

  function selectColor(color, displayName) {
    selectedColor = color;
    const isPreset = PRESET_COLORS.includes(color.toLowerCase());
    let matchedSwatch = null;

    for (const swatch of swatches) {
      const isCustom = swatch.classList.contains('swatch-custom');
      let selected = false;
      if (isPreset) {
        selected = !isCustom && swatch.dataset.color.toLowerCase() === color.toLowerCase();
      } else {
        selected = isCustom;
        if (isCustom) {
          swatch.dataset.color = color;
          swatch.style.setProperty('--swatch', color);
          if (customInput && customInput.value.toLowerCase() !== color.toLowerCase()) {
            customInput.value = color;
          }
        }
      }
      swatch.classList.toggle('is-selected', selected);
      swatch.setAttribute('aria-pressed', String(selected));
      if (selected) matchedSwatch = swatch;
    }

    const label = displayName ?? (matchedSwatch ? t(matchedSwatch.dataset.colorName) : t('custom'));
    colorName.textContent = label;
    document.documentElement.style.setProperty('--accent', color);
    for (const sparkle of document.querySelectorAll('.sparkle')) {
      sparkle.style.color = color;
    }
  }

  function setRange(id, value) {
    if (id in values) values[id] = value;
    const input = document.querySelector(`#${id}`);
    if (!input) return;
    input.value = value;
    input.style.setProperty('--value', `${value}%`);
    const output = document.querySelector(`#${id}-value`);
    if (output) output.value = id === 'volume' ? `${value}%` : value;
  }

  for (const swatch of swatches) {
    if (swatch.classList.contains('swatch-custom')) {
      swatch.addEventListener('click', () => {
        const color = customInput ? customInput.value : swatch.dataset.color;
        selectColor(color, t('custom'));
        onColor({ color, name: t('custom') });
        sound.playBubble(1.2);
      });
    } else {
      swatch.addEventListener('click', () => {
        const { color, colorName } = swatch.dataset;
        selectColor(color);
        onColor({ color, name: t(colorName) });
        sound.playBubble(colorName === 'mint' ? 1.25 : colorName === 'grape' ? 0.95 : 1.1);
        setTimeout(() => sound.playHappyPurr(), 140);
      });
    }
  }

  if (customInput) {
    const handleCustomColor = event => {
      const color = event.target.value;
      if (customSwatch) {
        customSwatch.dataset.color = color;
        customSwatch.style.setProperty('--swatch', color);
      }
      selectColor(color, t('custom'));
      onColor({ color, name: t('custom') });
    };
    customInput.addEventListener('input', handleCustomColor);
    customInput.addEventListener('change', event => {
      handleCustomColor(event);
      sound.playBubble(1.15);
    });
  }

  for (const [id, callback] of [['stiffness', onStiffness], ['damping', onDamping]]) {
    let lastVal = DEFAULTS[id];
    document.querySelector(`#${id}`).addEventListener('input', event => {
      const value = Number(event.target.value);
      setRange(id, value);
      if (Math.abs(value - lastVal) >= 3) {
        sound.playSliderTick();
        lastVal = value;
      }
      callback(value / 100);
    });
  }

  // Volume slider setup (Default 80%)
  const soundToggle = document.querySelector('#sound-toggle');
  let updateSoundUI = () => {};
  if (soundToggle) {
    updateSoundUI = enabled => {
      soundToggle.setAttribute('aria-pressed', String(enabled));
      soundToggle.title = t(enabled ? 'soundOn' : 'soundOff');
    };
    updateSoundUI(sound.enabled);
    soundToggle.addEventListener('click', () => {
      const enabled = sound.toggle();
      updateSoundUI(enabled);
    });
  }

  const initialVolume = Math.round((sound.volume ?? 0.8) * 100);
  setRange('volume', initialVolume);
  let lastVol = initialVolume;
  const volumeSlider = document.querySelector('#volume');
  if (volumeSlider) {
    volumeSlider.addEventListener('input', event => {
      const value = Number(event.target.value);
      setRange('volume', value);
      sound.setVolume(value / 100);
      if (Math.abs(value - lastVol) >= 4) {
        sound.playSliderTick();
        lastVol = value;
      }
      updateSoundUI(sound.enabled);
    });
  }

  const pokeButtons = document.querySelectorAll('.poke-button, #poke, [data-action="poke"]');
  for (const button of pokeButtons) {
    button.addEventListener('click', onPoke);
    button.disabled = true;
  }
  const resetButtons = document.querySelectorAll('.reset-button, .stage-reset-btn, #reset, #stage-reset, [data-action="reset"]');
  const stageResetBtn = document.querySelector('#stage-reset');
  const resetIcon = stageResetBtn?.querySelector('.reset-icon');
  let spinTimer = null;

  if (resetIcon) {
    resetIcon.addEventListener('animationend', () => {
      resetIcon.classList.remove('is-spinning');
    });
  }

  const triggerReset = (event) => {
    const button = event?.currentTarget || stageResetBtn;
    const icon = button?.querySelector?.('.reset-icon') || resetIcon;
    if (icon) {
      icon.classList.remove('is-spinning');
      if (button) void button.offsetWidth;
      icon.classList.add('is-spinning');

      const animations = typeof icon.getAnimations === 'function' ? icon.getAnimations() : null;
      if (animations && animations.length > 0) {
        for (const anim of animations) {
          anim.currentTime = 0;
          anim.play();
        }
      }

      clearTimeout(spinTimer);
      spinTimer = setTimeout(() => {
        icon.classList.remove('is-spinning');
      }, 600);
    }
    selectColor(DEFAULTS.color);
    setRange('stiffness', DEFAULTS.stiffness);
    setRange('damping', DEFAULTS.damping);
    setRange('volume', DEFAULTS.volume);
    onStiffness(DEFAULTS.stiffness / 100);
    onDamping(DEFAULTS.damping / 100);
    sound.setVolume(DEFAULTS.volume / 100);
    updateSoundUI(sound.enabled);
    sound.playBounce(0.8);
    sound.playHappyPurr();
    onReset();
  };
  for (const button of resetButtons) {
    button.addEventListener('click', triggerReset);
  }

  for (const button of document.querySelectorAll('[data-language]')) {
    button.addEventListener('click', () => chooseLanguage(button.dataset.language));
  }
  function chooseLanguage(value) {
    setLanguage(value);
    try { localStorage.setItem('softie-language', language); } catch { /* The switch still works without persistence. */ }
    if (soundToggle) soundToggle.title = t(sound.enabled ? 'soundOn' : 'soundOff');
  }
  setLanguage(language);

  const preloaderStartTime = performance.now();
  const isTest = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('test');
  const MIN_PRELOADER_DURATION = isTest || pet ? 0 : 3000;
  let readyTimer = null;

  return {
    t,
    get state() {
      return {
        color: selectedColor,
        colorName: PRESET_NAMES[selectedColor.toLowerCase()] ?? 'custom',
        stiffness: values.stiffness,
        damping: values.damping,
        soundEnabled: sound.enabled,
        language,
      };
    },
    poke() { onPoke(); },
    reset() { triggerReset(); },
    toggleSound() { updateSoundUI(sound.toggle()); },
    setLanguage: chooseLanguage,
    pickColor(name) {
      const swatch = swatches.find(element => element.dataset.colorName === name && !element.classList.contains('swatch-custom'));
      if (swatch) swatch.click();
    },
    setParameter(id, value) {
      const callback = id === 'stiffness' ? onStiffness : id === 'damping' ? onDamping : null;
      if (!callback || !Number.isFinite(value)) return;
      const clamped = Math.round(Math.max(0, Math.min(100, value)));
      setRange(id, clamped);
      callback(clamped / 100);
    },
    setStatus(state = 'ready') {
      rendererState = state;
      renderStatus();
      status.dataset.state = state;
      if (state === 'ready') {
        const elapsed = performance.now() - preloaderStartTime;
        const delay = Math.max(0, MIN_PRELOADER_DURATION - elapsed);
        if (readyTimer) clearTimeout(readyTimer);
        readyTimer = setTimeout(() => {
          loading.classList.add('is-done');
          loading.style.pointerEvents = 'none';
          if (typeof onWakeup === 'function') onWakeup();
          settings.disabled = false;
          for (const button of pokeButtons) button.disabled = false;
          for (const button of resetButtons) button.disabled = false;
          stage.setAttribute('aria-busy', 'false');
          setTimeout(() => {
            loading.hidden = true;
          }, 450);
        }, delay);
      } else {
        if (readyTimer) clearTimeout(readyTimer);
        loading.classList.remove('is-done');
        loading.style.pointerEvents = '';
        loading.hidden = state !== 'pending';
        settings.disabled = true;
        for (const button of pokeButtons) button.disabled = true;
        for (const button of resetButtons) button.disabled = true;
        stage.setAttribute('aria-busy', String(state === 'pending'));
      }
      unsupported.hidden = true;
    },
    setFps(fps) {
      fpsText.textContent = Number.isFinite(fps) ? `${Math.round(fps)} FPS` : '— FPS';
    },
    setInteraction(state) {
      stage.dataset.interaction = state;
    },
    showError(key) {
      if (readyTimer) clearTimeout(readyTimer);
      errorKey = key;
      rendererState = 'error';
      loading.hidden = true;
      unsupported.hidden = false;
      renderStatus();
      status.dataset.state = 'error';
      fpsText.textContent = '— FPS';
      settings.disabled = true;
      for (const button of pokeButtons) button.disabled = true;
      stage.setAttribute('aria-busy', 'false');
    },
  };
}
