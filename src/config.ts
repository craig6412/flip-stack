/**
 * Flip Stack — all tuning in one place.
 * Determinism: physics steps at a FIXED 60Hz from an accumulator in
 * GameScene, sizes/wind come from a seeded RNG, and scoring is a pure
 * function. The same input at the same height = the same result, on any
 * device at any framerate. No Math.random() in gameplay.
 */
export const GAME = {
  WIDTH: 800,
  HEIGHT: 1280,
} as const;

export const PHYSICS = {
  /** Fixed Matter step (ms). GameScene steps manually (autoUpdate off). */
  FIXED_STEP_MS: 1000 / 60,
  MAX_STEPS_PER_FRAME: 5,
  GRAVITY_Y: 1.0,
  LAUNCH_VY_MIN: -11,
  LAUNCH_VY_MAX: -21,
  LAUNCH_VX_MAX: 2.2,
  /**
   * Spin is set by the gesture, NEVER auto-calibrated to the throw.
   * Expressed as "flips the pancake would complete on a REFERENCE throw"
   * so the player must match spin to power — that matching IS the game.
   */
  SPIN_FLIPS_MIN: 0.5,
  SPIN_FLIPS_MAX: 3.6,
  REF_VY: -16,
  CONTACT_STEPS_BASE: 26,
  CONTACT_STEPS_PER_VY: 6.0,
  /** In-flight steering — rising half of the flight only. */
  STEER_ACCEL: 0.018,
  STEER_MAX_VX: 1.2,
  PANCAKE_DENSITY: 0.0018,
  PANCAKE_FRICTION: 1.0,
  PANCAKE_FRICTION_AIR: 0.0005,
  PANCAKE_RESTITUTION: 0.02,
  PANCAKE_CHAMFER: 10,
  /** Landing resolution (sim-time, after first contact). */
  SETTLE_SPEED: 0.9,
  SETTLE_ANGULAR: 0.06,
  SETTLE_MS: 430,
  CONTACT_RESOLVE_MAX_MS: 1250,
  /** Landing assist: a light touch to stop jitter, not a save. */
  ASSIST_WINDOW_MS: 120,
  ASSIST_ANGULAR_DAMP: 0.85,
  ASSIST_VX_DAMP: 0.92,
  FALL_MARGIN_Y: 260,
} as const;

export const PANCAKE = {
  BASE_RADIUS: 78,
  BASE_THICKNESS: 22,
  RADIUS_VARIATION: 10,
  THICKNESS_VARIATION: 6,
} as const;

export const STACK = {
  CENTER_X: GAME.WIDTH / 2,
  PLATE_Y: 1060,
  PLATE_WIDTH: 280,
  PLATE_HEIGHT: 22,
  PAN_GAP_ABOVE_STACK: 150,
} as const;

export const SCORING = {
  BASE_POINTS: 100,
  CENTER_WEIGHT: 0.55,
  FLAT_WEIGHT: 0.45,
  ROTATION_BONUS_PER_EXTRA_FLIP: 25,
  MAX_ROTATION_BONUS_FLIPS: 4,
  PERFECT_POINTS: 50,
  PERFECT_CENTER_PX: 13,
  PERFECT_ANGLE_DEG: 6,
  GOOD_CENTER_PX: 55,
  GOOD_ANGLE_DEG: 18,
  SLOPPY_ANGLE_DEG: 50, // 18..50 = lands, but sloppy (adds lean pressure)
  FACE_DOWN_DEG: 130, // >130 = face-down; 50..130 = on its edge (rolls off)
  FACE_UP_TOLERANCE_DEG: 32, // legacy bound for HUD hints
  MAX_LANDING_OFFSET: 95,
  COMBO_STEP: 0.5,
  COMBO_MAX_MULTIPLIER: 3,
} as const;

/** Stack lean: the tower's top offset from plate centre. Sloppy landings
 *  push it out, perfects pull it back, too much = topple. */
export const LEAN = {
  MAX_PX: 110,
  WARN_PX: 70,
  SLOPPY_EXTRA_PX: 10,
  PERFECT_PULLBACK: 0.45,
  SWAY_PX_PER_LEAN: 0.06,
  SWAY_PX_PER_HEIGHT: 0.25,
  SWAY_MAX_PX: 14,
} as const;

export const DIFFICULTY = {
  SWAY_START: 4,
  WIND_START: 7,
  SIZE_VAR_START: 3,
  WIND_MAX_FORCE: 0.00055,
  WIND_PATTERN_EVERY: 3,
  SWAY_PERIOD_MS: 2600,
} as const;

export const INPUT = {
  /** Swipe: power from upward LENGTH, spin from release speed (last 70ms). */
  SWIPE_MIN_DISTANCE: 70,
  SWIPE_FULL_DISTANCE: 420,
  SWIPE_SPIN_MIN_SPEED: 0.4, // px/ms over the release window
  SWIPE_SPIN_SPEED_RANGE: 2.6,
  /** Circular: spin from loops, power from last-loop angular speed. */
  CIRCLE_MIN_LOOPS: 0.6,
  CIRCLE_IDEAL_LOOPS: 2.2,
  CIRCLE_FAST_RAD_PER_S: 30,
  /** Motion: power from spike peak, spin from peak wrist rotation rate. */
  MOTION_SPIKE_THRESHOLD: 14,
  MOTION_SPIKE_MAX: 42,
  MOTION_ROT_MAX: 900, // deg/s
  MOTION_COOLDOWN_MS: 900,
  DEFAULT_SENSITIVITY: 1.0,
} as const;

export const STORAGE_KEYS = {
  BEST_SCORE: 'flipstack.bestScore',
  SETTINGS: 'flipstack.settings',
  PROFILE: 'flipstack.profile',
  TUNING: 'flipstack.tuning',
  TUTORIAL_DONE: 'flipstack.tutorialDone',
  DAILY_BEST_PREFIX: 'flipstack.dailyBest.',
} as const;

export type ControlMode = 'auto' | 'motion' | 'swipe' | 'circular';

export interface FlipSettings {
  sensitivity: number;
  controlMode: ControlMode;
  sound: boolean;
  volume: number; // 0..1 master volume
}

export const DEFAULT_SETTINGS: FlipSettings = {
  sensitivity: INPUT.DEFAULT_SENSITIVITY,
  controlMode: 'auto',
  sound: true,
  volume: 0.9,
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

/** Phase 5 art pipeline: files in public/assets/ override procedural art. */
export const ASSETS: Record<string, string> = {
  pancake_top: 'assets/pancake_top.png',
  pancake_bottom: 'assets/pancake_bottom.png',
  pan: 'assets/pan.png',
  plate: 'assets/plate.png',
};

export const PANCAKE_VISUAL_MODE: 'swap' | 'sheet' = 'swap';

export function normalizeAngleDeg(rad: number): number {
  let d = ((rad * 180) / Math.PI) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}
/** 0 = perfectly face-up, 180 = perfectly face-down. */
export function faceUpErrorDeg(rad: number): number {
  return Math.abs(normalizeAngleDeg(rad));
}
export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
