import Phaser from 'phaser';
import { GAME, INPUT, clamp01, type ControlMode, type FlipSettings } from '../config';

/**
 * A single flip gesture. Power and spin are INDEPENDENT player inputs —
 * the game never calibrates spin to the throw. Matching them is the skill.
 */
export interface FlipInput {
  power: number; // 0..1 launch strength (height)
  spin: number; // 0..1 rotation amount (flips on a reference throw)
  spinDir?: 1 | -1;
  drift: number; // -1..1 horizontal intent
  source: 'motion' | 'swipe' | 'circular' | 'drag' | 'keyboard';
}

export type FlipHandler = (input: FlipInput) => void;

/**
 * One interface for every input method. A Capacitor Motion implementation
 * swaps in here later — same interface, no gameplay changes.
 */
export interface IInputController {
  enable(): void;
  disable(): void;
  destroy(): void;
  setSettings(s: FlipSettings): void;
  getCharge(): number;
  getTilt(): number;
  /** Called by the game on launch so pointer steering can't leak from the
   *  swipe that just launched the pancake. */
  markLaunch(): void;
}

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

export class InputController implements IInputController {
  private scene: Phaser.Scene;
  private onFlip: FlipHandler;
  private settings: FlipSettings;
  private enabled = false;

  private pointerDownAt = 0;
  private pointerStart: { x: number; y: number } | null = null;
  private pointerTrail: { x: number; y: number; t: number }[] = [];
  private charge = 0;

  // circular state
  private circleAngleTotal = 0;
  private lastAngle: number | null = null;
  private circleCenter: { x: number; y: number } | null = null;
  private circleSamples: { angle: number; t: number }[] = [];

  // motion state
  private lastMotionAt = 0;
  private motionPeak = 0;
  private motionRotPeak = 0;
  private motionArmedAt = 0;
  private boundMotion = (e: DeviceMotionEvent) => this.handleMotion(e);

  // steering state
  private deviceTilt = 0;
  private keyLeft = false;
  private keyRight = false;
  private launchMarkAt = -1; // performance.now() of the last launch
  private lastPointerDownAt = -1;

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

  markLaunch(): void {
    this.launchMarkAt = performance.now();
  }

  getTilt(): number {
    if (this.keyLeft || this.keyRight) {
      return (this.keyRight ? 1 : 0) - (this.keyLeft ? 1 : 0);
    }
    const pointer = this.scene.input.activePointer;
    // Pointer steering only while flying AND the pointer went down AFTER launch.
    if (pointer && pointer.isDown && this.lastPointerDownAt > this.launchMarkAt && this.launchMarkAt >= 0) {
      return clampDrift((pointer.x - GAME.WIDTH / 2) / (GAME.WIDTH / 2 - 120));
    }
    return this.deviceTilt;
  }

