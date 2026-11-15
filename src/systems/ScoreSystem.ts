import { SCORING, faceUpErrorDeg } from '../config';

export interface LandingEval {
  /** Horizontal distance from stack centre (px, signed). */
  dx: number;
  /** Final body angle (rad). */
  angleRad: number;
  /** Full 360° rotations completed during flight. */
  rotations: number;
}

export interface LandingResult {
  success: boolean;
  perfect: boolean;
  faceUp: boolean;
  points: number;
  baseFromCenter: number;
  baseFromFlat: number;
  rotationBonus: number;
  comboMultiplier: number;
  reason: 'landed' | 'face-down' | 'too-far' | 'no-flip';
}

/**
 * Pure, deterministic scoring. Same LandingEval + same combo in = same points out.
 */
export class ScoreSystem {
  combo = 0; // consecutive perfects
  total = 0;
  landings = 0;

  reset(): void {
    this.combo = 0;
    this.total = 0;
    this.landings = 0;
  }

  get multiplier(): number {
    return Math.min(SCORING.COMBO_MAX_MULTIPLIER, 1 + this.combo * SCORING.COMBO_STEP);
  }

  evaluate(ev: LandingEval): LandingResult {
    const absDx = Math.abs(ev.dx);
    const flatError = faceUpErrorDeg(ev.angleRad); // 0 = face-up flat, 180 = face-down
    const faceUp = flatError <= SCORING.FACE_UP_TOLERANCE_DEG;

    const fail = (reason: LandingResult['reason']): LandingResult => {
      this.combo = 0;
      return {
        success: false, perfect: false, faceUp, points: 0,
        baseFromCenter: 0, baseFromFlat: 0, rotationBonus: 0,
        comboMultiplier: 1, reason,
      };
    };

    if (!faceUp) return fail('face-down');
    if (ev.rotations < 1) return fail('no-flip');
    if (absDx > 95) return fail('too-far');

    const centerScore = Math.max(0, 1 - absDx / SCORING.GOOD_CENTER_PX) ;
    const flatScore = Math.max(0, 1 - flatError / SCORING.GOOD_ANGLE_DEG);
    const baseFromCenter = SCORING.BASE_POINTS * SCORING.CENTER_WEIGHT * centerScore;
    const baseFromFlat = SCORING.BASE_POINTS * SCORING.FLAT_WEIGHT * Math.min(1, flatScore + 0.35);
    const extraFlips = Math.min(SCORING.MAX_ROTATION_BONUS_FLIPS, Math.max(0, ev.rotations - 1));
    const rotationBonus = extraFlips * SCORING.ROTATION_BONUS_PER_EXTRA_FLIP;

    const perfect =
      absDx <= SCORING.PERFECT_CENTER_PX && flatError <= SCORING.PERFECT_ANGLE_DEG;

    let points = baseFromCenter + baseFromFlat + rotationBonus;
    if (perfect) {
      this.combo += 1;
      points = (points + SCORING.PERFECT_POINTS) * this.multiplier;
    } else {
      this.combo = 0;
      points = points * 1;
    }
    points = Math.round(points);
    this.total += points;
    this.landings += 1;

    return {
      success: true,
      perfect,
      faceUp,
      points,
      baseFromCenter: Math.round(baseFromCenter),
      baseFromFlat: Math.round(baseFromFlat),
      rotationBonus,
      comboMultiplier: perfect ? this.multiplier : 1,
      reason: 'landed',
    };
  }

  /** Called when a pancake is lost — combo resets, game ends in GameScene. */
  onMiss(): void {
    this.combo = 0;
  }
}
