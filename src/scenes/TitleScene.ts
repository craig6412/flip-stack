import Phaser from 'phaser';
import { GAME, STORAGE_KEYS, loadBest, loadSettings } from '../config';
import { motionNeedsPermission, requestMotionPermission } from '../input/InputController';
import { loadProfile } from '../systems/ProfileStore';
import { ensureMissions, missionLabel } from '../systems/Missions';
import { bodyText, makeButton, titleText } from '../utils/ui';
import { sfx } from '../utils/sound';

export function todaySeed(): number {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

export function dailyNumber(): number {
  const launch = Date.UTC(2026, 10, 14); // Nov 14, 2026 = Daily #1
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(1, Math.floor((today - launch) / 86400000) + 1);
}

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    const { WIDTH } = GAME;
    this.cameras.main.setBackgroundColor('#FFF3D6');
    sfx.enabled = loadSettings().sound;
    sfx.volume = loadSettings().volume;

    const cx = WIDTH / 2;
    this.add.image(cx, 640, 'plate').setScale(1.1);
    for (let i = 0; i < 4; i++) {
      const p = this.add.image(cx + (i % 2 === 0 ? -4 : 4), 612 - i * 24, 'pancake');
      p.setDisplaySize(172, 42);
      this.tweens.add({ targets: p, y: p.y - 6, duration: 900 + i * 120, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    this.add.image(cx - 150, 770, 'pan').setScale(0.85).setAngle(-6);

    titleText(this, cx, 180, 'FLIP STACK', 104);
    bodyText(this, cx, 262, 'Flip pancakes. Stack them high.\nDon\'t drop one.', 29);

    const best = loadBest();
    const profile = loadProfile();
    const dailyBest = Number(localStorage.getItem(STORAGE_KEYS.DAILY_BEST_PREFIX + todaySeed()) ?? 0) || 0;
    const info: string[] = [];
    if (best > 0) info.push(`🏆 Best: ${best}`);
    info.push(`🍯 ${profile.syrup} syrup`);
    if (dailyBest > 0) info.push(`📅 Today's best: ${dailyBest}`);
    bodyText(this, cx, 345, info.join('   '), 27, '#E56F1F');

    const missions = ensureMissions(todaySeed());
    bodyText(this, cx, 420, '🎯 ' + missions.map((m) => `${missionLabel(m)} (${m.progress}/${m.target})`).join('\n🎯 '), 21);

    makeButton(this, cx, 830, '▶  PLAY', {
      width: 360, height: 92, fontSize: 40,
      onTap: () => { sfx.click(); this.scene.start('Game', { mode: 'endless' }); },
    });
    makeButton(this, cx, 940, `📅 Daily #${dailyNumber()}`, {
      width: 320, height: 72, fill: 0x4a90d9, fontSize: 29,
      onTap: () => { sfx.click(); this.scene.start('Game', { mode: 'daily', seed: todaySeed() }); },
    });
    makeButton(this, cx - 165, 1040, '🛒 Shop', {
      width: 240, height: 68, fill: 0x58b368, fontSize: 27,
      onTap: () => { sfx.click(); this.scene.start('Shop'); },
    });
    makeButton(this, cx + 165, 1040, '⚙ Settings', {
      width: 240, height: 68, fill: 0x8a5a2b, fontSize: 27,
      onTap: () => { sfx.click(); this.scene.start('Settings'); },
    });

    if (motionNeedsPermission()) {
      makeButton(this, cx, 1140, '📱 Tap to enable motion', {
        width: 420, height: 66, fill: 0x4a90d9, fontSize: 26,
        onTap: async () => {
          const ok = await requestMotionPermission();
          bodyText(this, cx, 1200, ok ? '✅ Motion enabled — flick your phone to flip!' : 'Motion denied — swipe still works.', 21);
        },
      });
    } else {
      bodyText(this, cx, 1150,
        'How to play:\n📱 Flick or swipe: long = HIGH, fast = SPIN\nWhile it\'s in the air, tilt ◀ ▶ to steer!', 23);
    }
  }
}
