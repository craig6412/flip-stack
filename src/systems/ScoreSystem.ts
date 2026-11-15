import { SCORING, faceUpErrorDeg } from '../config';
import { loadTuning } from '../utils/tuning';

export interface LandingEval {
  dx: number;
  /** Angle at FIRST CONTACT (rad) — landings are judged on this, not the settled angle. */
  angleAtContactRad: number;
  rotations: number;
}

export type LandingReason = 'landed' | 'face-down' | 'edge' | 'too-far' | 'no-flip';

export interface LandingResult {
  success: boolean;
  perfect: boolean;
  sloppy: boolean;
  faceUp: boolean;
  points: number;
  rotationBonus: number;
  comboMultiplier: number;
  reason: LandingReason;
  angleErrorDeg: number;
}

/** Pure scoring (plus dev tuning overrides for the two angle tolerances). */
export class ScoreSystem {
  combo = 0;
  total = 0;
  landings = 0;
  perfects = 0;

  reset(): void {
    this.combo = 0;
    this.total = 0;
    this.landings = 0;
    this.perfects = 0;
  }

  get multiplier(): number {
    return Math.min(SCORING.COMBO_MAX_MULTIPLIER, 1 + this.combo * SCORING.COMBO_STEP);
  }

  evaluate(ev: LandingEval): LandingResult {
    const tuning = loadTuning();
    const perfectAngle = tuning.PERFECT_ANGLE_DEG;
    const goodAngle = tuning.GOOD_ANGLE_DEG;
    const absDx = Math.abs(ev.dx);
    const flatError = faceUpErrorDeg(ev.angleAtContactRad); // 0 face-up .. 180 face-down
    const faceUp = flatError <= SCORING.SLOPPY_ANGLE_DEG;

    const fail = (reason: LandingReason): LandingResult => {
      this.combo = 0;
      return {
        success: false, perfect: false, sloppy: false, faceUp,
        points: 0, rotationBonus: 0, comboMultiplier: 1, reason,
        angleErrorDeg: flatError,
      };
    };

    if (flatError > SCORING.FACE_DOWN_DEG) return fail('face-down');
    if (flatError > SCORING.SLOPPY_ANGLE_DEG) return fail('edge');
    if (ev.rotations < 1) return fail('no-flip');
    if (absDx > SCORING.MAX_LANDING_OFFSET) return fail('too-far');

    const centerScore = Math.max(0, 1 - absDx / SCORING.GOOD_CENTER_PX);
    const flatScore = Math.max(0, 1 - flatError / goodAngle);
    const baseFromCenter = SCORING.BASE_POINTS * SCORING.CENTER_WEIGHT * centerScore;
    const baseFromFlat = SCORING.BASE_POINTS * SCORING.FLAT_WEIGHT * Math.min(1, flatScore + 0.35);
    const extraFlips = Math.min(SCORING.MAX_ROTATION_BONUS_FLIPS, Math.max(0, ev.rotations - 1));
    const rotationBonus = extraFlips * SCORING.ROTATION_BONUS_PER_EXTRA_FLIP;

    const perfect = absDx <= SCORING.PERFECT_CENTER_PX && flatError <= perfectAngle;
    const sloppy = !perfect && flatError > goodAngle;

    let points = baseFromCenter + baseFromFlat + rotationBonus;
    if (perfect) {
      this.combo += 1;
      this.perfects += 1;
      points = (points + SCORING.PERFECT_POINTS) * this.multiplier;
    } else {
      this.combo = 0;
    }
    points = Math.round(points);
    this.total += points;
    this.landings += 1;

    return {
      success: true,
      perfect,
      sloppy,
      faceUp,
      points,
      rotationBonus,
      comboMultiplier: perfect ? this.multiplier : 1,
      reason: 'landed',
      angleErrorDeg: flatError,
    };
  }

  onMiss(): void {
    this.combo = 0;
  }
}
