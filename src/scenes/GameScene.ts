import Phaser from 'phaser';
import {
  GAME, PHYSICS, STACK, LEAN, DIFFICULTY, SCORING,
  loadBest, loadSettings, saveBest, lerp, type FlipSettings,
} from '../config';
import { InputController, type FlipInput } from '../input/InputController';
import { Pancake } from '../entities/Pancake';
import { ScoreSystem } from '../systems/ScoreSystem';
import { DifficultyManager } from '../systems/DifficultyManager';
import { loadTuning } from '../utils/tuning';
import { DebugOverlay } from '../utils/debugOverlay';
import { sfx } from '../utils/sound';
import { FONT } from '../utils/ui';

type Phase = 'ready' | 'flying' | 'resolving' | 'over';

export interface GameStartData {
  mode?: 'endless' | 'daily';
  seed?: number;
}

export class GameScene extends Phaser.Scene {
  private settings: FlipSettings = loadSettings();
  private inputCtl!: InputController;
  private score = new ScoreSystem();
  private difficulty = new DifficultyManager();
  private debugOverlay: DebugOverlay | null = null;

  private stack: Pancake[] = [];
  private current: Pancake | null = null;
  private pan!: Phaser.GameObjects.Image;
  private plateBody!: Phaser.Physics.Matter.Image;

  private phase: Phase = 'ready';
  private mode: 'endless' | 'daily' = 'endless';

  // Fixed-step simulation (Phase 1.1) — all gameplay timing is simTime.
  private acc = 0;
  private simTime = 0;
  private stepsThisFrame = 0;
  private flightStartedAt = 0;
  private bestComboSeen = 0;
  private lean = 0;
  private swayAmp = 0;
  private creakPlayed = false;

  private lastFlipInfo = '—';
  private lastLandingInfo = '—';
  private lastFlipInput: FlipInput | null = null;

  // HUD
  private scoreText!: Phaser.GameObjects.Text;
  private heightText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private windText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private meterBg!: Phaser.GameObjects.Graphics;
  private meterFill!: Phaser.GameObjects.Graphics;
  private steerGfx!: Phaser.GameObjects.Graphics;
  private leanGfx!: Phaser.GameObjects.Graphics;

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

  /** Landing target = top pancake's CURRENT (swayed) x. */
  get targetX(): number {
    if (this.stack.length === 0) return STACK.CENTER_X;
    return this.stack[this.stack.length - 1].x;
  }

  init(data: GameStartData): void {
    this.mode = data.mode ?? 'endless';
    this.difficulty.runSeed = data.seed ?? 0;
  }

  create(): void {
    this.settings = loadSettings();
    sfx.enabled = this.settings.sound;
    sfx.volume = this.settings.volume;
    this.score.reset();
    this.stack = [];
    this.phase = 'ready';
    this.bestComboSeen = 0;
    this.acc = 0;
    this.simTime = 0;
    this.lean = 0;
    this.swayAmp = 0;
    this.creakPlayed = false;
    this.lastFlipInfo = '—';
    this.lastLandingInfo = '—';

    this.cameras.main.setBackgroundColor('#FFF3D6');
    this.cameras.main.setBounds(0, -12000, GAME.WIDTH, GAME.HEIGHT + 12000);
    this.matter.world.setBounds(0, -12000, GAME.WIDTH, 12400, 64, false, false, false, false);
    const gravity = loadTuning().GRAVITY_Y;
    (this.matter.world as unknown as { gravity: { y: number } }).gravity.y = gravity;

    this.buildBackground();
    this.buildPlateAndPan();
    this.buildHUD();

    this.inputCtl = new InputController(this, this.settings, (input) => this.onFlip(input));
    this.inputCtl.enable();

    this.debugOverlay = new DebugOverlay();
    this.debugOverlay.onDeterminismTest = () => this.runDeterminismCheck();

    this.matter.world.on('collisionstart', this.onCollisionStart, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.inputCtl?.destroy();
      this.debugOverlay?.destroy();
      this.matter.world.off('collisionstart', this.onCollisionStart, this);
    });

