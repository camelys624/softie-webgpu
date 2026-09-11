const clamp = value => Math.max(-1, Math.min(1, value));
const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
const durations = { surprised: 0.9, happy: 1.25, wink: 0.85, dizzy: 2.8, annoyed: 1.3, angry: 1.8, startle: 1.2 };

// One controller owns expression priority, mood state machine, and gaze.
export class FaceMotion {
  constructor() {
    this.time = 0;
    this.reducedMotion = false;
    this.anger = 0; // 0.0 to 1.0
    this.isSleeping = false;
    this.state = {
      surprised: 0, squish: 0, happy: 0, wink: 0, dizzy: 0,
      annoyed: 0, angry: 0, sleepy: 0, startle: 0,
      blink: 0, gazeX: 0, gazeY: 0, angerLevel: 0,
    };
    this.reset();
  }

  reset() {
    this.grabbing = false;
    this.reaction = null;
    this.targetX = this.targetY = 0;
    this.blinkAt = this.time + 4.2;
    this.anger = 0;
    this.isSleeping = false;
    for (const key in this.state) this.state[key] = 0;
  }

  addAnger(delta = 0.18) {
    if (this.isSleeping) this.wakeUp();
    this.anger = Math.max(0, Math.min(1, this.anger + delta));
    if (this.anger > 0.68) {
      this.react('angry');
    } else if (this.anger > 0.35) {
      this.react('annoyed');
    }
  }

  calmDown(delta = 0.3) {
    this.anger = Math.max(0, this.anger - delta);
  }

  fallAsleep() {
    if (this.grabbing || this.reaction?.kind === 'dizzy' || this.anger > 0.25) return;
    this.isSleeping = true;
  }

  wakeUp(startled = false) {
    if (!this.isSleeping && !startled) return;
    this.isSleeping = false;
    if (startled) {
      this.react('startle');
    }
  }

  lookAt(x, y) {
    this.targetX = Number.isFinite(x) ? clamp(x) : 0;
    this.targetY = Number.isFinite(y) ? clamp(y) : 0;
  }

  react(kind) {
    if (!durations[kind]) return;
    if (this.grabbing && kind !== 'dizzy' && kind !== 'angry') return;
    this.reaction = { kind, started: this.time };
    this.blinkAt = this.time + 4.2;
  }

  grab(active, celebrate = true) {
    this.grabbing = active;
    if (active) {
      if (this.isSleeping) this.wakeUp(true);
      if (this.reaction?.kind !== 'dizzy' && this.reaction?.kind !== 'angry') this.reaction = null;
    } else {
      if (celebrate && this.reaction?.kind !== 'dizzy') {
        if (this.anger > 0.6) {
          this.react('angry');
        } else if (this.anger > 0.3) {
          this.react('annoyed');
        } else {
          this.react('happy');
        }
      }
    }
  }

  update(time) {
    const dt = Math.max(0, Math.min(time - this.time, 0.1));
    this.time = time;
    const follow = 1 - Math.exp(-dt * 14);

    // Natural anger decay: ~0.08/s when not provoked
    if (!this.grabbing && this.anger > 0) {
      this.anger = Math.max(0, this.anger - dt * 0.08);
    }
    this.state.angerLevel += (this.anger - this.state.angerLevel) * (1 - Math.exp(-dt * 6));

    let kind = this.grabbing ? 'squish' : (this.isSleeping ? 'sleepy' : 'idle');
    let weight = (this.grabbing || this.isSleeping) ? 1 : 0;

    if (this.reaction) {
      const age = time - this.reaction.started;
      const duration = durations[this.reaction.kind];
      if (age < duration) {
        if (!this.grabbing || this.reaction.kind === 'dizzy' || this.reaction.kind === 'angry') {
          kind = this.reaction.kind;
          weight = smooth(age / 0.1) * (1 - smooth((age - duration * 0.55) / (duration * 0.45)));
        }
      } else {
        this.reaction = null;
      }
    }

    // Blend persistent anger into continuous background if no strong reactions
    const activeReaction = this.reaction?.kind;
    const baseAnnoyed = (!activeReaction && !this.grabbing && !this.isSleeping && this.anger > 0.3 && this.anger <= 0.65)
      ? (this.anger - 0.3) / 0.35 : 0;
    const baseAngry = (!activeReaction && !this.grabbing && !this.isSleeping && this.anger > 0.65)
      ? (this.anger - 0.65) / 0.35 : 0;

    for (const key of ['surprised', 'squish', 'happy', 'wink', 'dizzy', 'annoyed', 'angry', 'sleepy', 'startle']) {
      let targetWeight = 0;
      if (kind === key) {
        targetWeight = weight;
      } else if (key === 'annoyed') {
        targetWeight = baseAnnoyed;
      } else if (key === 'angry') {
        targetWeight = baseAngry;
      }
      this.state[key] += (targetWeight - this.state[key]) * follow;
      if (this.state[key] < 1e-5) this.state[key] = 0;
    }

    if (time > this.blinkAt + 0.22) this.blinkAt = time + 4.2 + Math.sin(time) * 0.6;
    const blinkTime = (time - this.blinkAt) / 0.22;
    this.state.blink = !this.reducedMotion && kind === 'idle' && blinkTime > 0 && blinkTime < 1
      ? Math.sin(blinkTime * Math.PI) ** 2 : 0;

    // Gaze drifts towards center if sleeping or angry
    const targetX = (this.reducedMotion || this.isSleeping) ? 0 : this.targetX;
    const targetY = (this.reducedMotion || this.isSleeping) ? -0.15 : this.targetY;
    this.state.gazeX += (targetX - this.state.gazeX) * (1 - Math.exp(-dt * 10));
    this.state.gazeY += (targetY - this.state.gazeY) * (1 - Math.exp(-dt * 10));
    return this.state;
  }

  get expression() {
    if (this.reaction?.kind === 'dizzy') return 'dizzy';
    if (this.reaction?.kind === 'angry') return 'angry';
    if (this.reaction?.kind === 'startle') return 'startle';
    if (this.grabbing) return 'squish';
    if (this.reaction?.kind) return this.reaction.kind;
    if (this.isSleeping) return 'sleepy';
    if (this.anger > 0.65) return 'angry';
    if (this.anger > 0.3) return 'annoyed';
    return 'idle';
  }

  get mood() {
    if (this.isSleeping) return 'sleepy';
    if (this.anger > 0.65) return 'rage';
    if (this.anger > 0.3) return 'annoyed';
    return 'chill';
  }
}
