import Phaser from 'phaser';
import {
  GAME, PHYSICS, STACK, DIFFICULTY, loadBest, loadSettings, saveBest,
  lerp, type FlipSettings,
} from '../config';
import { InputController, type FlipInput } from '../input/InputController';
import { Pancake } from '../entities/Pancake';
import { ScoreSystem } from '../systems/ScoreSystem';
import { DifficultyManager } from '../systems/DifficultyManager';
import { sfx } from '../utils/sound';
import { FONT } from '../utils/ui';

type Phase = 'ready' | 'flying' | 'resolving' | 'over';

export class GameScene extends Phaser.Scene {
  private settings: FlipSettings = loadSettings();
  private inputCtl!: InputController;
  private score = new ScoreSystem();
  private difficulty = new DifficultyManager();

  private stack: Pancake[] = [];
  private current: Pancake | null = null;
  private pan!: Phaser.GameObjects.Image;
  private plateBody!: Phaser.Physics.Matter.Image;

  private phase: Phase = 'ready';
  private flightStartedAt = 0;
  private bestComboSeen = 0;

  // HUD
  private scoreText!: Phaser.GameObjects.Text;
  private heightText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private windText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private meterBg!: Phaser.GameObjects.Graphics;
  private meterFill!: Phaser.GameObjects.Graphics;
  private steerGfx!: Phaser.GameObjects.Graphics;

  constructor() {
    super('Game');
  }

  get stackHeight(): number {
    return this.stack.length;
  }

  get stackTopY(): number {
    if (this.stack.length === 0) return STACK.PLATE_Y - STACK.PLATE_HEIGHT / 2;
    const top = this.stack[this.stack.length - 1];
    return top.y - top.spec.thickness / 2;
  }

  get targetX(): number {
    if (this.stack.length === 0) return STACK.CENTER_X;
    return this.stack[this.stack.length - 1].x;
  }

  create(): void {
    this.settings = loadSettings();
    sfx.enabled = this.settings.sound;
    this.score.reset();
    this.stack = [];
    this.phase = 'ready';
    this.bestComboSeen = 0;

    this.cameras.main.setBackgroundColor('#FFF3D6');
    this.cameras.main.setBounds(0, -12000, GAME.WIDTH, GAME.HEIGHT + 12000);
    this.matter.world.setBounds(0, -12000, GAME.WIDTH, 12400, 64, false, false, false, false);
    // Fixed-step hint for the Matter world (deterministic stepping).
    (this.matter.world as unknown as { fixedDelta?: number }).fixedDelta = PHYSICS.FIXED_STEP_MS;

    this.buildBackground();
    this.buildPlateAndPan();
    this.buildHUD();

    this.inputCtl = new InputController(this, this.settings, (input) => this.onFlip(input));
    this.inputCtl.enable();

    this.matter.world.on('collisionstart', this.onCollisionStart, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.inputCtl?.destroy();
      this.matter.world.off('collisionstart', this.onCollisionStart, this);
    });

