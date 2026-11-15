import Phaser from 'phaser';
import { GAME, PHYSICS } from './config';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { SettingsScene } from './scenes/SettingsScene';
import { GameScene } from './scenes/GameScene';
import { GameOverScene } from './scenes/GameOverScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: GAME.WIDTH,
  height: GAME.HEIGHT,
  backgroundColor: '#FFF3D6',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: PHYSICS.GRAVITY_Y },
      enableSleeping: false,
      positionIterations: 8,
      velocityIterations: 6,
      debug: false,
    },
  },
  render: { antialias: true, pixelArt: false },
  scene: [BootScene, TitleScene, SettingsScene, GameScene, GameOverScene],
};

new Phaser.Game(config);
