/**
 * Flip Stack — all tuning in one place.
 * Determinism note: physics uses a FIXED timestep (see GameScene) and a
 * seeded RNG (see DifficultyManager) so the same input at the same stack
 * height always produces the same result. No Math.random() in gameplay.
 */
export const GAME = {
  WIDTH: 800,
  HEIGHT: 1280,
} as const;

export const PHYSICS = {
  /** Fixed Matter step (ms). Fixed = deterministic. */
  FIXED_STEP_MS: 1000 / 120,
  GRAVITY_Y: 1.0, // Matter default scale; tuned with velocity below
  /** Launch velocity mapping: vy = lerp(MIN, MAX, power) */
  LAUNCH_VY_MIN: -11,
  LAUNCH_VY_MAX: -21,
  /** Small horizontal velocity from gesture direction (-1..1) */
  LAUNCH_VX_MAX: 2.2,
  /** In-flight tilt steering (sim-calibrated: tilt 0.3 ≈ ±78px correction,
   *  full tilt ≈ ±165px on a medium flip). Applied per 60fps frame. */
  STEER_ACCEL: 0.03,
  STEER_MAX_VX: 1.9,
  /**
   * Spin is computed from the launch itself (see GameScene.computeLaunch):
   * flips are banded by power (light = 1, medium = 2, hard = 3) and the
   * angular velocity is derived from the predicted time-to-contact so the
   * rotation completes just as the pancake reaches the stack. Circular
   * input gives continuous flips instead. Calibrated in a matter-js sim.
   */
  FLIP_BAND_1_MAX_POWER: 0.42,
  FLIP_BAND_2_MAX_POWER: 0.75,
  CONTACT_STEPS_BASE: 26,
  CONTACT_STEPS_PER_VY: 6.0,
  SPIN_DECAY_COMP: 0.97,
  PANCAKE_DENSITY: 0.0018,
  PANCAKE_FRICTION: 1.0,
  PANCAKE_FRICTION_AIR: 0.0005,
  PANCAKE_RESTITUTION: 0.02, // almost no bounce — pancakes plop, they don't bounce
  PANCAKE_CHAMFER: 10,
  /** Landing resolution: after first contact, resolve when slowish past
   *  SETTLE_MS, or unconditionally after CONTACT_RESOLVE_MAX_MS. */
  SETTLE_SPEED: 0.9,
  SETTLE_ANGULAR: 0.06,
  SETTLE_MS: 430,
  CONTACT_RESOLVE_MAX_MS: 1250,
  /** Landing assist: spin/slide damping window right after first contact. */
  ASSIST_WINDOW_MS: 240,
  ASSIST_ANGULAR_DAMP: 0.55,
  ASSIST_VX_DAMP: 0.78,
  /** Fall-off detection */
  FALL_MARGIN_Y: 260, // fell this far below stack top => game over
  MAX_LANDING_OFFSET: 95, // |dx| beyond this from stack centre => miss / topple
} as const;

export const PANCAKE = {
  BASE_RADIUS: 78,
  BASE_THICKNESS: 22,
  /** Deterministic size variation range by height (DifficultyManager) */
  RADIUS_VARIATION: 10, // ± px
  THICKNESS_VARIATION: 6, // ± px
} as const;

export const STACK = {
  CENTER_X: GAME.WIDTH / 2,
  PLATE_Y: 1060,
  PLATE_WIDTH: 280,
  PLATE_HEIGHT: 22,
  /** Pan hovers this far above the stack top, pancake launches up and falls back onto the stack. */
  PAN_GAP_ABOVE_STACK: 150,
} as const;

export const SCORING = {
  BASE_POINTS: 100,
  /** Centeredness weight / flatness weight (sum should be ~1) */
  CENTER_WEIGHT: 0.55,
  FLAT_WEIGHT: 0.45,
  /** Rotation bonus per full flip beyond the first */
  ROTATION_BONUS_PER_EXTRA_FLIP: 25,
  MAX_ROTATION_BONUS_FLIPS: 4,
  PERFECT_POINTS: 50,
  /** Perfect tolerances */
  PERFECT_CENTER_PX: 13,
  PERFECT_ANGLE_DEG: 7,
  /** Good landing tolerances (beyond this = sloppy / possible topple) */
  GOOD_CENTER_PX: 55,
  GOOD_ANGLE_DEG: 24,
  /** Face-up check: final angle mod 360 must be within this of 0 */
  FACE_UP_TOLERANCE_DEG: 32,
  COMBO_STEP: 0.5, // multiplier = 1 + combo * STEP, capped
  COMBO_MAX_MULTIPLIER: 3,
} as const;

export const DIFFICULTY = {
  /** Height (pancakes) where each effect starts */
  SWAY_START: 4,
  WIND_START: 7,
  SIZE_VAR_START: 3,
  /** Sway: gentle sinusoidal horizontal force on the FLYING pancake + visual stack sway */
  SWAY_MAX_FORCE: 0.00035,
  SWAY_PERIOD_MS: 2600,
  /** Wind: constant-ish light force during flight, direction alternates deterministically per height */
  WIND_MAX_FORCE: 0.00055,
  /** Every N pancakes the wind direction flips (predictable pattern, shown in HUD) */
  WIND_PATTERN_EVERY: 3,
} as const;

export const INPUT = {
  /** Swipe: px/ms mapped to power */
  SWIPE_POWER_MIN_SPEED: 0.35,
  SWIPE_POWER_MAX_SPEED: 2.4,
  SWIPE_MIN_DISTANCE: 70,
  /** Circular: loops + angular speed mapped to power/spin */
  CIRCLE_MIN_LOOPS: 0.6,
  CIRCLE_IDEAL_LOOPS: 2.2,
  /** Motion: m/s^2 spike detection (accelerationIncludingGravity magnitude delta) */
  MOTION_SPIKE_THRESHOLD: 14,
  MOTION_SPIKE_MAX: 42,
  MOTION_COOLDOWN_MS: 900,
  DEFAULT_SENSITIVITY: 1.0, // 0.5 .. 1.6
} as const;

export const STORAGE_KEYS = {
  BEST_SCORE: 'flipstack.bestScore',
  SETTINGS: 'flipstack.settings',
} as const;

export type ControlMode = 'auto' | 'motion' | 'swipe' | 'circular';

export interface FlipSettings {
  sensitivity: number;
  controlMode: ControlMode;
  sound: boolean;
}

export const DEFAULT_SETTINGS: FlipSettings = {
  sensitivity: INPUT.DEFAULT_SENSITIVITY,
  controlMode: 'auto',
  sound: true,
};

export function loadSettings(): FlipSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<FlipSettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: FlipSettings): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(s));
  } catch { /* private mode */ }
}

export function loadBest(): number {
  try {
    return Number(localStorage.getItem(STORAGE_KEYS.BEST_SCORE) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export function saveBest(v: number): void {
  try {
    localStorage.setItem(STORAGE_KEYS.BEST_SCORE, String(v));
  } catch { /* ignore */ }
}

/** Angle helpers — angles in radians unless suffixed Deg. */
export function normalizeAngleDeg(rad: number): number {
  let d = ((rad * 180) / Math.PI) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}
/** Smallest distance (deg) from angle to face-up (0 mod 360). 0 = perfectly face-up, 180 = face-down. */
export function faceUpErrorDeg(rad: number): number {
  const d = Math.abs(normalizeAngleDeg(rad));
  return Math.min(d, 360 - d) > 180 ? 360 - Math.min(d, 360 - d) : Math.min(d, 360 - d);
}
export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