    this.spawnPancake();
  }

  // ---------------------------------------------------------- world building
  private buildBackground(): void {
    // Soft vertical bands + altitude markers (world space, scrolls with camera)
    const g = this.add.graphics().setDepth(-10);
    for (let i = 0; i < 30; i++) {
      const y = STACK.PLATE_Y - i * 420;
      g.fillStyle(i % 2 === 0 ? 0xfff3d6 : 0xffecc4, 1);
      g.fillRect(0, y - 420, GAME.WIDTH, 420);
      // cloud blobs
      g.fillStyle(0xffffff, 0.75);
      const cx = ((i * 197) % 620) + 60;
      g.fillEllipse(cx, y - 300, 150, 44);
      g.fillEllipse(cx + 50, y - 318, 100, 38);
    }
    for (let h = 5; h <= 60; h += 5) {
      const y = STACK.PLATE_Y - h * 24;
      this.add
        .text(24, y, `— ${h} —`, { fontFamily: FONT, fontSize: '22px', color: '#D98E1E' })
        .setDepth(-5);
    }
    // Table under the plate
    const table = this.add.graphics().setDepth(-2);
    table.fillStyle(0xc98d54, 1);
    table.fillRect(60, STACK.PLATE_Y + 14, GAME.WIDTH - 120, 26);
    table.fillRect(100, STACK.PLATE_Y + 40, 36, 220);
    table.fillRect(GAME.WIDTH - 136, STACK.PLATE_Y + 40, 36, 220);
  }

  private buildPlateAndPan(): void {
    const plate = this.add.image(STACK.CENTER_X, STACK.PLATE_Y, 'plate');
    plate.setDisplaySize(STACK.PLATE_WIDTH + 30, STACK.PLATE_HEIGHT + 14).setDepth(2);
    this.plateBody = this.matter.add.image(STACK.CENTER_X, STACK.PLATE_Y, 'plate', undefined, {
      isStatic: true,
      label: 'plate',
    });
    this.plateBody.setDisplaySize(STACK.PLATE_WIDTH, STACK.PLATE_HEIGHT);
    this.plateBody.setVisible(false);
    // Visible plate sits on the invisible physics plate
    plate.y = STACK.PLATE_Y - 2;
    void plate;

    this.pan = this.add.image(STACK.CENTER_X - 26, 0, 'pan').setDepth(5).setScale(0.92);
  }

  private buildHUD(): void {
    const hud = { fontFamily: FONT, color: '#4A2C14' };
    this.scoreText = this.add.text(24, 18, 'Score: 0', { ...hud, fontSize: '34px', fontStyle: 'bold' }).setScrollFactor(0).setDepth(100);
    this.heightText = this.add.text(24, 60, '🥞 × 0', { ...hud, fontSize: '28px' }).setScrollFactor(0).setDepth(100);
    this.comboText = this.add.text(GAME.WIDTH - 24, 18, '', { ...hud, fontSize: '30px', fontStyle: 'bold', color: '#E56F1F' })
      .setOrigin(1, 0).setScrollFactor(0).setDepth(100);
    this.windText = this.add.text(GAME.WIDTH - 24, 58, '', { ...hud, fontSize: '24px' })
      .setOrigin(1, 0).setScrollFactor(0).setDepth(100);
    this.steerGfx = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.hintText = this.add
      .text(GAME.WIDTH / 2, GAME.HEIGHT - 150, 'Swipe up to FLIP!\nThen tilt your phone ◀ ▶ to steer it in', {
        ...hud, fontSize: '27px', align: 'center',
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(100);
    this.tweens.add({ targets: this.hintText, alpha: 0.45, duration: 700, yoyo: true, repeat: -1 });

    this.meterBg = this.add.graphics().setScrollFactor(0).setDepth(99);
    this.meterBg.fillStyle(0x000000, 0.12);
    this.meterBg.fillRoundedRect(GAME.WIDTH / 2 - 170, GAME.HEIGHT - 84, 340, 26, 13);
    this.meterFill = this.add.graphics().setScrollFactor(0).setDepth(100);

    // Pause-to-title button
    const back = this.add.text(GAME.WIDTH - 24, GAME.HEIGHT - 64, '✕', { ...hud, fontSize: '36px' })
      .setOrigin(1, 0.5).setScrollFactor(0).setDepth(101).setInteractive({ useHandCursor: true });
    back.on('pointerup', () => this.scene.start('Title'));
  }

  // ---------------------------------------------------------- gameplay
  private panY(): number {
    return this.stackTopY - STACK.PAN_GAP_ABOVE_STACK;
  }

  private spawnPancake(): void {
    const diff = this.difficulty.stateForHeight(this.stackHeight);
    const y = this.panY();
    this.pan.setPosition(STACK.CENTER_X - 26, y + 26);
    this.pan.setAlpha(1).setAngle(0);

    const pancake = new Pancake(this, STACK.CENTER_X, y, diff.spec);
    this.current = pancake;
    this.phase = 'ready';
    sfx.sizzle();
    this.updateHUD(diff.windDirection, diff.windForce);

    // Little drop-in
    pancake.setPosition(STACK.CENTER_X, y - 26);
    this.tweens.add({ targets: pancake, y, duration: 180, ease: 'Quad.easeOut' });
  }

  private onFlip(input: FlipInput): void {
    if (this.phase !== 'ready' || !this.current) return;
    const p = this.current;
    this.phase = 'flying';
    this.flightStartedAt = this.time.now;
    this.hintText.setText('');

    const vy = lerp(PHYSICS.LAUNCH_VY_MIN, PHYSICS.LAUNCH_VY_MAX, input.power);
    const vx = input.drift * PHYSICS.LAUNCH_VX_MAX;
    // Spin: flips banded by power (circular input = continuous flips), with
    // angular velocity derived from predicted time-to-contact so rotation
    // completes right at the stack. Calibrated against a matter-js sim —
    // a fixed spin range made landing angles essentially random.
    const flips =
      input.source === 'circular'
        ? Phaser.Math.Clamp(0.8 + input.spin * 2.2, 0.8, 3.2)
        : input.power < PHYSICS.FLIP_BAND_1_MAX_POWER
          ? 1
          : input.power < PHYSICS.FLIP_BAND_2_MAX_POWER
            ? 2
            : 3;
    const contactSteps = PHYSICS.CONTACT_STEPS_BASE + PHYSICS.CONTACT_STEPS_PER_VY * Math.abs(vy);
    const spin = (Math.PI * 2 * flips) / contactSteps / PHYSICS.SPIN_DECAY_COMP;
    p.launch(vx, vy, spin);

    // Pan flicks down and fades — the pancake is on its own now.
    this.tweens.add({
      targets: this.pan, y: this.pan.y + 90, angle: 14, alpha: 0, duration: 260, ease: 'Quad.easeIn',
    });
    this.showFloatingText(p.x, p.y - 60, input.source === 'motion' ? 'FLIP! 📱' : 'FLIP!', '#E56F1F', 30);
  }

  private onCollisionStart(event: Phaser.Physics.Matter.Events.CollisionStartEvent): void {
    if (!this.current || this.phase !== 'flying') return;
    for (const pair of event.pairs) {
      const a = pair.bodyA.label;
      const b = pair.bodyB.label;
      const labels = [a, b];
      if (labels.includes('pancake') && (labels.includes('plate') || labels.includes('pancake'))) {
        // Only count collisions involving the flying pancake itself.
        const bodies = [pair.bodyA, pair.bodyB];
        if (bodies.some((bd) => bd === (this.current!.body as unknown))) {
          this.current.touchingStack = true;
          if (this.current.firstTouchAt < 0) this.current.firstTouchAt = this.time.now;
        }
      }
    }
  }

  update(time: number, delta: number): void {
    void delta;
    // Power meter
    this.meterFill.clear();
    const charge = this.inputCtl?.getCharge() ?? 0;
    if (charge > 0.02) {
      this.meterFill.fillStyle(charge > 0.85 ? 0xe23e22 : 0xff8c42, 1);
      this.meterFill.fillRoundedRect(GAME.WIDTH / 2 - 170, GAME.HEIGHT - 84, 340 * charge, 26, 13);
    }

    // Camera: smooth pan up, keeping stack top + flight headroom in view.
    const targetScroll = Math.min(0, this.stackTopY - 800);
    const cam = this.cameras.main;
    cam.scrollY += (targetScroll - cam.scrollY) * 0.055;

    const p = this.current;
    if (!p) return;

    if (this.phase === 'ready') {
      // Keep the pancake resting in the pan (pan follows camera-driven stack top).
      p.setPosition(STACK.CENTER_X, this.panY());
      this.pan.setPosition(STACK.CENTER_X - 26, this.panY() + 26);
      return;
    }

    if (this.phase !== 'flying') return;

    // Horizontal steering: tilt phone / hold ←→ or A/D / hold finger and
    // drag — nudges horizontal velocity while airborne. This is the
    // player's mid-flight correction, so it applies before wind/sway.
    const tilt = this.inputCtl.getTilt();
    this.drawTiltIndicator(tilt);
    if (tilt !== 0 && p.body) {
      const v = p.body.velocity ?? { x: 0, y: 0 };
      const nvx = Phaser.Math.Clamp(v.x + tilt * PHYSICS.STEER_ACCEL, -PHYSICS.STEER_MAX_VX, PHYSICS.STEER_MAX_VX);
      p.setVelocity(nvx, v.y);
    }

    // Difficulty forces during flight — pure functions of height + time (deterministic).
    const diff = this.difficulty.stateForHeight(this.stackHeight);
    const sway = this.difficulty.swayAt(time, this.stackHeight);
    const fx = diff.windForce + sway;
    if (fx !== 0 && p.body) {
      p.applyForce(new Phaser.Math.Vector2(fx, 0));
    }
    if (this.stackHeight >= DIFFICULTY.WIND_START) this.updateHUD(diff.windDirection, diff.windForce);

    p.trackRotation();

    // Fall-off detection
    if (p.y > this.stackTopY + PHYSICS.FALL_MARGIN_Y || Math.abs(p.x - STACK.CENTER_X) > 430) {
      this.lose('It slid off the stack! 🥞💨');
      return;
    }
    if (time - this.flightStartedAt > 6000) {
      this.lose('It never came down…');
      return;
    }

    // Landing: assist + decisive resolution. A pancake in contact gets its
    // spin/slide damped hard for a short window (kills the "spinning wheel"
    // slide), then the landing resolves as soon as it's slowish — or after
    // a hard cap — so the game can never hang on a wobbling pancake.
    if (p.touchingStack && p.firstTouchAt >= 0) {
      const contactMs = time - p.firstTouchAt;
      if (contactMs < PHYSICS.ASSIST_WINDOW_MS) {
        p.setAngularVelocity(p.angularVel * PHYSICS.ASSIST_ANGULAR_DAMP);
        const v = p.body?.velocity ?? { x: 0, y: 0 };
        p.setVelocity(v.x * PHYSICS.ASSIST_VX_DAMP, v.y);
      }
      const nearStackLevel = Math.abs(p.y - (this.stackTopY - p.spec.thickness / 2)) < 80;
      const slowish = p.speed < PHYSICS.SETTLE_SPEED && Math.abs(p.angularVel) < PHYSICS.SETTLE_ANGULAR;
      if (nearStackLevel && contactMs > PHYSICS.SETTLE_MS && (slowish || contactMs > PHYSICS.CONTACT_RESOLVE_MAX_MS)) {
        this.resolveLanding();
      }
    }
  }

  private resolveLanding(): void {
    const p = this.current;
    if (!p || this.phase !== 'flying') return;
    this.phase = 'resolving';

    const dx = p.x - this.targetX;
    const result = this.score.evaluate({
      dx,
      angleRad: p.rotation,
      rotations: p.fullRotations,
    });

    if (!result.success) {
      const reasons: Record<string, string> = {
        'face-down': 'Landed face-down! It slides right off…',
        'no-flip': 'No full flip — it just plopped back.',
        'too-far': 'Too far off centre — the stack topples!',
      };
      if (result.reason === 'too-far') this.toppleStack(p);
      this.lose(reasons[result.reason] ?? 'Missed!');
      return;
    }

    // Success juice
    p.squash(result.perfect ? 0.34 : 0.22);
    sfx.plop(result.perfect);
    p.settleIntoStack(result.perfect, STACK.CENTER_X);
    this.stack.push(p);
    this.current = null;
    this.bestComboSeen = Math.max(this.bestComboSeen, this.score.combo);

    if (result.perfect) {
      this.cameras.main.shake(110, 0.0045);
      this.burstParticles(p.x, p.y);
      this.showFloatingText(p.x, p.y - 70, `PERFECT! +${result.points}`, '#E56F1F', 40);
      if (result.comboMultiplier > 1) {
        this.showFloatingText(p.x, p.y - 118, `COMBO ×${result.comboMultiplier.toFixed(1)}`, '#D94F04', 30);
      }
      // Reward: settle the whole stack — re-centre the top few slightly.
      this.settleStackVisual();
    } else {
      this.showFloatingText(p.x, p.y - 70, `+${result.points}`, '#4A2C14', 34);
    }

    this.updateHUD();
    this.time.delayedCall(340, () => this.spawnPancake());
  }

  private settleStackVisual(): void {
    // Nudge the top 3 stacked pancakes 12% toward centre — visible "settling".
    for (let i = Math.max(0, this.stack.length - 3); i < this.stack.length; i++) {
      const s = this.stack[i];
      const nx = s.x + (STACK.CENTER_X - s.x) * 0.12;
      this.tweens.add({ targets: s, x: nx, duration: 160, ease: 'Quad.easeOut' });
      // Keep body in sync after tween (static body position follows game object on next sync;
      // set explicitly to be safe once tween completes.)
      this.time.delayedCall(170, () => s.setPosition(nx, s.y));
    }
  }

  private toppleStack(falling: Pancake): void {
    sfx.thud();
    this.cameras.main.shake(220, 0.008);
    const topN = this.stack.slice(-3);
    for (const s of topN) {
      s.setStatic(false);
      s.setVelocity(falling.x >= STACK.CENTER_X ? 1.6 : -1.6, -1.2);
      s.setAngularVelocity(0.06);
    }
  }

  private lose(reason: string): void {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.score.onMiss();
    sfx.thud();
    this.inputCtl?.disable();

    const best = loadBest();
    if (this.score.total > best) saveBest(this.score.total);

    this.time.delayedCall(950, () => {
      this.scene.start('GameOver', {
        score: this.score.total,
        height: this.stackHeight,
        bestCombo: this.bestComboSeen,
        reason,
      });
    });
  }

  // ---------------------------------------------------------- helpers
  private updateHUD(windDir?: -1 | 0 | 1, windForce?: number): void {
    this.scoreText.setText(`Score: ${this.score.total}`);
    this.heightText.setText(`🥞 × ${this.stackHeight}`);
    this.comboText.setText(this.score.combo >= 2 ? `🔥 COMBO ×${this.score.multiplier.toFixed(1)}` : '');
    const dir = windDir ?? this.difficulty.stateForHeight(this.stackHeight).windDirection;
    const force = windForce ?? this.difficulty.stateForHeight(this.stackHeight).windForce;
    this.windText.setText(force !== 0 ? `Wind ${dir > 0 ? '→' : '←'}` : '');
  }

  /** Tilt meter: pill at top-centre, dot slides with current steering input. */
  private drawTiltIndicator(tilt: number): void {
    const g = this.steerGfx;
    g.clear();
    if (this.phase !== 'flying') return;
    const cx = GAME.WIDTH / 2;
    const y = 34;
    const half = 90;
    g.fillStyle(0x000000, 0.12);
    g.fillRoundedRect(cx - half, y - 11, half * 2, 22, 11);
    g.fillStyle(0xffffff, 0.85);
    g.fillCircle(cx, y, 4);
    g.fillStyle(Math.abs(tilt) > 0.05 ? 0xe56f1f : 0x999999, 1);
    g.fillCircle(cx + tilt * (half - 14), y, 9);
    g.fillStyle(0x4a2c14, 0.7);
    // ◀ ▶ end caps as triangles
    g.fillTriangle(cx - half + 4, y, cx - half + 16, y - 6, cx - half + 16, y + 6);
    g.fillTriangle(cx + half - 4, y, cx + half - 16, y - 6, cx + half - 16, y + 6);
  }

  private showFloatingText(x: number, y: number, text: string, color: string, size: number): void {
    const t = this.add
      .text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: 'bold', stroke: '#FFFFFF', strokeThickness: 5 })
      .setOrigin(0.5)
      .setDepth(50);
    this.tweens.add({
      targets: t, y: y - 72, alpha: 0, duration: 950, ease: 'Quad.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  private burstParticles(x: number, y: number): void {
    const emitter = this.add.particles(x, y, 'spark', {
      speed: { min: 90, max: 260 },
      angle: { min: 0, max: 360 },
      lifespan: 520,
      quantity: 16,
      scale: { start: 1, end: 0 },
      emitting: false,
    });
    emitter.setDepth(60);
    emitter.explode(16);
    this.time.delayedCall(700, () => emitter.destroy());
  }
}
