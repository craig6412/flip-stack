import Phaser from 'phaser';
import { GAME, loadSettings, saveSettings, type ControlMode, type FlipSettings } from '../config';
import { bodyText, makeButton, titleText, COLORS } from '../utils/ui';
import { sfx } from '../utils/sound';

export class SettingsScene extends Phaser.Scene {
  private settings: FlipSettings = loadSettings();
  private sliderValueText!: Phaser.GameObjects.Text;
  private modeText!: Phaser.GameObjects.Text;
  private soundText!: Phaser.GameObjects.Text;

  constructor() {
    super('Settings');
  }

  create(): void {
    this.settings = loadSettings();
    const cx = GAME.WIDTH / 2;
    this.cameras.main.setBackgroundColor('#FFF3D6');
    titleText(this, cx, 170, 'Settings', 72);

    // --- Sensitivity slider ---
    bodyText(this, cx, 300, 'Flip sensitivity', 32);
    this.sliderValueText = bodyText(this, cx, 345, this.settings.sensitivity.toFixed(2) + '×', 28, '#E56F1F');

    const trackX = cx - 240;
    const trackW = 480;
    const trackY = 410;
    const track = this.add.graphics();
    track.fillStyle(0xe8d9b8, 1);
    track.fillRoundedRect(trackX, trackY - 10, trackW, 20, 10);
    const fill = this.add.graphics();
    const knob = this.add.circle(cx, trackY, 26, COLORS.orange).setStrokeStyle(4, 0xffffff).setInteractive({ useHandCursor: true, draggable: true });
    this.input.setDraggable(knob);

    const renderSlider = () => {
      const t = (this.settings.sensitivity - 0.5) / 1.1;
      knob.x = trackX + t * trackW;
      fill.clear();
      fill.fillStyle(COLORS.orange, 1);
      fill.fillRoundedRect(trackX, trackY - 10, t * trackW, 20, 10);
      this.sliderValueText.setText(this.settings.sensitivity.toFixed(2) + '×');
    };
    renderSlider();

    knob.on('drag', (_p: Phaser.Input.Pointer, dragX: number) => {
      const t = Phaser.Math.Clamp((dragX - trackX) / trackW, 0, 1);
      this.settings.sensitivity = Math.round((0.5 + t * 1.1) * 20) / 20;
      renderSlider();
    });
    knob.on('dragend', () => saveSettings(this.settings));

    // --- Control mode ---
    bodyText(this, cx, 540, 'Control mode', 32);
    this.modeText = bodyText(this, cx, 640, '', 30, '#E56F1F');
    const modes: { id: ControlMode; label: string }[] = [
      { id: 'auto', label: 'Auto (all)' },
      { id: 'motion', label: 'Motion flick' },
      { id: 'swipe', label: 'Swipe' },
      { id: 'circular', label: 'Circular (mouse)' },
    ];
    const updateMode = () => {
      const m = modes.find((mm) => mm.id === this.settings.controlMode);
      this.modeText.setText(`◀  ${m?.label ?? ''}  ▶`);
    };
    updateMode();
    this.modeText.setInteractive({ useHandCursor: true });
    this.modeText.on('pointerup', () => {
      const idx = modes.findIndex((mm) => mm.id === this.settings.controlMode);
      this.settings.controlMode = modes[(idx + 1) % modes.length].id;
      saveSettings(this.settings);
      sfx.click();
      updateMode();
    });
    bodyText(this, cx, 700, 'Tap the mode to cycle. Auto is recommended.', 22);

    // --- Sound toggle ---
    bodyText(this, cx, 800, 'Sound', 32);
    this.soundText = bodyText(this, cx, 860, '', 30, '#E56F1F');
    const updateSound = () => this.soundText.setText(this.settings.sound ? '🔊 On — tap to turn off' : '🔇 Off — tap to turn on');
    updateSound();
    this.soundText.setInteractive({ useHandCursor: true });
    this.soundText.on('pointerup', () => {
      this.settings.sound = !this.settings.sound;
      sfx.enabled = this.settings.sound;
      saveSettings(this.settings);
      sfx.click();
      updateSound();
    });

    // --- Volume slider ---
    bodyText(this, cx, 930, 'Volume', 32);
    const volValue = bodyText(this, cx, 972, '', 26, '#E56F1F');
    const vTrackX = cx - 240;
    const vTrackW = 480;
    const vTrackY = 1020;
    const vTrack = this.add.graphics();
    vTrack.fillStyle(0xe8d9b8, 1);
    vTrack.fillRoundedRect(vTrackX, vTrackY - 10, vTrackW, 20, 10);
    const vFill = this.add.graphics();
    const vKnob = this.add.circle(cx, vTrackY, 26, COLORS.orange).setStrokeStyle(4, 0xffffff).setInteractive({ useHandCursor: true, draggable: true });
    this.input.setDraggable(vKnob);
    const renderVol = () => {
      vKnob.x = vTrackX + this.settings.volume * vTrackW;
      vFill.clear();
      vFill.fillStyle(COLORS.orange, 1);
      vFill.fillRoundedRect(vTrackX, vTrackY - 10, this.settings.volume * vTrackW, 20, 10);
      volValue.setText(`${Math.round(this.settings.volume * 100)}%`);
    };
    renderVol();
    vKnob.on('drag', (_p: Phaser.Input.Pointer, dragX: number) => {
      this.settings.volume = Math.round(Phaser.Math.Clamp((dragX - vTrackX) / vTrackW, 0, 1) * 20) / 20;
      sfx.volume = this.settings.volume;
      renderVol();
    });
    vKnob.on('dragend', () => saveSettings(this.settings));

    makeButton(this, cx, 1090, '↺ Replay tutorial', {
      width: 320, height: 56, fill: 0x4a90d9, fontSize: 24,
      onTap: () => {
        sfx.click();
        try { localStorage.removeItem('flipstack.tutorialDone'); } catch { /* ignore */ }
        bodyText(this, cx, 1132, 'Tutorial will play on your next run.', 20);
      },
    });
    makeButton(this, cx, 1185, '← Back', {
      width: 280, height: 70, fill: 0x8a5a2b,
      onTap: () => { saveSettings(this.settings); sfx.click(); this.scene.start('Title'); },
    });
    bodyText(this, cx, 1242, 'Motion controls need HTTPS on mobile Safari.', 19);
  }
}
