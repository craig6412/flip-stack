import Phaser from 'phaser';
import { ASSETS } from '../config';

/**
 * Art pipeline (Phase 5): tries to load real art from public/assets/
 * (see ASSETS in config.ts — ChatGPT sprites drop in there). Any file
 * that is missing or fails to load falls back to the procedural texture
 * below, so the game NEVER breaks because art is absent.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    this.load.on('loaderror', () => {
      /* missing art is expected — procedural fallback covers it */
    });
    for (const [key, path] of Object.entries(ASSETS)) {
      this.load.image(key, path);
    }
  }

  create(): void {
    this.makePancakeTexture();
    this.makePanTexture();
    this.makePlateTexture();
    this.makeParticleTexture();
    this.makeToppingTextures();
    this.scene.start('Title');
  }

  /** Generate only if a real asset didn't already provide this key. */
  private gen(g: Phaser.GameObjects.Graphics, key: string, w: number, h: number): void {
    if (!this.textures.exists(key)) g.generateTexture(key, w, h);
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
    // Palettes per skin. Identical shapes/physics — only the paint differs.
    const skins: Record<string, { rim: number; body: number; face: number; spot: number; deco?: 'butter' | 'berries' | 'chips' | 'grid' | 'cream' }> = {
      '': { rim: 0xb96f12, body: 0xf2b544, face: 0xffcf6b, spot: 0xd98e1e, deco: 'butter' },
      _blueberry: { rim: 0x8a6d2f, body: 0xe0aa4e, face: 0xf5c86e, spot: 0xc78f2e, deco: 'berries' },
      _chocolate: { rim: 0x9c6414, body: 0xeaa83f, face: 0xf7bd55, spot: 0xd98e1e, deco: 'chips' },
      _waffle: { rim: 0xa86a1c, body: 0xe39a35, face: 0xefa845, spot: 0xc67c22, deco: 'grid' },
      _redvelvet: { rim: 0x7e1f24, body: 0xa92c33, face: 0xbc3a41, spot: 0x8e242b, deco: 'cream' },
    };
    const W = 200;
    const H = 48;
    for (const [suffix, pal] of Object.entries(skins)) {
      const g = this.add.graphics();
      g.fillStyle(pal.rim, 1);
      g.fillEllipse(W / 2, H / 2 + 4, W, H - 4);
      g.fillStyle(pal.body, 1);
      g.fillEllipse(W / 2, H / 2, W, H - 6);
      g.fillStyle(pal.face, 1);
      g.fillEllipse(W / 2, H / 2 - 4, W - 14, H - 16);
      g.fillStyle(pal.spot, 0.55);
      g.fillEllipse(W * 0.32, H * 0.42, 26, 9);
      g.fillEllipse(W * 0.62, H * 0.36, 20, 7);
      if (pal.deco === 'butter' || pal.deco === 'cream') {
        g.fillStyle(pal.deco === 'butter' ? 0xfff3a6 : 0xffffff, 1);
        g.fillRoundedRect(W / 2 - 13, H / 2 - 13, 26, 13, 3);
        g.fillStyle(pal.deco === 'butter' ? 0xffe066 : 0xf0f0f0, 1);
        g.fillRoundedRect(W / 2 - 13, H / 2 - 13, 26, 5, 3);
      } else if (pal.deco === 'berries') {
        g.fillStyle(0x3b4a8c, 1);
        g.fillCircle(W * 0.38, H * 0.42, 6); g.fillCircle(W * 0.55, H * 0.55, 5); g.fillCircle(W * 0.66, H * 0.38, 6); g.fillCircle(W * 0.47, H * 0.35, 4);
      } else if (pal.deco === 'chips') {
        g.fillStyle(0x4a2c14, 1);
        g.fillCircle(W * 0.36, H * 0.44, 4); g.fillCircle(W * 0.52, H * 0.36, 4); g.fillCircle(W * 0.63, H * 0.52, 4); g.fillCircle(W * 0.44, H * 0.58, 3);
      } else if (pal.deco === 'grid') {
        g.lineStyle(3, pal.spot, 0.7);
        for (let i = 1; i <= 3; i++) g.lineBetween((W / 4) * i, 8, (W / 4) * i, H - 8);
        g.lineBetween(14, H / 2 - 2, W - 14, H / 2 - 2);
      }
      this.gen(g, `pancake_top${suffix}`, W, H);
      if (suffix === '') g.generateTexture('pancake', W, H);
      g.clear();
      // BOTTOM: paler version, no deco.
      g.fillStyle(pal.rim, 0.75);
      g.fillEllipse(W / 2, H / 2 + 4, W, H - 4);
      g.fillStyle(pal.body, 0.72);
      g.fillEllipse(W / 2, H / 2, W, H - 6);
      g.fillStyle(0xffffff, 0.25);
      g.fillEllipse(W / 2, H / 2 - 3, W - 14, H - 16);
      this.gen(g, `pancake_bottom${suffix}`, W, H);
      g.destroy();
    }
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
    this.gen(g, 'pan', W + 80, H);
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
    this.gen(g, 'plate', W, H);
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
