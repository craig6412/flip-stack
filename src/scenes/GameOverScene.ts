import Phaser from 'phaser';
import { GAME, loadBest } from '../config';
import { bodyText, makeButton, titleText } from '../utils/ui';
import { sfx } from '../utils/sound';

export interface GameOverData {
  score: number;
  height: number;
  bestCombo: number;
  reason: string;
}

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  create(data: GameOverData): void {
    const cx = GAME.WIDTH / 2;
    this.cameras.main.setBackgroundColor('#FFF3D6');
    const best = loadBest();
    const isNewBest = data.score >= best && data.score > 0;

    titleText(this, cx, 240, 'Game Over', 84);
    bodyText(this, cx, 330, data.reason, 28);

    // Fallen pancake decoration
    const fallen = this.add.image(cx, 460, 'pancake').setAngle(24);
    fallen.setDisplaySize(180, 46);
    this.tweens.add({ targets: fallen, angle: 18, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    bodyText(this, cx, 580, `Score`, 30);
    bodyText(this, cx, 650, `${data.score}`, 84, '#E56F1F');
    bodyText(this, cx, 740, `🥞 Stack height: ${data.height}    🔥 Best combo: ×${(1 + data.bestCombo * 0.5).toFixed(1)}`, 27);
    bodyText(this, cx, 800, isNewBest ? '🏆 NEW BEST!' : `Best: ${best}`, 32, isNewBest ? '#E56F1F' : '#4A2C14');

    makeButton(this, cx, 950, '↻  Play Again', {
      width: 360, height: 92, fontSize: 38,
      onTap: () => { sfx.click(); this.scene.start('Game'); },
    });
    makeButton(this, cx, 1065, 'Title', {
      width: 260, height: 72, fill: 0x8a5a2b, fontSize: 28,
      onTap: () => { sfx.click(); this.scene.start('Title'); },
    });
  }
}
