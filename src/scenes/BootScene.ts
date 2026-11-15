import Phaser from 'phaser';

/**
 * Generates every texture procedurally — zero external assets.
 * Pancake: golden ellipse with darker rim + butter pat drawn in Title/Game as sprites.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.makePancakeTexture();
    this.makePanTexture();
    this.makePlateTexture();
    this.makeParticleTexture();
    this.makeToppingTextures();
    this.scene.start('Title');
  }

  private makeToppingTextures(): void {
    const g = this.add.graphics();
    // blueberry
    g.fillStyle(0x3b4a8c, 1); g.fillCircle(16, 16, 13);
    g.fillStyle(0x5a6fc0, 1); g.fillCircle(12, 11, 5);
    g.generateTexture('topping_blueberry', 32, 32); g.clear();
    // strawberry
    g.fillStyle(0xe23e4e, 1); g.fillEllipse(16, 19, 24, 24);
    g.fillStyle(0x58b368, 1); g.fillTriangle(6, 8, 26, 8, 16, 15);
    g.fillStyle(0xffffff, 0.8); g.fillCircle(12, 17, 2); g.fillCircle(20, 22, 2); g.fillCircle(15, 25, 2);
    g.generateTexture('topping_strawberry', 32, 34); g.clear();
    // whipped cream
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(20, 24, 38, 16); g.fillEllipse(20, 17, 26, 14); g.fillEllipse(20, 10, 13, 11);
    g.fillStyle(0xe8edf3, 1); g.fillEllipse(28, 25, 16, 8);
    g.generateTexture('topping_cream', 40, 32); g.clear();
    // cherry
    g.fillStyle(0xc21725, 1); g.fillCircle(15, 20, 11);
    g.fillStyle(0xff6b7a, 1); g.fillCircle(11, 16, 4);
    g.lineStyle(3, 0x4a7c3a, 1); g.lineBetween(15, 10, 22, 2);
    g.generateTexture('topping_cherry', 30, 32); g.clear();
    // syrup drip blob
    g.fillStyle(0xa05e14, 0.9); g.fillEllipse(10, 8, 18, 12); g.fillEllipse(10, 14, 7, 12);
    g.generateTexture('syrup', 20, 22);
    g.destroy();
  }

  private makePancakeTexture(): void {
    // TOP: golden, toasted spots, butter pat — face-up must be unmistakable.
    const g = this.add.graphics();
    const W = 200;
    const H = 48;
    g.fillStyle(0xb96f12, 1);
    g.fillEllipse(W / 2, H / 2 + 4, W, H - 4);
    g.fillStyle(0xf2b544, 1);
    g.fillEllipse(W / 2, H / 2, W, H - 6);
    g.fillStyle(0xffcf6b, 1);
    g.fillEllipse(W / 2, H / 2 - 4, W - 14, H - 16);
    g.fillStyle(0xd98e1e, 0.55);
    g.fillEllipse(W * 0.32, H * 0.42, 26, 9);
    g.fillEllipse(W * 0.62, H * 0.36, 20, 7);
    g.fillEllipse(W * 0.5, H * 0.55, 15, 6);
    // butter pat
    g.fillStyle(0xfff3a6, 1);
    g.fillRoundedRect(W / 2 - 13, H / 2 - 13, 26, 13, 3);
    g.fillStyle(0xffe066, 1);
    g.fillRoundedRect(W / 2 - 13, H / 2 - 13, 26, 5, 3);
    g.generateTexture('pancake_top', W, H);
    g.generateTexture('pancake', W, H);
    g.clear();
    // BOTTOM: paler, flatter, no butter, faint spots.
    g.fillStyle(0xcfa15c, 1);
    g.fillEllipse(W / 2, H / 2 + 4, W, H - 4);
    g.fillStyle(0xe8c98a, 1);
    g.fillEllipse(W / 2, H / 2, W, H - 6);
    g.fillStyle(0xf0d9a4, 1);
    g.fillEllipse(W / 2, H / 2 - 3, W - 14, H - 16);
    g.fillStyle(0xd9b878, 0.5);
    g.fillEllipse(W * 0.4, H * 0.45, 22, 8);
    g.fillEllipse(W * 0.66, H * 0.4, 16, 6);
    g.generateTexture('pancake_bottom', W, H);
    g.destroy();
  }

  private makePanTexture(): void {
    const g = this.add.graphics();
    const W = 280;
    const H = 70;
    // handle
    g.fillStyle(0x3a3f4a, 1);
    g.fillRoundedRect(W - 16, H / 2 - 9, 92, 18, 9);
    // pan body (side view: shallow bowl)
    g.fillStyle(0x22262e, 1);
    g.fillEllipse(W / 2 - 30, H / 2 + 8, 230, 42);
    g.fillStyle(0x4a5160, 1);
    g.fillEllipse(W / 2 - 30, H / 2 + 2, 224, 34);
    g.fillStyle(0x69707f, 1);
    g.fillEllipse(W / 2 - 30, H / 2, 205, 24);
    g.generateTexture('pan', W + 80, H);
    g.destroy();
  }

  private makePlateTexture(): void {
    const g = this.add.graphics();
    const W = 260;
    const H = 36;
    g.fillStyle(0xd7dde6, 1);
    g.fillEllipse(W / 2, H / 2 + 5, W, H - 8);
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(W / 2, H / 2, W, H - 8);
    g.fillStyle(0xe8edf3, 1);
    g.fillEllipse(W / 2, H / 2 - 2, W - 60, H - 18);
    g.generateTexture('plate', W, H);
    g.destroy();
  }

  private makeParticleTexture(): void {
    const g = this.add.graphics();
    g.fillStyle(0xffd34d, 1);
    g.fillCircle(8, 8, 7);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(6, 6, 3);
    g.generateTexture('spark', 16, 16);
    g.destroy();
  }
}
