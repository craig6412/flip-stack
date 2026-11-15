import Phaser from 'phaser';
import { GAME, SCORING, loadBest } from '../config';
import { bodyText, makeButton, titleText } from '../utils/ui';
import { maybeCommercialBreak } from '../platform/Platform';
import { sfx } from '../utils/sound';

export interface GameOverData {
  score: number;
  height: number;
  bestCombo: number;
  perfects?: number;
  reason: string;
  isNewBest?: boolean;
  mode?: 'endless' | 'daily';
  syrupEarned?: number;
  missionLines?: string[];
  shareText?: string;
}

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  create(data: GameOverData): void {
    void maybeCommercialBreak(); // between runs, throttled to ~2.5 min
    const cx = GAME.WIDTH / 2;
    this.cameras.main.setBackgroundColor('#FFF3D6');
    const best = loadBest();
    const isNewBest = data.isNewBest ?? false;
    const comboMult = Math.min(SCORING.COMBO_MAX_MULTIPLIER, 1 + data.bestCombo * SCORING.COMBO_STEP);

    titleText(this, cx, 200, data.mode === 'daily' ? 'Daily Done!' : 'Game Over', 84);
    bodyText(this, cx, 285, data.reason, 28);

    const fallen = this.add.image(cx, 400, 'pancake').setAngle(24);
    fallen.setDisplaySize(180, 46);
    this.tweens.add({ targets: fallen, angle: 18, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    bodyText(this, cx, 505, `Score`, 30);
    bodyText(this, cx, 572, `${data.score}`, 84, '#E56F1F');
    bodyText(this, cx, 655, `🥞 ${data.height} tall · ⭐ ${data.perfects ?? 0} perfects · 🔥 best combo ×${comboMult.toFixed(1)}`, 26);
    bodyText(this, cx, 705, isNewBest ? '🏆 NEW BEST!' : `Best: ${best}`, 32, isNewBest ? '#E56F1F' : '#4A2C14');

    let y = 775;
    if (data.syrupEarned && data.syrupEarned > 0) {
      const syrupText = bodyText(this, cx, y, `🍯 +0 syrup`, 28, '#B7791F');
      const counter = { v: 0 };
      this.tweens.add({
        targets: counter, v: data.syrupEarned, duration: 700, ease: 'Quad.easeOut',
        onUpdate: () => syrupText.setText(`🍯 +${Math.round(counter.v)} syrup`),
      });
      y += 48;
    }
    if (data.missionLines && data.missionLines.length > 0) {
      bodyText(this, cx, y, data.missionLines.join('\n'), 23);
      y += 30 + data.missionLines.length * 28;
    }

    const btnY = Math.max(960, y + 40);
    makeButton(this, cx, btnY, '↻  Play Again', {
      width: 380, height: 96, fontSize: 40,
      onTap: () => {
        sfx.click();
        if (data.mode === 'daily') {
          const d = new Date();
          const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
          this.scene.start('Game', { mode: 'daily', seed });
        } else {
          this.scene.start('Game', { mode: 'endless' });
        }
      },
    });
    makeButton(this, cx - 150, btnY + 105, '🛒 Shop', {
      width: 240, height: 68, fill: 0x58b368, fontSize: 26,
      onTap: () => { sfx.click(); this.scene.start('Shop'); },
    });
    makeButton(this, cx + 150, btnY + 105, 'Title', {
      width: 240, height: 68, fill: 0x8a5a2b, fontSize: 26,
      onTap: () => { sfx.click(); this.scene.start('Title'); },
    });
    if (data.shareText) {
      makeButton(this, cx, btnY + 195, '📤 Share', {
        width: 240, height: 62, fill: 0x4a90d9, fontSize: 24,
        onTap: async () => {
          sfx.click();
          try {
            if (navigator.share) await navigator.share({ text: data.shareText });
            else await navigator.clipboard.writeText(data.shareText ?? '');
          } catch { /* user cancelled */ }
        },
      });
    }
  }
}
