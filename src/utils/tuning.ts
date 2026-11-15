import { PHYSICS, SCORING, STORAGE_KEYS } from '../config';

/**
 * Dev tuning overrides (Phase 1.6). The debug overlay writes these to
 * localStorage; gameplay reads the EFFECTIVE value (override ?? config).
 * Only the overlay touches this — shipping gameplay uses config defaults.
 */
export interface TuningValues {
  LAUNCH_VY_MIN: number;
  LAUNCH_VY_MAX: number;
  SPIN_FLIPS_MIN: number;
  SPIN_FLIPS_MAX: number;
  STEER_ACCEL: number;
  ASSIST_ANGULAR_DAMP: number;
  PERFECT_ANGLE_DEG: number;
  GOOD_ANGLE_DEG: number;
  WIND_MAX_FORCE: number;
  GRAVITY_Y: number;
}

export const TUNING_DEFAULTS: TuningValues = {
  LAUNCH_VY_MIN: PHYSICS.LAUNCH_VY_MIN,
  LAUNCH_VY_MAX: PHYSICS.LAUNCH_VY_MAX,
  SPIN_FLIPS_MIN: PHYSICS.SPIN_FLIPS_MIN,
  SPIN_FLIPS_MAX: PHYSICS.SPIN_FLIPS_MAX,
  STEER_ACCEL: PHYSICS.STEER_ACCEL,
  ASSIST_ANGULAR_DAMP: PHYSICS.ASSIST_ANGULAR_DAMP,
  PERFECT_ANGLE_DEG: SCORING.PERFECT_ANGLE_DEG,
  GOOD_ANGLE_DEG: SCORING.GOOD_ANGLE_DEG,
  WIND_MAX_FORCE: 0.00055,
  GRAVITY_Y: PHYSICS.GRAVITY_Y,
};

let cache: TuningValues | null = null;

export function loadTuning(): TuningValues {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TUNING);
    cache = raw ? { ...TUNING_DEFAULTS, ...(JSON.parse(raw) as Partial<TuningValues>) } : { ...TUNING_DEFAULTS };
  } catch {
    cache = { ...TUNING_DEFAULTS };
  }
  return cache;
}

export function saveTuning(v: TuningValues): void {
  cache = { ...v };
  try {
    localStorage.setItem(STORAGE_KEYS.TUNING, JSON.stringify(v));
  } catch { /* ignore */ }
}

export function tuningAsConfigSnippet(): string {
  const t = loadTuning();
  return Object.entries(t)
    .map(([k, v]) => `  ${k}: ${typeof v === 'number' ? Number(v.toFixed(5)) : v},`)
    .join('\n');
}
