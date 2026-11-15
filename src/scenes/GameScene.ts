import Phaser from 'phaser';
import {
  GAME, PHYSICS, STACK, LEAN, DIFFICULTY, SCORING, STORAGE_KEYS,
  loadBest, loadSettings, saveBest, lerp, type FlipSettings,
} from '../config';
import { loadProfile, saveProfile, addSyrup } from '../systems/ProfileStore';
import { shopItem } from '../systems/shopData';
import { ensureMissions, observeLanding, observeRunEnd, missionSummaryLines } from '../systems/Missions';
import { todaySeed, dailyNumber } from './TitleScene';
import { track } from '../utils/analytics';
import { getPlatform } from '../platform/Platform';
import { makeButton } from '../utils/ui';
import { InputController, type FlipInput } from '../input/InputController';
import { Pancake } from '../entities/Pancake';
import { ScoreSystem } from '../systems/ScoreSystem';
import { DifficultyManager } from '../systems/DifficultyManager';
import { loadTuning } from '../utils/tuning';
import { DebugOverlay } from '../utils/debugOverlay';
import { haptics } from '../utils/haptics';
import { sfx } from '../utils/sound';
import { FONT } from '../utils/ui';

type Phase = 'ready' | 'flying' | 'resolving' | 'over' | 'replay';

