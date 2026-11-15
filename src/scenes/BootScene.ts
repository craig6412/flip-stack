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
    this.scene.start('Title');
  }

  private makePancakeTexture(): void {
    const g = this.add.graphics();
    const W = 200;
    const H = 48;
    // shadow rim
    g.fillStyle(0xb96f12, 1);
    g.fillEllipse(W / 2, H / 2 + 4, W, H - 4);
    // body
    g.fillStyle(0xf2b544, 1);
    g.fillEllipse(W / 2, H / 2, W, H - 6);
    // top face
    g.fillStyle(0xffcf6b, 1);
    g.fillEllipse(W / 2, H / 2 - 4, W - 14, H - 16);
    // toasted spots
    g.fillStyle(0xd98e1e, 0.55);
    g.fillEllipse(W * 0.32, H * 0.42, 26, 9);
    g.fillEllipse(W * 0.62, H * 0.36, 20, 7);
    g.fillEllipse(W * 0.5, H * 0.55, 15, 6);
    g.generateTexture('pancake', W, H);
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
