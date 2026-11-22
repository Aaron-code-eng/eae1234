/** Small, dependency-free math helpers shared by simulation and rendering. */

export const TAU = Math.PI * 2;

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const lerp = (a, b, t) => a + (b - a) * t;

/** Frame-rate independent exponential smoothing. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

/** Normalise an angle into [-PI, PI]. */
export function wrapAngle(angle) {
  let a = (angle + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Signed shortest turn from `from` to `to`. */
export const angleDiff = (from, to) => wrapAngle(to - from);

export const distance = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const dot = (ax, ay, bx, by) => ax * bx + ay * by;

export function approach(value, target, delta) {
  return value < target ? Math.min(value + delta, target) : Math.max(value - delta, target);
}

export const rand = (min, max) => min + Math.random() * (max - min);
export const randInt = (min, max) => Math.floor(rand(min, max + 1));
export const pick = (items) => items[Math.floor(Math.random() * items.length)];

export function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Seconds -> mm:ss.cc, or a placeholder for unset times. */
export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--.--';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${rest.toFixed(2).padStart(5, '0')}`;
}

export const formatCredits = (amount) => Math.max(0, Math.floor(amount)).toLocaleString('en-US');