interface ReplayFrame {
  x: number;
  y: number;
  rot: number;
  topX: number;
}

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

  // Phase 2 juice / replay state
  private trail: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private hitStopMs = 0;
  private replayFrames: ReplayFrame[] = [];
  private replayIndex = 0;
  private replayLabel: Phaser.GameObjects.Text | null = null;
  private pendingGameOver: Record<string, unknown> | null = null;
  private decorations: { obj: Phaser.GameObjects.Image; pancake: Pancake }[] = [];

  // Phase 3 retention state
  private runSyrup = 0;
  private completedMissions: string[] = [];
  private runStartedAt = 0;
  private tutorialActive = false;
  private tutorialStep = 0;
  private tutorialText: Phaser.GameObjects.Text | null = null;
  private ghostHand: Phaser.GameObjects.Text | null = null;
  private arcGfx: Phaser.GameObjects.Graphics | null = null;
  private plateImage: Phaser.GameObjects.Image | null = null;

  // Phase 4 platform state
  private continueUsed = false;
  private continueOverlay: Phaser.GameObjects.Container | null = null;
  private onVisibility = (): void => {
    if (document.hidden) this.scene.pause();
    else if (this.scene.isPaused()) this.scene.resume();
  };

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

    const bgItem = shopItem(loadProfile().equipped.bg);
    this.cameras.main.setBackgroundColor(bgItem?.bgColors?.sky ?? '#FFF3D6');
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

    // Motion trail for the flying pancake (visual only).
    this.trail = this.add.particles(0, 0, 'spark', {
      speed: 8,
      lifespan: 300,
      quantity: 1,
      frequency: 28,
      scale: { start: 0.55, end: 0 },
      alpha: { start: 0.32, end: 0 },
      tint: 0xf2b544,
      emitting: false,
    });
    this.trail.setDepth(9);
    this.replayFrames = [];
    this.decorations = [];
    this.hitStopMs = 0;
    this.pendingGameOver = null;
    this.runSyrup = 0;
    this.completedMissions = [];
    this.runStartedAt = Date.now();
    ensureMissions(todaySeed());

    // Tutorial: first run only (endless), skippable via Settings replay flag.
    this.tutorialActive =
      this.mode === 'endless' && !localStorage.getItem(STORAGE_KEYS.TUTORIAL_DONE);
    this.tutorialStep = 0;
    if (this.tutorialActive) this.setupTutorial();

    track('run_start', { mode: this.mode, controlMode: this.settings.controlMode });

    this.matter.world.on('collisionstart', this.onCollisionStart, this);
    this.continueUsed = false;
    document.addEventListener('visibilitychange', this.onVisibility);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.inputCtl?.destroy();
      this.debugOverlay?.destroy();
      document.removeEventListener('visibilitychange', this.onVisibility);
      this.matter.world.off('collisionstart', this.onCollisionStart, this);
    });

    this.spawnPancake();
    getPlatform().gameplayStart();
  }

  // ---------------------------------------------------------- world building
  private buildBackground(): void {
    const bgItem = shopItem(loadProfile().equipped.bg);
    const bandA = bgItem?.bgColors?.bandA ?? 0xfff3d6;
    const bandB = bgItem?.bgColors?.bandB ?? 0xffecc4;
    const g = this.add.graphics().setDepth(-10);
    for (let i = 0; i < 30; i++) {
      const y = STACK.PLATE_Y - i * 420;
      g.fillStyle(i % 2 === 0 ? bandA : bandB, 1);
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
    const profile = loadProfile();
    const plate = this.add.image(STACK.CENTER_X, STACK.PLATE_Y, 'plate');
    plate.setDisplaySize(STACK.PLATE_WIDTH + 30, STACK.PLATE_HEIGHT + 14).setDepth(2);
    plate.y = STACK.PLATE_Y - 2;
    const plateItem = shopItem(profile.equipped.plate);
    if (plateItem?.tint) plate.setTint(plateItem.tint);
    this.plateImage = plate;
    this.plateBody = this.matter.add.image(STACK.CENTER_X, STACK.PLATE_Y, 'plate', undefined, {
      isStatic: true,
      label: 'plate',
    });
    this.plateBody.setDisplaySize(STACK.PLATE_WIDTH, STACK.PLATE_HEIGHT);
    this.plateBody.setVisible(false);

    this.pan = this.add.image(STACK.CENTER_X - 26, 0, 'pan').setDepth(5).setScale(0.92);
    const panItem = shopItem(profile.equipped.pan);
    if (panItem?.tint) this.pan.setTint(panItem.tint);
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
    // Hit-stop (perfect landings): freeze the sim briefly, keep rendering.
    if (this.hitStopMs > 0) {
      this.hitStopMs -= delta;
      this.renderUpdate(delta);
      return;
    }
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

    // Replay recording: flying pancake + top-of-stack x, every fixed step.
    this.replayFrames.push({
      x: p.x,
      y: p.y,
      rot: p.rotation,
      topX: this.stack.length ? this.stack[this.stack.length - 1].x : STACK.CENTER_X,
    });
    if (this.replayFrames.length > 200) this.replayFrames.shift();

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
    // 2.5D visuals follow their bodies.
    if (this.phase !== 'replay') {
      this.current?.syncVisual();
      for (const s of this.stack) s.syncVisual();
      for (const d of this.decorations) {
        d.obj.setPosition(d.pancake.x, d.pancake.y - d.pancake.spec.thickness / 2 - 8);
      }
    } else {
      this.advanceReplay(delta);
    }
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
    this.drawTutorialArc();

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
    const skin = shopItem(loadProfile().equipped.pancake);
    if (skin?.textureTop && skin?.textureBottom) {
      pancake.skinTop = skin.textureTop;
      pancake.skinBottom = skin.textureBottom;
      pancake.syncVisual();
    }
    this.current = pancake;
    this.phase = 'ready';
    sfx.sizzle();
    this.updateHUD(diff.windDirection, diff.windForce);
    pancake.squash(0.16);
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
    this.replayFrames = [];
    if (this.trail) {
      this.trail.startFollow(p.visual);
      this.trail.start();
    }

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
    this.trail?.stop();

    const dx = p.x - this.targetX;
    const result = this.score.evaluate({
      dx,
      angleAtContactRad: p.angleAtContact,
      rotations: p.fullRotations,
    });
    this.lastLandingInfo =
      `dx=${dx.toFixed(0)} ang=${result.angleErrorDeg.toFixed(0)}° rot=${p.fullRotations} → ${result.reason}${result.perfect ? ' PERFECT' : result.sloppy ? ' SLOPPY' : ''}`;

    if (!result.success) {
      if (this.tutorialActive) {
        this.tutorialRetry();
        return;
      }
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
    if (result.perfect) haptics.perfect(); else haptics.land();
    p.settleIntoStack(result.perfect, STACK.CENTER_X);

    if (result.sloppy) {
      // Sloppy angle shoves the pancake further out — lean pressure.
      const dir = dx >= 0 ? 1 : -1;
      p.baseX += dir * LEAN.SLOPPY_EXTRA_PX;
      p.setPosition(p.baseX, p.y);
      this.showFloatingText(p.x, p.y - 70, 'Sloppy!', '#B7791F', 30);
      // Teeter: visual wobble that decays (body stays put).
      p.teeter = 0.09;
      this.tweens.add({ targets: p, teeter: 0, duration: 320, ease: 'Sine.easeOut' });
    }

    this.stack.push(p);
    this.current = null;
    this.bestComboSeen = Math.max(this.bestComboSeen, this.score.combo);
    this.lean = p.baseX - STACK.CENTER_X;

    // Syrup + missions + tutorial progression.
    this.runSyrup += result.perfect ? 3 : 1;
    const windNow = this.difficulty.stateForHeight(this.stackHeight).windForce !== 0;
    const doneNow = observeLanding({
      perfect: result.perfect,
      rotations: p.fullRotations,
      windActive: windNow,
      height: this.stackHeight,
    });
    for (const id of doneNow) {
      if (!this.completedMissions.includes(id)) {
        this.completedMissions.push(id);
        this.showFloatingText(p.x, p.y - 165, '🎯 Mission complete!', '#58B368', 30);
      }
    }
    if (this.tutorialActive) {
      this.tutorialStep++;
      this.updateTutorialStep();
    }

    if (result.perfect) {
      this.hitStopMs = 60;
      this.cameras.main.shake(110, 0.0045);
      this.burstParticles(p.x, p.y, 16 + Math.min(24, this.score.combo * 4));
      this.showFloatingText(p.x, p.y - 70, `PERFECT! +${result.points}`, '#E56F1F', 40);
      if (result.comboMultiplier > 1) {
        this.showFloatingText(p.x, p.y - 118, `COMBO ×${result.comboMultiplier.toFixed(1)}`, '#D94F04', 30);
      }
      if (this.score.combo === 3 || this.score.combo === 5 || this.score.combo === 10) {
        this.showFloatingText(STACK.CENTER_X, p.y - 190, 'ON FIRE 🔥', '#E23E22', 46);
        this.cameras.main.flash(120, 255, 180, 90);
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
    this.addMilestoneDecor(p);

    if (!this.tutorialActive && Math.abs(this.lean) > LEAN.MAX_PX) {
      this.toppleStack(p);
      this.lose('The tower leaned too far!');
      return;
    }

    this.time.delayedCall(340, () => this.spawnPancake());
  }

  /** Milestone toppings + syrup drips — visible goals on the tower. */
  private addMilestoneDecor(top: Pancake): void {
    const h = this.stackHeight;
    const toppings: Record<number, string> = {
      10: 'topping_blueberry',
      20: 'topping_strawberry',
      30: 'topping_cream',
      50: 'topping_cherry',
    };
    if (toppings[h]) {
      const obj = this.add.image(top.x, top.y - top.spec.thickness / 2 - 8, toppings[h]).setDepth(12);
      obj.setScale(1.15);
      this.decorations.push({ obj, pancake: top });
      this.showFloatingText(top.x, top.y - 120, h === 50 ? '🍒 50!' : `Milestone: ${h}!`, '#D94F04', 32);
    }
    if (h > 0 && h % 10 === 0) {
      for (let i = 0; i < 3; i++) {
        const drip = this.add.image(top.x - 40 + i * 38, top.y - 4, 'syrup').setDepth(11);
        this.tweens.add({ targets: drip, y: drip.y + 16 + i * 5, duration: 900, ease: 'Quad.easeIn' });
        this.decorations.push({ obj: drip, pancake: top });
      }
    }
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
    if (this.phase === 'over' || this.phase === 'replay') return;
    if (this.tutorialActive) {
      this.tutorialRetry();
      return;
    }
    // Rewarded continue: once per run, if there's a stack worth saving.
    if (!this.continueUsed && this.stackHeight >= 2) {
      this.showContinuePrompt(reason);
      return;
    }
    this.finalizeRun(reason);
  }

  /** "Watch an ad to save your stack?" — NullPlatform grants instantly. */
  private showContinuePrompt(reason: string): void {
    this.phase = 'over';
    this.score.onMiss();
    sfx.thud();
    haptics.fail();
    this.trail?.stop();
    this.inputCtl?.disable();
    if (this.current?.body) {
      this.current.setVelocity(0, 0);
      this.current.setAngularVelocity(0);
      this.current.setStatic(true);
    }
    const overlay = this.add.container(0, 0).setDepth(200);
    const dim = this.add.graphics();
    dim.fillStyle(0x2a1a05, 0.55);
    dim.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
    overlay.add(dim);
    const title = this.add
      .text(GAME.WIDTH / 2, 430, '🥞 Save your stack?', {
        fontFamily: FONT, fontSize: '44px', color: '#FFFFFF', fontStyle: 'bold', align: 'center',
      })
      .setOrigin(0.5);
    const sub = this.add
      .text(GAME.WIDTH / 2, 492, `${this.stackHeight} pancakes tall — watch a short ad\nand keep stacking (once per run).`, {
        fontFamily: FONT, fontSize: '25px', color: '#FFE9B0', align: 'center',
      })
      .setOrigin(0.5);
    overlay.add([title, sub]);
    const yes = makeButton(this, GAME.WIDTH / 2, 610, '▶  Watch ad — save it!', {
      width: 430, height: 84, fontSize: 30,
      onTap: async () => {
        overlay.destroy();
        this.continueOverlay = null;
        const granted = await getPlatform().rewardedBreak();
        if (granted) this.doContinue();
        else this.finalizeRun(reason);
      },
    });
    const no = makeButton(this, GAME.WIDTH / 2, 720, 'No thanks', {
      width: 260, height: 62, fill: 0x8a5a2b, fontSize: 26,
      onTap: () => {
        overlay.destroy();
        this.continueOverlay = null;
        this.finalizeRun(reason);
      },
    });
    overlay.add([yes, no]);
    overlay.iterate((o: Phaser.GameObjects.GameObject) => {
      (o as unknown as { setScrollFactor?: (n: number) => void }).setScrollFactor?.(0);
    });
    yes.iterate?.((o: Phaser.GameObjects.GameObject) => {
      (o as unknown as { setScrollFactor?: (n: number) => void }).setScrollFactor?.(0);
    });
    no.iterate?.((o: Phaser.GameObjects.GameObject) => {
      (o as unknown as { setScrollFactor?: (n: number) => void }).setScrollFactor?.(0);
    });
    this.continueOverlay = overlay;
  }

  private doContinue(): void {
    this.continueUsed = true;
    track('continue_used', { height: this.stackHeight, mode: this.mode });
    if (this.current) {
      this.current.destroy();
      this.current = null;
    }
    // Halve the lean: pull every pancake halfway back to centre.
    for (const s of this.stack) {
      s.baseX = STACK.CENTER_X + (s.baseX - STACK.CENTER_X) * 0.5;
    }
    this.lean = this.stack.length ? this.stack[this.stack.length - 1].baseX - STACK.CENTER_X : 0;
    this.phase = 'ready';
    this.inputCtl?.enable();
    getPlatform().gameplayStart();
    this.spawnPancake();
    this.showFloatingText(STACK.CENTER_X, this.stackTopY - 150, 'Stack saved! 🙌', '#58B368', 38);
  }

  private finalizeRun(reason: string): void {
    if (this.phase === 'replay') return;
    this.phase = 'over';
    getPlatform().gameplayStop();
    this.trail?.stop();
    this.inputCtl?.disable();

    const previousBest = loadBest();
    const isNewBest = this.score.total > previousBest;
    if (isNewBest) {
      saveBest(this.score.total);
      getPlatform().happyTime?.();
    }

    // Profile + missions + syrup settle at run end.
    const profile = loadProfile();
    profile.totalRuns += 1;
    profile.totalPancakes += this.stackHeight;
    saveProfile(profile);
    for (const id of observeRunEnd(this.stackHeight, this.lean)) {
      if (!this.completedMissions.includes(id)) this.completedMissions.push(id);
    }
    if (this.runSyrup > 0) addSyrup(this.runSyrup);

    let shareText: string | undefined;
    if (this.mode === 'daily') {
      const key = STORAGE_KEYS.DAILY_BEST_PREFIX + todaySeed();
      const prev = Number(localStorage.getItem(key) ?? 0) || 0;
      if (this.score.total > prev) {
        try { localStorage.setItem(key, String(this.score.total)); } catch { /* ignore */ }
      }
      const mult = Math.min(SCORING.COMBO_MAX_MULTIPLIER, 1 + this.bestComboSeen * SCORING.COMBO_STEP);
      shareText = `Flip Stack Daily #${dailyNumber()} — 🥞 ${this.stackHeight} tall · 🔥 ${this.score.perfects} perfects · best combo ×${mult.toFixed(1)}`;
    }

    track('run_end', {
      height: this.stackHeight,
      score: this.score.total,
      reason,
      perfects: this.score.perfects,
      durationMs: Date.now() - this.runStartedAt,
      controlMode: this.settings.controlMode,
      mode: this.mode,
    });

    this.pendingGameOver = {
      score: this.score.total,
      height: this.stackHeight,
      bestCombo: this.bestComboSeen,
      perfects: this.score.perfects,
      reason,
      isNewBest,
      mode: this.mode,
      syrupEarned: this.runSyrup,
      missionLines: missionSummaryLines(this.completedMissions),
      shareText,
    };
    this.startReplay();
  }

  /** Slow-mo replay of the last ~1.2s of flight, then Game Over. Tap skips. */
  private startReplay(): void {
    const frames = this.replayFrames.slice(-72);
    if (frames.length < 12 || !this.current) {
      this.finishToGameOver();
      return;
    }
    this.replayFrames = frames;
    this.replayIndex = 0;
    this.phase = 'replay';
    this.replayLabel = this.add
      .text(GAME.WIDTH / 2, 120, '↺ REPLAY', { fontFamily: FONT, fontSize: '34px', color: '#E56F1F', fontStyle: 'bold', stroke: '#FFFFFF', strokeThickness: 6 })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(120);
    this.input.once('pointerdown', () => {
      if (this.phase === 'replay') this.finishToGameOver();
    });
  }

  private advanceReplay(delta: number): void {
    const p = this.current;
    if (!p) return this.finishToGameOver();
    this.replayIndex += (delta / PHYSICS.FIXED_STEP_MS) * 0.4; // 0.4x speed
    const idx = Math.floor(this.replayIndex);
    if (idx >= this.replayFrames.length) return this.finishToGameOver();
    const f = this.replayFrames[idx];
    p.visual.setPosition(f.x, f.y);
    p.visual.setRotation(f.rot);
    const c = Math.cos(f.rot);
    p.visual.setTexture(c >= 0 ? p.skinTop : p.skinBottom);
    const faceH = p.spec.thickness + 12 + 18 * Math.abs(c);
    p.visual.setDisplaySize(p.spec.radius * 2 + 14, faceH);
    for (const s of this.stack) s.syncVisual();
  }

  private finishToGameOver(): void {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.replayLabel?.destroy();
    this.replayLabel = null;
    const data = this.pendingGameOver ?? {};
    this.pendingGameOver = null;
    this.scene.start('GameOver', data);
  }

  // ---------------------------------------------------------- tutorial (Phase 3.1)
  private setupTutorial(): void {
    this.tutorialText = this.add
      .text(GAME.WIDTH / 2, 205, '', {
        fontFamily: FONT, fontSize: '30px', color: '#4A2C14', fontStyle: 'bold',
        align: 'center', stroke: '#FFFFFF', strokeThickness: 5,
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(110);
    this.ghostHand = this.add
      .text(GAME.WIDTH / 2 + 60, GAME.HEIGHT - 330, '🖐️', { fontSize: '64px' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(110);
    this.arcGfx = this.add.graphics().setDepth(3);
    this.updateTutorialStep();
  }

  private updateTutorialStep(): void {
    if (!this.tutorialText) return;
    const prompts = [
      'Flip 1 of 3: swipe LONG and slow ⬆️\nLong swipe = HIGH',
      'Flip 2 of 3: short, FAST flick!\nFast flick = SPIN 🌀',
      'Flip 3 of 3: match them —\nland it flat! 🎯',
    ];
    this.tutorialText.setText(prompts[Math.min(this.tutorialStep, 2)]);
    track('tutorial_step', { step: this.tutorialStep });
    if (this.ghostHand) {
      this.tweens.killTweensOf(this.ghostHand);
      const long = this.tutorialStep === 0;
      this.ghostHand.setPosition(GAME.WIDTH / 2 + 60, GAME.HEIGHT - 300);
      this.tweens.add({
        targets: this.ghostHand,
        y: GAME.HEIGHT - 300 - (long ? 260 : 110),
        duration: long ? 1100 : 420,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      this.ghostHand.setVisible(this.tutorialStep < 2);
    }
    if (this.tutorialStep >= 3) this.finishTutorial();
  }

  private finishTutorial(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.TUTORIAL_DONE, '1');
    } catch { /* ignore */ }
    this.tutorialActive = false;
    this.tutorialText?.destroy();
    this.ghostHand?.destroy();
    this.arcGfx?.clear();
    this.showFloatingText(STACK.CENTER_X, this.stackTopY - 160, 'Tutorial done! 🎉', '#E56F1F', 38);
  }

  /** Failed flip during the tutorial: no game over, just a tip + retry. */
  private tutorialRetry(): void {
    this.showFloatingText(STACK.CENTER_X, this.stackTopY - 170, 'So close — match power + spin!', '#B7791F', 30);
    if (this.current) {
      this.current.destroy();
      this.current = null;
    }
    this.phase = 'ready';
    this.time.delayedCall(500, () => this.spawnPancake());
  }

  /** Dotted arc preview — tutorial flip 3 ONLY. Never outside the tutorial. */
  private drawTutorialArc(): void {
    const g = this.arcGfx;
    if (!g) return;
    g.clear();
    if (!this.tutorialActive || this.tutorialStep !== 2 || this.phase !== 'ready' || !this.current) return;
    const { vx, vy } = this.computeLaunch({ power: 0.62, spin: 0.5, spinDir: 1, drift: 0, source: 'swipe' });
    let x = this.current.x;
    let y = this.current.y;
    let v = vy;
    const gStep = 0.278; // measured px/step^2 at gravity 1, 60fps
    g.fillStyle(0xe56f1f, 0.55);
    for (let i = 0; i < 150; i++) {
      v += gStep;
      x += vx;
      y += v;
      if (i % 6 === 0) g.fillCircle(x, y, 5);
      if (y > this.stackTopY) break;
    }
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

  private burstParticles(x: number, y: number, count = 16): void {
    const emitter = this.add.particles(x, y, 'spark', {
      speed: { min: 90, max: 260 },
      angle: { min: 0, max: 360 },
      lifespan: 520,
      quantity: count,
      scale: { start: 1, end: 0 },
      emitting: false,
    });
    emitter.setDepth(60);
    emitter.explode(count);
    this.time.delayedCall(700, () => emitter.destroy());
  }
}
