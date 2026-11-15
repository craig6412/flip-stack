import Phaser from 'phaser';

export const FONT = 'Arial, Helvetica, sans-serif';
export const COLORS = {
  bg: 0xfff3d6,
  cream: 0xfffaf0,
  orange: 0xff8c42,
  orangeDark: 0xe56f1f,
  brown: 0x6b3a1f,
  pancake: 0xf2b544,
  pancakeDark: 0xd98e1e,
  textDark: '#4A2C14',
  textLight: '#FFFFFF',
};

export function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  opts: { width?: number; height?: number; fill?: number; fontSize?: number; onTap: () => void },
): Phaser.GameObjects.Container {
  const w = opts.width ?? 340;
  const h = opts.height ?? 84;
  const fill = opts.fill ?? COLORS.orange;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.12);
  g.fillRoundedRect(-w / 2 + 4, -h / 2 + 6, w, h, 22);
  g.fillStyle(fill, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, 22);
  const text = scene.add
    .text(0, 0, label, { fontFamily: FONT, fontSize: `${opts.fontSize ?? 34}px`, color: COLORS.textLight, fontStyle: 'bold' })
    .setOrigin(0.5);
  const c = scene.add.container(x, y, [g, text]);
  c.setSize(w, h);
  c.setInteractive({ useHandCursor: true });
  c.on('pointerover', () => c.setScale(1.03));
  c.on('pointerout', () => c.setScale(1));
  c.on('pointerdown', () => c.setScale(0.97));
  c.on('pointerup', () => {
    c.setScale(1);
    opts.onTap();
  });
  return c;
}

export function titleText(scene: Phaser.Scene, x: number, y: number, text: string, size = 92): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, text, {
      fontFamily: FONT,
      fontSize: `${size}px`,
      color: '#E56F1F',
      fontStyle: 'bold',
      stroke: '#FFFFFF',
      strokeThickness: 10,
      shadow: { offsetX: 0, offsetY: 5, color: '#D98E1E', blur: 0, fill: true },
    })
    .setOrigin(0.5);
}

export function bodyText(scene: Phaser.Scene, x: number, y: number, text: string, size = 28, color = COLORS.textDark): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, color, align: 'center' }).setOrigin(0.5);
}
