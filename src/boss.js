// Deadlines use a monotonic clock, independent of frame rate and input frequency.
export const BOSS_IDLE_MS = 5000;
export const BOSS_HIT_MS = 2000;
export const BOSS_HIT_INTERVAL_MS = 180;

export class BossEncounter {
  constructor({ now = () => performance.now(), random = Math.random } = {}) {
    this.now = now;
    this.random = random;
    this.active = false;
    this.schedule();
  }
  schedule() { this.nextAt = this.now() + 25000 + this.random() * 30000; }
  start() {
    if (this.active) return false;
    this.active = true;
    this.startedAt = this.now();
    this.firstHitAt = null;
    this.lastHitAt = -Infinity;
    this.hits = 0;
    this.line = Math.floor(this.random() * 4);
    return true;
  }
  get deadline() { return this.firstHitAt === null ? this.startedAt + BOSS_IDLE_MS : this.firstHitAt + BOSS_HIT_MS; }
  hit() {
    const now = this.now();
    if (!this.active || now >= this.deadline || now - this.lastHitAt < BOSS_HIT_INTERVAL_MS) return false;
    this.firstHitAt ??= now;
    this.lastHitAt = now;
    this.hits++;
    return true;
  }
  end() { this.active = false; this.schedule(); }
  update(canSpawn = true) {
    if (this.active && this.now() >= this.deadline) this.end();
    else if (!this.active && canSpawn && this.now() >= this.nextAt) this.start();
  }
}
