import Phaser from 'phaser';
import { GAME, loadBest, loadSettings } from '../config';
import { motionNeedsPermission, requestMotionPermission } from '../input/InputController';
import { bodyText, makeButton, titleText } from '../utils/ui';
import { sfx } from '../utils/sound';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    const { WIDTH, HEIGHT } = GAME;
    this.cameras.main.setBackgroundColor('#FFF3D6');
    sfx.enabled = loadSettings().sound;

    // Decorative stack
    const cx = WIDTH / 2;
    this.add.image(cx, 700, 'plate').setScale(1.1);
    for (let i = 0; i < 4; i++) {
      const p = this.add.image(cx + (i % 2 === 0 ? -4 : 4), 672 - i * 24, 'pancake');
      p.setDisplaySize(172, 42);
      this.tweens.add({ targets: p, y: p.y - 6, duration: 900 + i * 120, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    this.add.image(cx - 150, 830, 'pan').setScale(0.85).setAngle(-6);

    titleText(this, cx, 210, 'FLIP STACK', 104);
    bodyText(this, cx, 292, 'Flip pancakes. Stack them high.\nDon\'t drop one.', 30);

    const best = loadBest();
    if (best > 0) bodyText(this, cx, 380, `🏆 Best: ${best}`, 32, '#E56F1F');

    makeButton(this, cx, 920, '▶  PLAY', {
      width: 360, height: 96, fontSize: 40,
      onTap: () => { sfx.click(); this.scene.start('Game'); },
    });
    makeButton(this, cx, 1030, '⚙  Settings', {
      width: 300, height: 76, fill: 0x8a5a2b, fontSize: 30,
      onTap: () => { sfx.click(); this.scene.start('Settings'); },
    });

    // iOS motion permission — must be called from a user gesture.
    if (motionNeedsPermission()) {
      makeButton(this, cx, 1140, '📱 Tap to enable motion', {
        width: 420, height: 70, fill: 0x4a90d9, fontSize: 27,
        onTap: async () => {
          const ok = await requestMotionPermission();
          bodyText(this, cx, 1205, ok ? '✅ Motion enabled — flick your phone to flip!' : 'Motion denied — swipe still works.', 22);
        },
      });
    } else {
      bodyText(this, cx, 1150,
        'How to play:\n📱 Flick phone or swipe up  •  🖱️ Drag in a circle & release\nWhile it\'s in the air, tilt ◀ ▶ to steer!\nLand flat & face-up after a full flip!', 24);
    }
  }
}
