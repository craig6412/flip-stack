import { DIFFICULTY, PANCAKE } from '../config';

/** Deterministic seeded RNG (mulberry32). Seed = stack height, so the
 *  pancake at height N is ALWAYS the same size — fair and learnable. */
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
  swayForce: number; // horizontal force amplitude this flight
  windForce: number; // signed; HUD shows direction when non-zero
  windDirection: -1 | 0 | 1;
  spec: PancakeSpec;
}

/**
 * Difficulty ramps ONLY with height, on a fixed schedule — never random.
 * The player can learn: "wind blows left for 3, then right for 3…"
 */
export class DifficultyManager {
  stateForHeight(height: number): DifficultyState {
    const spec = this.specForHeight(height);

    let swayForce = 0;
    if (height >= DIFFICULTY.SWAY_START) {
      const t = Math.min(1, (height - DIFFICULTY.SWAY_START + 1) / 10);
      swayForce = DIFFICULTY.SWAY_MAX_FORCE * t;
    }

    let windForce = 0;
    let windDirection: -1 | 0 | 1 = 0;
    if (height >= DIFFICULTY.WIND_START) {
      const phase = Math.floor((height - DIFFICULTY.WIND_START) / DIFFICULTY.WIND_PATTERN_EVERY);
      windDirection = phase % 2 === 0 ? 1 : -1;
      const t = Math.min(1, (height - DIFFICULTY.WIND_START + 1) / 8);
      windForce = windDirection * DIFFICULTY.WIND_MAX_FORCE * t;
    }

    return { height, swayForce, windForce, windDirection, spec };
  }

  specForHeight(height: number): PancakeSpec {
    if (height < DIFFICULTY.SIZE_VAR_START) {
      return { radius: PANCAKE.BASE_RADIUS, thickness: PANCAKE.BASE_THICKNESS };
    }
    const r1 = seededRandom(height * 2 + 11);
    const r2 = seededRandom(height * 2 + 12);
    return {
      radius: PANCAKE.BASE_RADIUS + Math.round((r1 * 2 - 1) * PANCAKE.RADIUS_VARIATION),
      thickness: PANCAKE.BASE_THICKNESS + Math.round((r2 * 2 - 1) * PANCAKE.THICKNESS_VARIATION),
    };
  }

  /** Sway phase for a given time — pure function, shared by physics + visuals. */
  swayAt(timeMs: number, height: number): number {
    const { swayForce } = this.stateForHeight(height);
    if (swayForce === 0) return 0;
    return Math.sin((timeMs / DIFFICULTY.SWAY_PERIOD_MS) * Math.PI * 2) * swayForce;
  }
}
