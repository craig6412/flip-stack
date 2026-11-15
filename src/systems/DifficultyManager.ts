import { DIFFICULTY, PANCAKE } from '../config';
import { loadTuning } from '../utils/tuning';

/** Deterministic seeded RNG (mulberry32). Seed = f(height, run seed), so
 *  the pancake at height N of a given run/day is ALWAYS identical. */
export function seededRandom(seed: number): number {
  let t = (seed * 2654435761) >>> 0;
  t += 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export interface PancakeSpec {
  radius: number;
  thickness: number;
}

export interface DifficultyState {
  height: number;
  windForce: number;
  windDirection: -1 | 0 | 1;
  spec: PancakeSpec;
}

/**
 * Difficulty ramps ONLY with height, on a fixed schedule — never random.
 * The stack sway that used to be a flight force now lives in GameScene
 * (the stack itself sways; see LEAN in config).
 */
export class DifficultyManager {
  /** Run seed: 0 for endless, YYYYMMDD for Daily Stack. */
  runSeed = 0;

  stateForHeight(height: number): DifficultyState {
    const spec = this.specForHeight(height);

    let windForce = 0;
    let windDirection: -1 | 0 | 1 = 0;
    if (height >= DIFFICULTY.WIND_START) {
      const phase = Math.floor((height - DIFFICULTY.WIND_START) / DIFFICULTY.WIND_PATTERN_EVERY);
      // Daily seed flips the starting direction so days differ, still fixed per day.
      const startDir = this.runSeed === 0 ? 1 : seededRandom(this.runSeed) > 0.5 ? 1 : -1;
      windDirection = (phase % 2 === 0 ? startDir : -startDir) as -1 | 1;
      const t = Math.min(1, (height - DIFFICULTY.WIND_START + 1) / 8);
      windForce = windDirection * loadTuning().WIND_MAX_FORCE * t;
    }

    return { height, windForce, windDirection, spec };
  }

  specForHeight(height: number): PancakeSpec {
    if (height < DIFFICULTY.SIZE_VAR_START) {
      return { radius: PANCAKE.BASE_RADIUS, thickness: PANCAKE.BASE_THICKNESS };
    }
    const base = this.runSeed * 1000 + height;
    const r1 = seededRandom(base * 2 + 11);
    const r2 = seededRandom(base * 2 + 12);
    return {
      radius: PANCAKE.BASE_RADIUS + Math.round((r1 * 2 - 1) * PANCAKE.RADIUS_VARIATION),
      thickness: PANCAKE.BASE_THICKNESS + Math.round((r2 * 2 - 1) * PANCAKE.THICKNESS_VARIATION),
    };
  }
}