    this.spawnPancake();
  }

  // ---------------------------------------------------------- world building
  private buildBackground(): void {
    const g = this.add.graphics().setDepth(-10);
    for (let i = 0; i < 30; i++) {
      const y = STACK.PLATE_Y - i * 420;
      g.fillStyle(i % 2 === 0 ? 0xfff3d6 : 0xffecc4, 1);
      g.fillRect(0, y - 420, GAME.WIDTH, 420);
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
    const table = this.add.graphics().setDepth(-2);
    table.fillStyle(0xc98d54, 1);
    table.fillRect(60, STACK.PLATE_Y + 14, GAME.WIDTH - 120, 26);
    table.fillRect(100, STACK.PLATE_Y + 40, 36, 220);
    table.fillRect(GAME.WIDTH - 136, STACK.PLATE_Y + 40, 36, 220);
  }

  private buildPlateAndPan(): void {
    const plate = this.add.image(STACK.CENTER_X, STACK.PLATE_Y, 'plate');
    plate.setDisplaySize(STACK.PLATE_WIDTH + 30, STACK.PLATE_HEIGHT + 14).setDepth(2);
    plate.y = STACK.PLATE_Y - 2;
    this.plateBody = this.matter.add.image(STACK.CENTER_X, STACK.PLATE_Y, 'plate', undefined, {
      isStatic: true,
      label: 'plate',
    });
    this.plateBody.setDisplaySize(STACK.PLATE_WIDTH, STACK.PLATE_HEIGHT);
    this.plateBody.setVisible(false);

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
    this.leanGfx = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.hintText = this.add
      .text(GAME.WIDTH / 2, GAME.HEIGHT - 150, 'Swipe: long = HIGH, fast flick = SPIN\nMatch them, land it flat!', {
        ...hud, fontSize: '27px', align: 'center',
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(100);
    this.tweens.add({ targets: this.hintText, alpha: 0.45, duration: 700, yoyo: true, repeat: -1 });

    this.meterBg = this.add.graphics().setScrollFactor(0).setDepth(99);
    this.meterBg.fillStyle(0x000000, 0.12);
    this.meterBg.fillRoundedRect(GAME.WIDTH / 2 - 170, GAME.HEIGHT - 84, 340, 26, 13);
    this.meterFill = this.add.graphics().setScrollFactor(0).setDepth(100);

    const back = this.add.text(GAME.WIDTH - 24, GAME.HEIGHT - 64, '✕', { ...hud, fontSize: '36px' })
      .setOrigin(1, 0.5).setScrollFactor(0).setDepth(101).setInteractive({ useHandCursor: true });
    back.on('pointerup', () => this.scene.start('Title'));
  }

  // ---------------------------------------------------------- main loop
  update(_time: number, delta: number): void {
    this.acc += Math.min(delta, 250);
    let steps = 0;
    while (this.acc >= PHYSICS.FIXED_STEP_MS && steps < PHYSICS.MAX_STEPS_PER_FRAME) {
      this.matter.world.step(PHYSICS.FIXED_STEP_MS);
      this.simTime += PHYSICS.FIXED_STEP_MS;
      this.fixedUpdate(this.simTime);
      this.acc -= PHYSICS.FIXED_STEP_MS;
      steps++;
    }
    if (steps === PHYSICS.MAX_STEPS_PER_FRAME) this.acc = 0;
    this.stepsThisFrame = steps;
    this.renderUpdate(delta);
  }

  /** Everything that touches physics or gameplay timing. Sim-time only. */
  private fixedUpdate(time: number): void {
    // Stack sway: the tower itself sways; the top moves most. Deterministic.
    if (this.stack.length > 0) {
      const heightTerm =
        this.stackHeight >= DIFFICULTY.SWAY_START ? this.stackHeight * LEAN.SWAY_PX_PER_HEIGHT : 0;
      this.swayAmp = Math.min(LEAN.SWAY_MAX_PX, Math.abs(this.lean) * LEAN.SWAY_PX_PER_LEAN + heightTerm);
      const phase = Math.sin((time / DIFFICULTY.SWAY_PERIOD_MS) * Math.PI * 2);
      const n = this.stack.length;
      this.stack.forEach((s, i) => {
        const k = Math.pow((i + 1) / n, 2);
        s.setPosition(s.baseX + phase * this.swayAmp * k, s.y);
      });
    } else {
      this.swayAmp = 0;
    }

    const p = this.current;
    if (!p) return;

    if (this.phase === 'ready') {
      p.setPosition(STACK.CENTER_X, this.panY());
      return;
    }
    if (this.phase !== 'flying') return;

    // Steering: rising half only — you commit on the way down.
    const v = p.body?.velocity ?? { x: 0, y: 0 };
    if (v.y < 0) {
      const tilt = this.inputCtl.getTilt();
      if (tilt !== 0) {
        const nvx = Phaser.Math.Clamp(
          v.x + tilt * loadTuning().STEER_ACCEL,
          -PHYSICS.STEER_MAX_VX,
          PHYSICS.STEER_MAX_VX,
        );
        p.setVelocity(nvx, v.y);
      }
    }

    // Wind (deterministic by height).
    const diff = this.difficulty.stateForHeight(this.stackHeight);
    if (diff.windForce !== 0 && p.body) {
      p.applyForce(new Phaser.Math.Vector2(diff.windForce, 0));
    }

    p.trackRotation();

    if (p.y > this.stackTopY + PHYSICS.FALL_MARGIN_Y || Math.abs(p.x - STACK.CENTER_X) > 430) {
      this.lose('It slid off the stack! 🥞💨');
      return;
    }
    if (time - this.flightStartedAt > 6000) {
      this.lose('It never came down…');
      return;
    }

    // Landing assist + decisive resolution (sim time).
    if (p.touchingStack && p.firstTouchAt >= 0) {
      const contactMs = time - p.firstTouchAt;
      if (contactMs < PHYSICS.ASSIST_WINDOW_MS) {
        p.setAngularVelocity(p.angularVel * loadTuning().ASSIST_ANGULAR_DAMP);
        const vv = p.body?.velocity ?? { x: 0, y: 0 };
        p.setVelocity(vv.x * PHYSICS.ASSIST_VX_DAMP, vv.y);
      }
      const nearStackLevel = Math.abs(p.y - (this.stackTopY - p.spec.thickness / 2)) < 80;
      const slowish = p.speed < PHYSICS.SETTLE_SPEED && Math.abs(p.angularVel) < PHYSICS.SETTLE_ANGULAR;
      if (nearStackLevel && contactMs > PHYSICS.SETTLE_MS && (slowish || contactMs > PHYSICS.CONTACT_RESOLVE_MAX_MS)) {
        this.resolveLanding();
      }
    }
  }

  /** Visual-only work: camera, meters, HUD, pan, debug feed. */
  private renderUpdate(delta: number): void {
    void delta;
    this.meterFill.clear();
    const charge = this.inputCtl?.getCharge() ?? 0;
    if (charge > 0.02) {
      this.meterFill.fillStyle(charge > 0.85 ? 0xe23e22 : 0xff8c42, 1);
      this.meterFill.fillRoundedRect(GAME.WIDTH / 2 - 170, GAME.HEIGHT - 84, 340 * charge, 26, 13);
    }

    const targetScroll = Math.min(0, this.stackTopY - 800);
    const cam = this.cameras.main;
    cam.scrollY += (targetScroll - cam.scrollY) * 0.055;
    const targetZoom = this.stackHeight > 15 ? 0.92 : 1;
    cam.setZoom(cam.zoom + (targetZoom - cam.zoom) * 0.03);

    if (this.current && this.phase === 'ready') {
      this.pan.setPosition(STACK.CENTER_X - 26, this.panY() + 26);
    }
    this.drawTiltIndicator(this.phase === 'flying' ? this.inputCtl.getTilt() : 0);
    this.drawLeanMeter();

    this.debugOverlay?.update({
      lastFlip: this.lastFlipInfo,
      lastLanding: this.lastLandingInfo,
      lean: this.lean,
      swayAmp: this.swayAmp,
      windForce: this.difficulty.stateForHeight(this.stackHeight).windForce,
      fps: Math.round(this.game.loop.actualFps),
      stepsThisFrame: this.stepsThisFrame,
      height: this.stackHeight,
      simTime: this.simTime,
    });
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

    pancake.setPosition(STACK.CENTER_X, y - 26);
    this.tweens.add({ targets: pancake, y, duration: 180, ease: 'Quad.easeOut' });
  }

  /** Launch math shared by real flips and the determinism check. */
  private computeLaunch(input: FlipInput): { vx: number; vy: number; angular: number; flipsAtRef: number } {
    const tuning = loadTuning();
    const vy = lerp(tuning.LAUNCH_VY_MIN, tuning.LAUNCH_VY_MAX, input.power);
    const vx = input.drift * PHYSICS.LAUNCH_VX_MAX;
    const refSteps = PHYSICS.CONTACT_STEPS_BASE + PHYSICS.CONTACT_STEPS_PER_VY * Math.abs(PHYSICS.REF_VY);
    const flipsAtRef = lerp(tuning.SPIN_FLIPS_MIN, tuning.SPIN_FLIPS_MAX, input.spin);
    const angular = ((Math.PI * 2 * flipsAtRef) / refSteps) * (input.spinDir ?? 1);
    return { vx, vy, angular, flipsAtRef };
  }

  private onFlip(input: FlipInput): void {
    if (this.phase !== 'ready' || !this.current) return;
    const p = this.current;
    this.phase = 'flying';
    this.flightStartedAt = this.simTime;
    this.lastFlipInput = input;
    this.hintText.setText('');
    this.inputCtl.markLaunch();

    const { vx, vy, angular, flipsAtRef } = this.computeLaunch(input);
    this.lastFlipInfo =
      `p=${input.power.toFixed(2)} s=${input.spin.toFixed(2)} flips=${flipsAtRef.toFixed(2)} vy=${vy.toFixed(1)} ω=${angular.toFixed(3)} (${input.source})`;
    p.launch(vx, vy, angular);
    sfx.whoosh(Math.abs(angular));

    this.tweens.add({
      targets: this.pan, y: this.pan.y + 90, angle: 14, alpha: 0, duration: 260, ease: 'Quad.easeIn',
    });
    this.showFloatingText(p.x, p.y - 60, 'FLIP!', '#E56F1F', 30);
  }

  private onCollisionStart(event: Phaser.Physics.Matter.Events.CollisionStartEvent): void {
    if (!this.current || this.phase !== 'flying') return;
    for (const pair of event.pairs) {
      const labels = [pair.bodyA.label, pair.bodyB.label];
      if (labels.includes('pancake') && (labels.includes('plate') || labels.includes('pancake'))) {
        const bodies = [pair.bodyA, pair.bodyB];
        if (bodies.some((bd) => bd === (this.current!.body as unknown))) {
          if (!this.current.touchingStack) {
            this.current.angleAtContact = this.current.rotation;
          }
          this.current.touchingStack = true;
          if (this.current.firstTouchAt < 0) this.current.firstTouchAt = this.simTime;
        }
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
      angleAtContactRad: p.angleAtContact,
      rotations: p.fullRotations,
    });
    this.lastLandingInfo =
      `dx=${dx.toFixed(0)} ang=${result.angleErrorDeg.toFixed(0)}° rot=${p.fullRotations} → ${result.reason}${result.perfect ? ' PERFECT' : result.sloppy ? ' SLOPPY' : ''}`;

    if (!result.success) {
      const reasons: Record<string, string> = {
        'face-down': "Face down! Syrup side's ruined.",
        'edge': 'Landed on its edge and rolled off!',
        'no-flip': 'No flip, no stack.',
        'too-far': 'Too far off centre — the stack topples!',
      };
      if (result.reason === 'too-far') this.toppleStack(p);
      this.lose(reasons[result.reason] ?? 'Missed!');
      return;
    }

    p.squash(result.perfect ? 0.34 : 0.22);
    sfx.plop(result.perfect, this.score.combo);
    p.settleIntoStack(result.perfect, STACK.CENTER_X);

    if (result.sloppy) {
      // Sloppy angle shoves the pancake further out — lean pressure.
      const dir = dx >= 0 ? 1 : -1;
      p.baseX += dir * LEAN.SLOPPY_EXTRA_PX;
      p.setPosition(p.baseX, p.y);
      this.showFloatingText(p.x, p.y - 70, 'Sloppy!', '#B7791F', 30);
      this.tweens.add({ targets: p, angle: '+=3', duration: 300, yoyo: true, repeat: 1, ease: 'Sine.easeInOut' });
    }

    this.stack.push(p);
    this.current = null;
    this.bestComboSeen = Math.max(this.bestComboSeen, this.score.combo);
    this.lean = p.baseX - STACK.CENTER_X;

    if (result.perfect) {
      this.cameras.main.shake(110, 0.0045);
      this.burstParticles(p.x, p.y);
      this.showFloatingText(p.x, p.y - 70, `PERFECT! +${result.points}`, '#E56F1F', 40);
      if (result.comboMultiplier > 1) {
        this.showFloatingText(p.x, p.y - 118, `COMBO ×${result.comboMultiplier.toFixed(1)}`, '#D94F04', 30);
      }
      // Reward: pull the top of the stack back toward centre (via baseX).
      for (let i = Math.max(0, this.stack.length - 3); i < this.stack.length; i++) {
        const s = this.stack[i];
        s.baseX += (STACK.CENTER_X - s.baseX) * 0.12;
      }
      this.lean = this.stack[this.stack.length - 1].baseX - STACK.CENTER_X;
    } else if (!result.sloppy) {
      this.showFloatingText(p.x, p.y - 70, `+${result.points}`, '#4A2C14', 34);
    }

    if (Math.abs(this.lean) > LEAN.WARN_PX && !this.creakPlayed) {
      this.creakPlayed = true;
      sfx.creak();
    }
    if (Math.abs(this.lean) <= LEAN.WARN_PX) this.creakPlayed = false;

    this.updateHUD();

    if (Math.abs(this.lean) > LEAN.MAX_PX) {
      this.toppleStack(p);
      this.lose('The tower leaned too far!');
      return;
    }

    this.time.delayedCall(340, () => this.spawnPancake());
  }

  private toppleStack(falling: Pancake): void {
    sfx.crash();
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

    const previousBest = loadBest();
    const isNewBest = this.score.total > previousBest;
    if (isNewBest) saveBest(this.score.total);

    this.time.delayedCall(950, () => {
      this.scene.start('GameOver', {
        score: this.score.total,
        height: this.stackHeight,
        bestCombo: this.bestComboSeen,
        perfects: this.score.perfects,
        reason,
        isNewBest,
        mode: this.mode,
      });
    });
  }

  // ---------------------------------------------------------- determinism check (dev)
  /** Launches a scripted flip under different render-delta patterns.
   *  Fixed stepping must make the outcome identical for every pattern. */
  runDeterminismCheck(): string {
    if (this.phase !== 'ready') return 'Run this from a fresh stack (phase=ready).';
    const input: FlipInput = { power: 0.62, spin: 0.5, spinDir: 1, drift: 0, source: 'keyboard' };
    const { vx, vy, angular } = this.computeLaunch(input);
    const patterns: number[][] = [[16.7], [8.3], [33.3, 8.3], [16.7, 16.7, 50]];
    const out: string[] = [];
    for (const pattern of patterns) {
      const spec = this.difficulty.specForHeight(0);
      const tp = new Pancake(this, STACK.CENTER_X, this.panY(), spec);
      tp.launch(vx, vy, angular);
      let acc = 0;
      let pi = 0;
      let sim = 0;
      while (sim < 3000) {
        acc += pattern[pi++ % pattern.length];
        while (acc >= PHYSICS.FIXED_STEP_MS && sim < 3000) {
          this.matter.world.step(PHYSICS.FIXED_STEP_MS);
          tp.trackRotation();
          acc -= PHYSICS.FIXED_STEP_MS;
          sim += PHYSICS.FIXED_STEP_MS;
        }
      }
      out.push(`pattern[${pattern.join(',')}] → x=${tp.x.toFixed(3)} y=${tp.y.toFixed(3)} rot=${tp.rotation.toFixed(4)} flips=${tp.fullRotations}`);
      tp.destroy();
    }
    const identical = out.every((l) => l.split('→ ')[1] === out[0].split('→ ')[1]);
    return (identical ? '✅ DETERMINISTIC — identical across delta patterns\n' : '❌ MISMATCH across patterns\n') + out.join('\n');
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
    g.fillTriangle(cx - half + 4, y, cx - half + 16, y - 6, cx - half + 16, y + 6);
    g.fillTriangle(cx + half - 4, y, cx + half - 16, y - 6, cx + half - 16, y + 6);
  }

  /** Lean meter: vertical bar on the right edge, green → orange → red. */
  private drawLeanMeter(): void {
    const g = this.leanGfx;
    g.clear();
    if (this.stackHeight === 0) return;
    const x = GAME.WIDTH - 30;
    const yTop = 300;
    const h = 220;
    g.fillStyle(0x000000, 0.1);
    g.fillRoundedRect(x - 7, yTop, 14, h, 7);
    const frac = Math.min(1, Math.abs(this.lean) / LEAN.MAX_PX);
    const color = Math.abs(this.lean) >= LEAN.WARN_PX ? 0xe23e22 : Math.abs(this.lean) >= 40 ? 0xff8c42 : 0x58b368;
    const flash = Math.abs(this.lean) >= LEAN.WARN_PX && Math.floor(this.time.now / 300) % 2 === 0;
    g.fillStyle(flash ? 0xff2222 : color, 1);
    const fh = Math.max(6, frac * h);
    g.fillRoundedRect(x - 7, yTop + h - fh, 14, fh, 7);
    // centre tick showing lean direction
    g.fillStyle(0x4a2c14, 0.8);
    g.fillRect(x - 12, yTop + h / 2 - 1, 24, 2);
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
