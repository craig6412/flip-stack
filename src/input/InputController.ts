import Phaser from 'phaser';
import { GAME, INPUT, clamp01, type ControlMode, type FlipSettings } from '../config';

/**
 * A single flip gesture, normalised so physics mapping is identical
 * no matter which device produced it. THIS is the determinism contract:
 * the same FlipInput always produces the same launch.
 */
export interface FlipInput {
  /** 0..1 launch strength */
  power: number;
  /** 0..1 spin amount (maps to angular velocity; ~0.45 ≈ one clean flip for a medium toss) */
  spin: number;
  /** -1..1 horizontal intent (tilt / swipe drift / circle direction) */
  drift: number;
  source: 'motion' | 'swipe' | 'circular' | 'drag' | 'keyboard';
}

export type FlipHandler = (input: FlipInput) => void;

/**
 * One interface for every input method.
 * To ship with Capacitor later: implement this same interface with the
 * Capacitor Motion plugin (e.g. @capacitor/motion) and swap it in
 * GameScene — no gameplay code changes.
 */
export interface IInputController {
  enable(): void;
  disable(): void;
  destroy(): void;
  setSettings(s: FlipSettings): void;
  /** Live gesture feedback 0..1 for the power meter (0 when idle). */
  getCharge(): number;
  /**
   * Continuous horizontal steering input, -1 (full left) .. 1 (full right).
   * Sources, in priority order: arrow/A-D keys held, pointer held down
   * (position vs screen centre), device tilt (devicemotion gravity X).
   * GameScene applies this only while a pancake is flying.
   */
  getTilt(): number;
}

