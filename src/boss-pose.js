const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

// Visual beats live inside the original deadline, so the exit never adds time.
export function bossPose(encounter, now, reducedMotion = false) {
  if (!encounter.active) return null;
  const age = Math.max(0, now - encounter.startedAt);
  const hitAge = encounter.firstHitAt === null ? 0 : Math.max(0, now - encounter.firstHitAt);
  const exit = clamp((900 - (encounter.deadline - now)) / 900);
  const hit = encounter.hits > 0;
  const relief = hit ? smooth(exit / 0.28) : 0;
  const sadness = hit ? 0 : smooth(exit / 0.28);
  const fear = hit ? smooth(hitAge / 260) * (encounter.hits >= 3 ? 1 : 0.55 + smooth((hitAge - 500) / 450) * 0.45) : 0;
  const shock = hit ? 1 - smooth(hitAge / 280) : 0;
  const phase = exit > 0 ? 'exit' : !hit ? 'lecture' : hitAge < 260 ? 'shocked' : fear > 0.85 ? 'panic' : 'defiant';
  // Pause between two little pointing gestures; reduced motion keeps the back-hand pose.
  const point = !hit && !reducedMotion ? Math.sin(Math.PI * clamp((age - 850) / 1650)) ** 2 : 0;
  return { phase, fear, shock, point, exit, relief, sadness, weight: 1,
    recoil: hit && !reducedMotion ? Math.max(0, 1 - (now - encounter.lastHitAt) / 180) : 0,
    shake: hit && !reducedMotion ? Math.sin(now / 42) * fear * 0.025 : 0,
  };
}
