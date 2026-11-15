import Phaser from 'phaser';
import { PHYSICS } from '../config';
import type { PancakeSpec } from '../systems/DifficultyManager';

export type PancakeState = 'in-pan' | 'flying' | 'settling' | 'stacked' | 'lost';

export class Pancake extends Phaser.Physics.Matter.Image {
  spec: PancakeSpec;
  state: PancakeState = 'in-pan';
  totalRotation = 0;
  private lastAngle = 0;
  slowSince = -1;
  touchingStack = false;
  firstTouchAt = -1;
  /** Rotation at the moment of first contact — landings are judged on this. */
  angleAtContact = 0;
  /** Settled centre x (before sway). The sway loop offsets from here. */
  baseX = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, spec: PancakeSpec) {
    super(scene.matter.world, x, y, 'pancake_top');
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
    this.setDisplaySize(w + 14, h + 12);
    this.setStatic(true);
    this.setDepth(10);
    this.lastAngle = this.rotation;
    this.baseX = x;
  }

  get angularVel(): number {
    return (this.body as unknown as { angularVelocity?: number } | null)?.angularVelocity ?? 0;
  }

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
    this.angleAtContact = 0;
  }

  trackRotation(): void {
    if (this.state !== 'flying' && this.state !== 'settling') return;
    let d = this.rotation - this.lastAngle;
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    this.totalRotation += d;
    this.lastAngle = this.rotation;
  }

  get fullRotations(): number {
    return Math.floor(Math.abs(this.totalRotation) / (Math.PI * 2) + 0.12);
  }

  get speed(): number {
    const v = this.body?.velocity ?? { x: 0, y: 0 };
    return Math.hypot(v.x, v.y);
  }

  get isSlow(): boolean {
    return this.speed < PHYSICS.SETTLE_SPEED && Math.abs(this.angularVel) < PHYSICS.SETTLE_ANGULAR;
  }

  settleIntoStack(straighten: boolean, stackCenterX: number): void {
    if (straighten) {
      const nx = this.x + (stackCenterX - this.x) * 0.45;
      this.setPosition(nx, this.y);
      this.setRotation(0);
    } else {
      const snapped = Math.round(this.rotation / (Math.PI * 2)) * Math.PI * 2;
      this.setRotation(snapped);
    }
    this.setVelocity(0, 0);
    this.setAngularVelocity(0);
    this.setStatic(true);
    this.state = 'stacked';
    this.baseX = this.x;
  }

  squash(amount = 0.28): void {
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