/** iOS 13+ requires a user-gesture permission call for DeviceMotion. */
export async function requestMotionPermission(): Promise<boolean> {
  const DME = DeviceMotionEvent as unknown as {
    requestPermission?: () => Promise<'granted' | 'denied'>;
  };
  if (typeof DME?.requestPermission === 'function') {
    try {
      return (await DME.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }
  return typeof DeviceMotionEvent !== 'undefined';
}

export function motionNeedsPermission(): boolean {
  const DME = DeviceMotionEvent as unknown as { requestPermission?: unknown };
  return typeof DME?.requestPermission === 'function';
}

/**
 * Unified controller: motion (flick) + swipe + circular mouse + drag fallback
 * + Space key (desktop testing). Mode setting filters which are active:
 *  - auto:     motion if available, plus swipe on touch, circular+drag on mouse
 *  - motion:   motion + swipe fallback
 *  - swipe:    swipe / drag only
 *  - circular: circular / drag only
 */
export class InputController implements IInputController {
  private scene: Phaser.Scene;
  private onFlip: FlipHandler;
  private settings: FlipSettings;
  private enabled = false;

  // swipe / drag state
  private pointerDownAt = 0;
  private pointerStart: { x: number; y: number } | null = null;
  private pointerTrail: { x: number; y: number; t: number }[] = [];
  private charge = 0;

  // circular state
  private circleAngleTotal = 0;
  private lastAngle: number | null = null;
  private circleCenter: { x: number; y: number } | null = null;

  // motion state
  private lastMotionAt = 0;
  private motionPeak = 0;
  private motionArmedAt = 0;
  private boundMotion = (e: DeviceMotionEvent) => this.handleMotion(e);

  // steering state
  private deviceTilt = 0; // smoothed, -1..1
  private keyLeft = false;
  private keyRight = false;

  constructor(scene: Phaser.Scene, settings: FlipSettings, onFlip: FlipHandler) {
    this.scene = scene;
    this.settings = settings;
    this.onFlip = onFlip;

    scene.input.on('pointerdown', this.onPointerDown, this);
    scene.input.on('pointermove', this.onPointerMove, this);
    scene.input.on('pointerup', this.onPointerUp, this);
    scene.input.keyboard?.on('keydown-SPACE', this.onSpace, this);
    scene.input.keyboard?.on('keydown-LEFT', () => (this.keyLeft = true), this);
    scene.input.keyboard?.on('keyup-LEFT', () => (this.keyLeft = false), this);
    scene.input.keyboard?.on('keydown-RIGHT', () => (this.keyRight = true), this);
    scene.input.keyboard?.on('keyup-RIGHT', () => (this.keyRight = false), this);
    scene.input.keyboard?.on('keydown-A', () => (this.keyLeft = true), this);
    scene.input.keyboard?.on('keyup-A', () => (this.keyLeft = false), this);
    scene.input.keyboard?.on('keydown-D', () => (this.keyRight = true), this);
    scene.input.keyboard?.on('keyup-D', () => (this.keyRight = false), this);
  }

  getTilt(): number {
    if (this.keyLeft || this.keyRight) {
      return (this.keyRight ? 1 : 0) - (this.keyLeft ? 1 : 0);
    }
    const pointer = this.scene.input.activePointer;
    if (pointer && pointer.isDown) {
      return clampDrift((pointer.x - GAME.WIDTH / 2) / (GAME.WIDTH / 2 - 120));
    }
    return this.deviceTilt;
  }

  setSettings(s: FlipSettings): void {
    this.settings = s;
  }

  enable(): void {
    this.enabled = true;
    window.addEventListener('devicemotion', this.boundMotion);
  }

  disable(): void {
    this.enabled = false;
    this.charge = 0;
  }

  destroy(): void {
    window.removeEventListener('devicemotion', this.boundMotion);
    this.scene.input.off('pointerdown', this.onPointerDown, this);
    this.scene.input.off('pointermove', this.onPointerMove, this);
    this.scene.input.off('pointerup', this.onPointerUp, this);
    this.scene.input.keyboard?.off('keydown-SPACE', this.onSpace, this);
  }

  getCharge(): number {
    return this.charge;
  }

  // ---- keyboard (desktop testing / accessibility) ----
  private onSpace(): void {
    if (!this.enabled) return;
    this.emit({ power: 0.62, spin: 0.5, drift: 0, source: 'keyboard' });
  }

  // ---- pointer: swipe + circular + drag ----
  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (!this.enabled) return;
    this.pointerDownAt = this.scene.time.now;
    this.pointerStart = { x: p.x, y: p.y };
    this.pointerTrail = [{ x: p.x, y: p.y, t: this.pointerDownAt }];
    this.circleCenter = { x: p.x, y: p.y };
    this.circleAngleTotal = 0;
    this.lastAngle = null;
    this.charge = 0;
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    if (!this.enabled || !p.isDown || !this.pointerStart) return;
    const now = this.scene.time.now;
    this.pointerTrail.push({ x: p.x, y: p.y, t: now });
    if (this.pointerTrail.length > 40) this.pointerTrail.shift();

    // Circular tracking: angle around the moving centroid of the trail.
    if (this.circleCenter) {
      // Centre drifts toward the centroid so small circles still register.
      this.circleCenter.x = this.circleCenter.x * 0.92 + p.x * 0.08;
      this.circleCenter.y = this.circleCenter.y * 0.92 + p.y * 0.08;
      const ang = Math.atan2(p.y - this.circleCenter.y, p.x - this.circleCenter.x);
      if (this.lastAngle !== null) {
        let d = ang - this.lastAngle;
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        this.circleAngleTotal += d;
      }
      this.lastAngle = ang;
    }

    // Live charge meter: prefer swipe distance, fall back to loops.
    const dy = this.pointerStart.y - p.y;
    const swipeCharge = clamp01(dy / 320);
    const loopCharge = clamp01(Math.abs(this.circleAngleTotal) / (Math.PI * 2 * INPUT.CIRCLE_IDEAL_LOOPS));
    this.charge = Math.max(swipeCharge, loopCharge);
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    if (!this.enabled || !this.pointerStart) return;
    const now = this.scene.time.now;
    const dt = Math.max(16, now - this.pointerDownAt) / 1000;
    const dx = p.x - this.pointerStart.x;
    const dy = this.pointerStart.y - p.y; // up = positive
    const dist = Math.hypot(dx, dy);
    const mode = this.settings.controlMode;
    this.pointerStart = null;
    this.charge = 0;

    const loops = Math.abs(this.circleAngleTotal) / (Math.PI * 2);
    const isCircular =
      (mode === 'circular' || mode === 'auto') && loops >= INPUT.CIRCLE_MIN_LOOPS && dist < 260;

    if (isCircular) {
      const angularSpeed = Math.abs(this.circleAngleTotal) / dt; // rad/s
      const power = clamp01(0.35 + loops / INPUT.CIRCLE_IDEAL_LOOPS * 0.45 + angularSpeed / 28 * 0.3);
      const spinDir = this.circleAngleTotal >= 0 ? 1 : -1;
      const spin = clamp01(loops / INPUT.CIRCLE_IDEAL_LOOPS) * (spinDir >= 0 ? 1 : 0.85);
      this.emit({ power: this.applySensitivity(power), spin, drift: clampDrift(dx / 300), source: 'circular' });
      return;
    }

    // Swipe / drag-up fallback
    if ((mode === 'swipe' || mode === 'motion' || mode === 'auto' || mode === 'circular') && dy > INPUT.SWIPE_MIN_DISTANCE) {
      const speed = dy / dt / 1000; // px per ms → scaled below
      const speedPxPerSec = dy / dt;
      const powerRaw = (speedPxPerSec / 1000 - INPUT.SWIPE_POWER_MIN_SPEED) /
        (INPUT.SWIPE_POWER_MAX_SPEED - INPUT.SWIPE_POWER_MIN_SPEED);
      const power = clamp01(powerRaw);
      // Faster flicks spin more; a slow drag gives a gentle single flip.
      const spin = clamp01(0.3 + power * 0.55);
      void speed;
      this.emit({ power: this.applySensitivity(power), spin, drift: clampDrift(dx / 260), source: dy > 140 ? 'swipe' : 'drag' });
    }
  }

  // ---- DeviceMotion: upward flick = acceleration spike ----
  private handleMotion(e: DeviceMotionEvent): void {
    if (!this.enabled) return;
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null || a.y == null || a.z == null) return;
    // Tilt steering updates in EVERY mode (it's steering, not flipping).
    // Portrait play: gravity X ≈ -9.8 (tilt left) .. +9.8 (tilt right).
    const tiltTarget = clampDrift(a.x / 6.5);
    this.deviceTilt = this.deviceTilt * 0.72 + tiltTarget * 0.28;
    if (Math.abs(this.deviceTilt) < 0.04) this.deviceTilt = 0; // deadzone

    if (this.settings.controlMode === 'swipe' || this.settings.controlMode === 'circular') return;
    const mag = Math.hypot(a.x, a.y, a.z);
    const now = performance.now();
    // Resting magnitude ≈ 9.8. A flick spikes well above it.
    const excess = mag - 9.8;

    if (excess > 4) {
      if (now - this.motionArmedAt > 350) {
        this.motionArmedAt = now;
        this.motionPeak = excess;
      } else {
        this.motionPeak = Math.max(this.motionPeak, excess);
      }
    }

    const sinceArm = now - this.motionArmedAt;
    if (
      this.motionPeak > INPUT.MOTION_SPIKE_THRESHOLD &&
      sinceArm > 90 && sinceArm < 500 &&
      now - this.lastMotionAt > INPUT.MOTION_COOLDOWN_MS
    ) {
      this.lastMotionAt = now;
      const power = clamp01(
        (this.motionPeak - INPUT.MOTION_SPIKE_THRESHOLD) /
          (INPUT.MOTION_SPIKE_MAX - INPUT.MOTION_SPIKE_THRESHOLD),
      );
      const rot = e.rotationRate?.beta ?? 180;
      const spin = clamp01(0.3 + Math.abs(rot) / 700);
      const drift = clampDrift((a.x ?? 0) / 18);
      this.motionPeak = 0;
      this.emit({ power: this.applySensitivity(0.25 + power * 0.75), spin, drift, source: 'motion' });
    }
  }

  private applySensitivity(power: number): number {
    return clamp01(power * this.settings.sensitivity);
  }

  private emit(input: FlipInput): void {
    if (!this.enabled) return;
    this.onFlip(input);
  }
}

function clampDrift(v: number): number {
  return Math.max(-1, Math.min(1, v));
}
