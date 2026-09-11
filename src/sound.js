/**
 * Procedural Web Audio synthesizer for Softie.
 * Generates organic, cozy, ASMR-like tactile sounds for squishing, bouncing, poking, and bubbling.
 * Zero external audio assets required.
 */

class SoundFX {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.filter = null;
    this.enabled = true;
    this.volume = 0.8; // Default 80% volume

    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('softie-sound-enabled');
        if (saved !== null) this.enabled = saved === 'true';
        const savedVol = localStorage.getItem('softie-sound-volume');
        if (savedVol !== null) {
          const num = Number(savedVol);
          if (Number.isFinite(num) && num >= 0 && num <= 1) this.volume = num;
        }
      } catch {
        // localStorage not available
      }
    }
  }

  get effectiveGain() {
    return this.enabled ? this.volume * 0.44 : 0;
  }

  init() {
    if (this.ctx) return this.ctx;
    const AudioCtx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AudioCtx) return null;

    this.ctx = new AudioCtx();
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 3200;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.effectiveGain;

    this.filter.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    return this.ctx;
  }

  resume() {
    const ctx = this.init();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }

  setVolume(vol) {
    const v = Math.max(0, Math.min(1, Number(vol)));
    this.volume = v;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('softie-sound-volume', String(v));
      } catch {}
    }
    // If volume is turned up from 0 while muted, automatically un-mute
    if (v > 0 && !this.enabled) {
      this.enabled = true;
      try { localStorage.setItem('softie-sound-enabled', 'true'); } catch {}
    } else if (v === 0 && this.enabled) {
      this.enabled = false;
      try { localStorage.setItem('softie-sound-enabled', 'false'); } catch {}
    }
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.effectiveGain, this.ctx.currentTime, 0.03);
    }
    return this.volume;
  }

  toggle() {
    this.enabled = !this.enabled;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('softie-sound-enabled', String(this.enabled));
      } catch {
        // ignore storage error
      }
    }
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.effectiveGain, this.ctx.currentTime, 0.05);
    }
    if (this.enabled) {
      this.resume();
      this.playBubble(1.1);
    }
    return this.enabled;
  }

  /**
   * Poke sound: Crisp, cute, elastic pop ("啵唧 / Bloop!")
   */
  playPoke() {
    if (!this.enabled) return;
    const ctx = this.init();
    if (!ctx) return;
    this.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const baseFreq = 280 + (Math.random() - 0.5) * 25;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 2.35, now + 0.035);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.15);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.85, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.filter);

    osc.start(now);
    osc.stop(now + 0.19);

    // Subtle cute high sparkle chime ("✦")
    const sparkleOsc = ctx.createOscillator();
    const sparkleGain = ctx.createGain();
    sparkleOsc.type = 'sine';
    sparkleOsc.frequency.setValueAtTime(1480 + (Math.random() - 0.5) * 60, now);

    sparkleGain.gain.setValueAtTime(0.001, now);
    sparkleGain.gain.linearRampToValueAtTime(0.07, now + 0.01);
    sparkleGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

    sparkleOsc.connect(sparkleGain);
    sparkleGain.connect(this.filter);

    sparkleOsc.start(now);
    sparkleOsc.stop(now + 0.09);
  }

  /**
   * Squish sound: Soft tactile gel indentation ("咕唧 / Squish")
   */
  playSquish() {
    if (!this.enabled) return;
    const ctx = this.init();
    if (!ctx) return;
    this.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const freq = 175 + (Math.random() - 0.5) * 20;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.65, now + 0.07);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.32, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(this.filter);

    osc.start(now);
    osc.stop(now + 0.11);
  }

  /**
   * Bounce sound: Resonant jelly wobble ("Boing / 咚~")
   */
  playBounce(intensity = 1) {
    if (!this.enabled) return;
    const ctx = this.init();
    if (!ctx) return;
    this.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const baseFreq = 195 + (Math.random() - 0.5) * 20;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq * 1.25, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq, now + 0.06);

    const dur = 0.26 + Math.min(0.16, intensity * 0.1);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(Math.min(0.48, 0.26 + intensity * 0.1), now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(gain);
    gain.connect(this.filter);

    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  /**
   * Bubble sound: Sweet harmonic pop for swatches and switches
   */
  playBubble(pitchMultiplier = 1) {
    if (!this.enabled) return;
    const ctx = this.init();
    if (!ctx) return;
    this.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const freq = 460 * pitchMultiplier;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.45, now + 0.045);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

    osc.connect(gain);
    gain.connect(this.filter);

    osc.start(now);
    osc.stop(now + 0.14);
  }

  /**
   * Land sound: Soft, cute, slightly damp jelly impact on the surface ("噗咚 / Plop-thud")
   */
  playLand(impact = 1) {
    if (!this.enabled) return;
    if (impact < 0.55) return;
    const ctx = this.init();
    if (!ctx) return;
    this.resume();

    const now = ctx.currentTime;
    if (this._lastLandTime && now - this._lastLandTime < 0.08) return;
    this._lastLandTime = now;

    const normalizedImpact = Math.min(Math.max((impact - 0.5) / 3.0, 0.15), 1.2);

    // 1. Deep warm plop body (sine sweep)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const startFreq = 155 + normalizedImpact * 25;
    const endFreq = 52;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.075);

    const dur = 0.14 + normalizedImpact * 0.07;
    const peakVolume = Math.min(0.55, 0.18 + normalizedImpact * 0.3);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(peakVolume, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(gain);
    gain.connect(this.filter);

    osc.start(now);
    osc.stop(now + dur + 0.02);

    // 2. Soft gel slap / squishy transient layer
    const slapOsc = ctx.createOscillator();
    const slapGain = ctx.createGain();

    slapOsc.type = 'triangle';
    slapOsc.frequency.setValueAtTime(240 + (Math.random() - 0.5) * 20, now);
    slapOsc.frequency.exponentialRampToValueAtTime(95, now + 0.045);

    const slapVolume = Math.min(0.25, 0.06 + normalizedImpact * 0.14);
    slapGain.gain.setValueAtTime(0.001, now);
    slapGain.gain.linearRampToValueAtTime(slapVolume, now + 0.004);
    slapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

    slapOsc.connect(slapGain);
    slapGain.connect(this.filter);

    slapOsc.start(now);
    slapOsc.stop(now + 0.075);
  }

  /**
   * Wakeup sound: Cheerful, cozy two-note greeting ("噜哩~ ♫")
   */
  playWakeup() {
    if (!this.enabled) return;
    const ctx = this.init();
    if (!ctx) return;
    this.resume();

    const now = ctx.currentTime;
    // Note 1: warm rising chirp
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(440, now);
    osc1.frequency.exponentialRampToValueAtTime(540, now + 0.09);
    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.linearRampToValueAtTime(0.32, now + 0.012);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc1.connect(gain1);
    gain1.connect(this.filter);
    osc1.start(now);
    osc1.stop(now + 0.14);

    // Note 2: bright higher sparkle (starts at +0.10s)
    const t2 = now + 0.10;
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(660, t2);
    osc2.frequency.exponentialRampToValueAtTime(880, t2 + 0.12);
    gain2.gain.setValueAtTime(0.001, t2);
    gain2.gain.linearRampToValueAtTime(0.38, t2 + 0.015);
    gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.22);
    osc2.connect(gain2);
    gain2.connect(this.filter);
    osc2.start(t2);
    osc2.stop(t2 + 0.24);

    // Sparkle harmonic
    const sOsc = ctx.createOscillator();
    const sGain = ctx.createGain();
    sOsc.type = 'sine';
    sOsc.frequency.setValueAtTime(1760, t2);
    sGain.gain.setValueAtTime(0.001, t2);
    sGain.gain.linearRampToValueAtTime(0.08, t2 + 0.01);
    sGain.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.16);
    sOsc.connect(sGain);
    sGain.connect(this.filter);
    sOsc.start(t2);
    sOsc.stop(t2 + 0.18);
  }

  /**
   * Stretch sound: Distinct rubbery tension squeak / cheese pull glide ("吱溜~ / Tension string")
   * High-tension elastic frequency sweep that ascends with stretch length.
   */
  playStretch(ratio = 0.5) {
    if (!this.enabled) return;
    const ctx = this.init();
    if (!ctx) return;
    this.resume();

    const now = ctx.currentTime;
    if (this._lastStretchTime && now - this._lastStretchTime < 0.11) return;
    this._lastStretchTime = now;

    const r = Math.min(Math.max(ratio, 0.1), 1.0);
    // Base frequency rises sharply with stretch: 340Hz -> 860Hz
    const baseFreq = 340 + r * 520;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Triangle wave gives it a bright, thin, elastic, cheese-string pluck texture
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.28, now + 0.07);

    const volume = Math.min(0.26, 0.08 + r * 0.18);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

    osc.connect(gain);
    gain.connect(this.filter);
    osc.start(now);
    osc.stop(now + 0.095);

    // Subtle harmonic chime for the shiny "glossy" jelly skin stretch
    const chimeOsc = ctx.createOscillator();
    const chimeGain = ctx.createGain();
    chimeOsc.type = 'sine';
    chimeOsc.frequency.setValueAtTime(baseFreq * 2.0, now);
    chimeOsc.frequency.exponentialRampToValueAtTime(baseFreq * 2.5, now + 0.06);

    chimeGain.gain.setValueAtTime(0.001, now);
    chimeGain.gain.linearRampToValueAtTime(0.05 + r * 0.04, now + 0.006);
    chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);

    chimeOsc.connect(chimeGain);
    chimeGain.connect(this.filter);
    chimeOsc.start(now);
    chimeOsc.stop(now + 0.08);
  }

  /**
   * Dizzy sound: Rhythmic 5-burst liquid bubble cascade ("咕噜咕噜咕噜~")
   * Distinct watery cartoon popping cascade when shaken.
   */
  playDizzy() {
    if (!this.enabled) return;
    const ctx = this.init();
    if (!ctx) return;
    this.resume();

    const now = ctx.currentTime;
    if (this._lastDizzyTime && now - this._lastDizzyTime < 0.45) return;
    this._lastDizzyTime = now;

    // 5 playful rapid bubble pops cascading in pitch ("咕-噜-咕-噜-噜~")
    const notes = [
      { f1: 340, f2: 480, delay: 0.00, dur: 0.075, gain: 0.30 },
      { f1: 440, f2: 320, delay: 0.065, dur: 0.085, gain: 0.34 },
      { f1: 310, f2: 490, delay: 0.13, dur: 0.075, gain: 0.30 },
      { f1: 390, f2: 270, delay: 0.195, dur: 0.095, gain: 0.32 },
      { f1: 250, f2: 370, delay: 0.26, dur: 0.085, gain: 0.26 },
    ];

    for (const n of notes) {
      const t = now + n.delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.f1, t);
      osc.frequency.exponentialRampToValueAtTime(n.f2, t + n.dur * 0.7);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(n.gain, t + 0.007);
      gain.gain.exponentialRampToValueAtTime(0.001, t + n.dur);

      osc.connect(gain);
      gain.connect(this.filter);
      osc.start(t);
      osc.stop(t + n.dur + 0.01);
    }
  }

  /**
   * Dizzy Land sound: Slap impact followed by cartoon dizzy stars chime ("啪唧~ 叮铃铃眼冒金星")
   * Distinct landing sound when the slime has been shaken dizzy and lands on the ground.
   */
  playDizzyLand(impact = 1) {
    if (!this.enabled) return;
    const ctx = this.init();
    if (!ctx) return;
    this.resume();

    const now = ctx.currentTime;
    if (this._lastDizzyLandTime && now - this._lastDizzyLandTime < 0.25) return;
    this._lastDizzyLandTime = now;

    const normalizedImpact = Math.min(Math.max((impact - 0.5) / 3.0, 0.2), 1.2);

    // 1. Slap/Flop thud: Low soft squish impact ("啪唧~")
    const thudOsc = ctx.createOscillator();
    const thudGain = ctx.createGain();
    const startFreq = 210 + normalizedImpact * 30;
    thudOsc.type = 'triangle';
    thudOsc.frequency.setValueAtTime(startFreq, now);
    thudOsc.frequency.exponentialRampToValueAtTime(45, now + 0.11);

    thudGain.gain.setValueAtTime(0.001, now);
    thudGain.gain.linearRampToValueAtTime(Math.min(0.55, 0.22 + normalizedImpact * 0.25), now + 0.008);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    thudOsc.connect(thudGain);
    thudGain.connect(this.filter);
    thudOsc.start(now);
    thudOsc.stop(now + 0.18);

    // 2. Cartoon dizzy stars: Rapid ascending & descending twinkling chimes ("叮-啷-铃-转圈圈~")
    const starNotes = [
      { freq: 880, delay: 0.07, dur: 0.16, gain: 0.22 },   // A5
      { freq: 1175, delay: 0.14, dur: 0.18, gain: 0.26 },  // D6
      { freq: 1397, delay: 0.22, dur: 0.20, gain: 0.28 },  // F6
      { freq: 1760, delay: 0.31, dur: 0.24, gain: 0.30 },  // A6
      { freq: 1568, delay: 0.42, dur: 0.26, gain: 0.25 },  // G6
      { freq: 1318, delay: 0.54, dur: 0.32, gain: 0.20 },  // E6
    ];

    for (const star of starNotes) {
      const t = now + star.delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(star.freq, t);
      osc.frequency.exponentialRampToValueAtTime(star.freq * 1.06, t + star.dur * 0.35);
      osc.frequency.exponentialRampToValueAtTime(star.freq * 0.96, t + star.dur * 0.85);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(star.gain, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + star.dur);

      osc.connect(gain);
      gain.connect(this.filter);
      osc.start(t);
      osc.stop(t + star.dur + 0.02);
    }
  }

  /**
   * Alias for playDizzyLand
   */
  playDizzyStars(impact = 1) {
    this.playDizzyLand(impact);
  }

  /**
   * Happy purr: Three-step sweet ascending micro-chime (C5, E5, G5)
   */
  playHappyPurr() {
    if (!this.enabled) return;
    const ctx = this.init();
    if (!ctx) return;
    this.resume();

    const now = ctx.currentTime;
    if (this._lastHappyTime && now - this._lastHappyTime < 0.28) return;
    this._lastHappyTime = now;

    const freqs = [523.25, 659.25, 783.99];
    freqs.forEach((freq, idx) => {
      const t = now + idx * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.05, t + 0.06);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

      osc.connect(gain);
      gain.connect(this.filter);
      osc.start(t);
      osc.stop(t + 0.10);
    });
  }

  /**
   * Slider tick: Ultra-short haptic micro-tick for range controls
   */
  playSliderTick() {
    if (!this.enabled) return;
    const ctx = this.init();
    if (!ctx) return;
    this.resume();

    const now = ctx.currentTime;
    if (this._lastTickTime && now - this._lastTickTime < 0.032) return;
    this._lastTickTime = now;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(940 + (Math.random() - 0.5) * 50, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.09, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.014);

    osc.connect(gain);
    gain.connect(this.filter);
    osc.start(now);
    osc.stop(now + 0.016);
  }

  /**
   * Angry land: Heavy, punchy, vibrating impact with deep growl and resonant sub-bass
   */
  playAngryLand(impact = 1) {
    if (!this.enabled) return;
    const ctx = this.init();
    if (!ctx) return;
    this.resume();

    const now = ctx.currentTime;
    if (this._lastLandTime && now - this._lastLandTime < 0.08) return;
    this._lastLandTime = now;

    const normalizedImpact = Math.min(Math.max((impact - 0.5) / 2.5, 0.3), 1.5);

    // 1. Deep aggressive sub thud
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const startFreq = 125 + normalizedImpact * 20;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.16);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(Math.min(0.92, 0.45 + normalizedImpact * 0.35), now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(this.filter);
    osc.start(now);
    osc.stop(now + 0.29);

    // 2. Grumpy rumble (descending saw/square harmonic)
    const rumble = ctx.createOscillator();
    const rumbleGain = ctx.createGain();
    rumble.type = 'sawtooth';
    rumble.frequency.setValueAtTime(86, now);
    rumble.frequency.linearRampToValueAtTime(42, now + 0.22);

    rumbleGain.gain.setValueAtTime(0.001, now);
    rumbleGain.gain.linearRampToValueAtTime(0.24, now + 0.02);
    rumbleGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    rumble.connect(rumbleGain);
    rumbleGain.connect(this.filter);
    rumble.start(now);
    rumble.stop(now + 0.23);
  }

  /**
   * Angry poke: Grumpy, clipped, descending quack/grumble ("哼！")
   */
  playAngryPoke(angerLevel = 0.8) {
    if (!this.enabled) return;
    const ctx = this.init();
    if (!ctx) return;
    this.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const baseFreq = 220 + (1 - angerLevel) * 60;
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.55, now + 0.12);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.42, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(this.filter);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  /**
   * Snore breath: Gentle rhythmic breathing bubble during sleep
   */
  playSnore() {
    if (!this.enabled) return;
    const ctx = this.init();
    if (!ctx) return;
    this.resume();

    const now = ctx.currentTime;
    if (this._lastSnoreTime && now - this._lastSnoreTime < 1.4) return;
    this._lastSnoreTime = now;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.linearRampToValueAtTime(145, now + 0.45);
    osc.frequency.linearRampToValueAtTime(108, now + 0.95);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.4);
    gain.gain.linearRampToValueAtTime(0.0001, now + 0.98);

    osc.connect(gain);
    gain.connect(this.filter);
    osc.start(now);
    osc.stop(now + 1.0);
  }

  /**
   * Startle awake: Rapid comic pitch flare ("哇呀！")
   */
  playStartle() {
    if (!this.enabled) return;
    const ctx = this.init();
    if (!ctx) return;
    this.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(680, now + 0.12);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.28);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.68, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.30);

    osc.connect(gain);
    gain.connect(this.filter);
    osc.start(now);
    osc.stop(now + 0.32);
  }

  /**
   * Ambient bubble: Cozy floating micro-bubble when idle
   */
  playAmbientBubble() {
    if (!this.enabled) return;
    const ctx = this.init();
    if (!ctx) return;
    this.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const f = 360 + (Math.random() - 0.5) * 60;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, now);
    osc.frequency.exponentialRampToValueAtTime(f * 1.5, now + 0.045);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.10, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.filter);
    osc.start(now);
    osc.stop(now + 0.10);
  }
}

export const sound = new SoundFX();