  private onSpace(): void {
    if (!this.enabled) return;
    if (!import.meta.env.DEV) return; // testing only
    this.emit({ power: 0.62, spin: 0.5, spinDir: 1, drift: 0, source: 'keyboard' });
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (!this.enabled) return;
    this.pointerDownAt = this.scene.time.now;
    this.lastPointerDownAt = performance.now();
    this.pointerStart = { x: p.x, y: p.y };
    this.pointerTrail = [{ x: p.x, y: p.y, t: this.pointerDownAt }];
    this.circleCenter = { x: p.x, y: p.y };
    this.circleAngleTotal = 0;
    this.lastAngle = null;
    this.circleSamples = [];
    this.charge = 0;
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    if (!this.enabled || !p.isDown || !this.pointerStart) return;
    const now = this.scene.time.now;
    this.pointerTrail.push({ x: p.x, y: p.y, t: now });
    if (this.pointerTrail.length > 60) this.pointerTrail.shift();

    if (this.circleCenter) {
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
      this.circleSamples.push({ angle: this.circleAngleTotal, t: now });
      if (this.circleSamples.length > 40) this.circleSamples.shift();
    }

    const dy = this.pointerStart.y - p.y;
    const swipeCharge = clamp01(dy / INPUT.SWIPE_FULL_DISTANCE);
    const loopCharge = clamp01(Math.abs(this.circleAngleTotal) / (Math.PI * 2 * INPUT.CIRCLE_IDEAL_LOOPS));
    this.charge = Math.max(swipeCharge, loopCharge);
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    if (!this.enabled || !this.pointerStart) return;
    const now = this.scene.time.now;
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
      // spin = loops; power = how fast the last loop was drawn (~last 250ms).
      const cutoff = now - 250;
      const recent = this.circleSamples.filter((s) => s.t >= cutoff);
      let angularSpeed = 0;
      if (recent.length >= 2) {
        const first = recent[0];
        const last = recent[recent.length - 1];
        const dt = Math.max(30, last.t - first.t) / 1000;
        angularSpeed = Math.abs(last.angle - first.angle) / dt;
      }
      const power = clamp01(angularSpeed / INPUT.CIRCLE_FAST_RAD_PER_S);
      const spin = clamp01(loops / INPUT.CIRCLE_IDEAL_LOOPS);
      this.emit({
        power: this.applySensitivity(power),
        spin,
        spinDir: this.circleAngleTotal >= 0 ? 1 : -1,
        drift: clampDrift(dx / 300),
        source: 'circular',
      });
      return;
    }

    // Swipe / drag-up: POWER = length of the upward travel,
    // SPIN = release speed over the last 70ms of the trail.
    if (dy > INPUT.SWIPE_MIN_DISTANCE) {
      const power = clamp01((dy - INPUT.SWIPE_MIN_DISTANCE) / INPUT.SWIPE_FULL_DISTANCE);
      let releaseSpeed = 0;
      const cutoff = now - 70;
      const recent = this.pointerTrail.filter((pt) => pt.t >= cutoff);
      if (recent.length >= 2) {
        const first = recent[0];
        const last = recent[recent.length - 1];
        const dt = Math.max(8, last.t - first.t);
        releaseSpeed = Math.hypot(last.x - first.x, last.y - first.y) / dt; // px/ms
      }
      const spin = clamp01(
        (releaseSpeed - INPUT.SWIPE_SPIN_MIN_SPEED) / INPUT.SWIPE_SPIN_SPEED_RANGE,
      );
      this.emit({
        power: this.applySensitivity(power),
        spin,
        spinDir: 1,
        drift: clampDrift(dx / 260),
        source: dy > 140 ? 'swipe' : 'drag',
      });
    }
  }

  private handleMotion(e: DeviceMotionEvent): void {
    if (!this.enabled) return;
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null || a.y == null || a.z == null) return;
    // Tilt steering updates in EVERY mode.
    const tiltTarget = clampDrift(a.x / 6.5);
    this.deviceTilt = this.deviceTilt * 0.72 + tiltTarget * 0.28;
    if (Math.abs(this.deviceTilt) < 0.04) this.deviceTilt = 0;

    if (this.settings.controlMode === 'swipe' || this.settings.controlMode === 'circular') return;
    const mag = Math.hypot(a.x, a.y, a.z);
    const now = performance.now();
    const excess = mag - 9.8;

    // Track peak wrist-snap rotation during the spike window.
    const rr = e.rotationRate;
    if (rr) {
      const snap = Math.max(Math.abs(rr.alpha ?? 0), Math.abs(rr.beta ?? 0));
      if (excess > 4) this.motionRotPeak = Math.max(this.motionRotPeak, snap);
    }

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
      const spin = clamp01(this.motionRotPeak / INPUT.MOTION_ROT_MAX);
      const drift = clampDrift((a.x ?? 0) / 18);
      this.motionPeak = 0;
      this.motionRotPeak = 0;
      this.emit({ power: this.applySensitivity(0.25 + power * 0.75), spin, spinDir: 1, drift, source: 'motion' });
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
