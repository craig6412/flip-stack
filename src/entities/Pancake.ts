import Phaser from 'phaser';
import { PHYSICS } from '../config';
import type { PancakeSpec } from '../systems/DifficultyManager';

export type PancakeState = 'in-pan' | 'flying' | 'settling' | 'stacked' | 'lost';

/**
 * Physics body (this Matter image, invisible) + a separate VISUAL sprite
 * that fakes 3D: golden top face when face-up, pale bottom when flipped,
 * thin when edge-on. Collisions stay honest (in-plane rectangle); only
 * the rendering pretends to be 3D. See PANCAKE_VISUAL_MODE in config —
 * a rotation sprite sheet can replace the texture swap later.
 */
export class Pancake extends Phaser.Physics.Matter.Image {
  spec: PancakeSpec;
  state: PancakeState = 'in-pan';
  totalRotation = 0;
  private lastAngle = 0;
  slowSince = -1;
  touchingStack = false;
  firstTouchAt = -1;
  angleAtContact = 0;
  baseX = 0;
  /** Extra visual wobble (rad) for sloppy-landing teeter; decays via tween. */
  teeter = 0;
  /** Squash/stretch pulse multipliers, read by syncVisual every frame. */
  pulseX = 1;
  pulseY = 1;
  visual!: Phaser.GameObjects.Image;
  skinTop = 'pancake_top';
  skinBottom = 'pancake_bottom';

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
    this.setVisible(false); // body is physics-only; `visual` renders
    this.visual = scene.add.image(x, y, this.skinTop).setDepth(10);
    this.syncVisual();
    this.setStatic(true);
    this.lastAngle = this.rotation;
    this.baseX = x;
  }

  /** Call every render frame. Face thickness swells when flat, thins edge-on. */
  syncVisual(): void {
    if (!this.visual || !this.visual.scene) return;
    const c = Math.cos(this.rotation);
    this.visual.setPosition(this.x, this.y);
    this.visual.setRotation(this.rotation + this.teeter);
    this.visual.setTexture(c >= 0 ? this.skinTop : this.skinBottom);
    const faceH = this.spec.thickness + 12 + 18 * Math.abs(c);
    this.visual.setDisplaySize((this.spec.radius * 2 + 14) * this.pulseX, faceH * this.pulseY);
  }

  get angularVel(): number {
    return (this.body as unknown as { angularVelocity?: number } | null)?.angularVelocity ?? 0;
  }

  launch(vx: number, vy: number, angularVelocity: number): void {
    this.state = 'flying';
    this.totalRotation = 0;
    this.lastAngle = this.rotation;
    this.teeter = 0;
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
    this.syncVisual();
  }

  squash(amount = 0.28): void {
    this.pulseY = 1 - amount;
    this.pulseX = 1 + amount * 0.6;
    this.scene.tweens.add({
      targets: this,
      pulseY: 1,
      pulseX: 1,
      duration: 170,
      ease: 'Quad.easeOut',
    });
  }

  destroy(fromScene?: boolean): void {
    this.visual?.destroy();
    super.destroy(fromScene);
  }
}
