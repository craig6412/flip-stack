import Phaser from 'phaser';
import { PHYSICS } from '../config';
import type { PancakeSpec } from '../systems/DifficultyManager';

export type PancakeState = 'in-pan' | 'flying' | 'settling' | 'stacked' | 'lost';

/**
 * A pancake is a Matter rectangle with rounded corners (reads as a disc
 * from the side) + a slightly larger visual ellipse for the cartoon top.
 * The GAMEOBJECT is the Matter image itself; we draw the texture in Boot.
 */
export class Pancake extends Phaser.Physics.Matter.Image {
  spec: PancakeSpec;
  state: PancakeState = 'in-pan';
  /** Cumulative rotation (rad, unwrapped) tracked while flying. */
  totalRotation = 0;
  private lastAngle = 0;
  /** Time (scene time) the body has been slow + in contact. */
  slowSince = -1;
  touchingStack = false;
  /** Scene time of first contact with the stack/plate this flight (-1 = none). */
  firstTouchAt = -1;

  get angularVel(): number {
    return (this.body as unknown as { angularVelocity?: number } | null)?.angularVelocity ?? 0;
  }

  constructor(scene: Phaser.Scene, x: number, y: number, spec: PancakeSpec) {
    super(scene.matter.world, x, y, 'pancake');
    this.spec = spec;
    scene.add.existing(this);

    const w = spec.radius * 2;
    const h = spec.thickness;
    this.setRectangle(w, h, {
      density: PHYSICS.PANCAKE_DENSITY,
      friction: PHYSICS.PANCAKE_FRICTION,
      frictionAir: PHYSICS.PANCAKE_FRICTION_AIR,
      restitution: PHYSICS.PANCAKE_RESTITUTION,
      chamfer: { radius: Math.min(PHYSICS.PANCAKE_CHAMFER, h / 2 - 1) },
      label: 'pancake',
    });
    this.setDisplaySize(w + 14, h + 12); // visual overhang = fluffy edge
    this.setStatic(true); // rests in pan until flipped
    this.setDepth(10);
    this.lastAngle = this.rotation;
  }

  /** Launch with deterministic velocity + spin. Called exactly once per flip. */
  launch(vx: number, vy: number, angularVelocity: number): void {
    this.state = 'flying';
    this.totalRotation = 0;
    this.lastAngle = this.rotation;
    this.setStatic(false);
    this.setVelocity(vx, vy);
    this.setAngularVelocity(angularVelocity);
    this.slowSince = -1;
    this.touchingStack = false;
    this.firstTouchAt = -1;
  }

  /** Call every fixed update while flying to unwrap rotation. */
  trackRotation(): void {
    if (this.state !== 'flying' && this.state !== 'settling') return;
    let d = this.rotation - this.lastAngle;
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    this.totalRotation += d;
    this.lastAngle = this.rotation;
  }

  get fullRotations(): number {
    // +0.12 tolerance: landing assist damps the last of the spin on contact,
    // so a flip that completes ~88%+ and lands flat still counts as a flip.
    return Math.floor(Math.abs(this.totalRotation) / (Math.PI * 2) + 0.12);
  }

  get speed(): number {
    const v = this.body?.velocity ?? { x: 0, y: 0 };
    return Math.hypot(v.x, v.y);
  }

  get isSlow(): boolean {
    const av = (this.body as unknown as { angularVelocity?: number } | null)?.angularVelocity ?? 0;
    return this.speed < PHYSICS.SETTLE_SPEED && Math.abs(av) < PHYSICS.SETTLE_ANGULAR;
  }

  /** Freeze into the stack. Perfect landings pass straighten=true. */
  settleIntoStack(straighten: boolean, stackCenterX: number): void {
    if (straighten) {
      // Reward: nudge toward centre + flatten. Small and visible, never teleporty.
      const nx = this.x + (stackCenterX - this.x) * 0.45;
      this.setPosition(nx, this.y);
      this.setRotation(0);
    } else {
      // Snap angle to nearest flat so the stack stays readable/stable.
      const snapped = Math.round(this.rotation / (Math.PI * 2)) * Math.PI * 2;
      this.setRotation(snapped);
    }
    this.setVelocity(0, 0);
    this.setAngularVelocity(0);
    this.setStatic(true);
    this.state = 'stacked';
  }

  /** Squash & stretch juice — visual only, body untouched. */
  squash(amount = 0.28): void {
    const baseY = (this.spec.thickness + 12) / (this.spec.thickness + 12);
    void baseY;
    this.scene.tweens.add({
      targets: this,
      scaleY: this.scaleY * (1 - amount),
      scaleX: this.scaleX * (1 + amount * 0.6),
      duration: 90,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }
}
