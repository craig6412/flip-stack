import Phaser from 'phaser';
import { GAME } from '../config';
import { SHOP_ITEMS, shopItem, type ShopItem } from '../systems/shopData';
import { loadProfile, saveProfile } from '../systems/ProfileStore';
import { track } from '../utils/analytics';
import { bodyText, makeButton, titleText, FONT } from '../utils/ui';
import { sfx } from '../utils/sound';

/** Cosmetic-only shop. Currency: syrup drops. Physics never changes. */
export class ShopScene extends Phaser.Scene {
  private listContainer!: Phaser.GameObjects.Container;
  private syrupText!: Phaser.GameObjects.Text;
  private kind: ShopItem['kind'] = 'pancake';

  constructor() {
    super('Shop');
  }

  create(): void {
    const cx = GAME.WIDTH / 2;
    this.cameras.main.setBackgroundColor('#FFF3D6');
    titleText(this, cx, 110, 'Shop', 64);
    this.syrupText = bodyText(this, cx, 175, '', 30, '#B7791F');

    const kinds: { id: ShopItem['kind']; label: string }[] = [
      { id: 'pancake', label: '🥞 Cakes' },
      { id: 'pan', label: '🍳 Pans' },
      { id: 'plate', label: '🍽️ Plates' },
      { id: 'bg', label: '🎨 Scenes' },
    ];
    kinds.forEach((k, i) => {
      makeButton(this, 110 + i * 195, 245, k.label, {
        width: 180, height: 58, fontSize: 22, fill: 0x8a5a2b,
        onTap: () => { sfx.click(); this.kind = k.id; this.renderList(); },
      });
    });

    this.listContainer = this.add.container(0, 0);
    this.renderList();

    makeButton(this, cx, 1180, '← Back', {
      width: 280, height: 72, fill: 0x8a5a2b,
      onTap: () => { sfx.click(); this.scene.start('Title'); },
    });
    bodyText(this, cx, 1240, 'Skins are cosmetic only — physics is identical for everyone.', 19);
  }

  private renderList(): void {
    this.listContainer.removeAll(true);
    const profile = loadProfile();
    this.syrupText.setText(`🍯 ${profile.syrup} syrup`);
    const items = SHOP_ITEMS.filter((i) => i.kind === this.kind);
    items.forEach((item, idx) => {
      const y = 350 + idx * 128;
      const owned = profile.owned.includes(item.id);
      const equipped = profile.equipped[item.kind] === item.id;
      const row = this.add.container(0, 0);
      const bg = this.add.graphics();
      bg.fillStyle(equipped ? 0xffe1a8 : 0xfffaf0, 1);
      bg.fillRoundedRect(50, y - 52, GAME.WIDTH - 100, 104, 16);
      bg.lineStyle(2, 0xe8d9b8, 1);
      bg.strokeRoundedRect(50, y - 52, GAME.WIDTH - 100, 104, 16);
      row.add(bg);
      // Preview swatch
      if (item.kind === 'pancake' && item.textureTop) {
        const img = this.add.image(120, y, item.textureTop).setDisplaySize(96, 26);
        row.add(img);
      } else {
        const sw = this.add.graphics();
        sw.fillStyle(item.tint ?? item.bgColors?.bandB ?? 0xf2b544, 1);
        sw.fillRoundedRect(78, y - 18, 84, 36, 10);
        row.add(sw);
      }
      const name = this.add.text(185, y - 16, item.name, { fontFamily: FONT, fontSize: '27px', color: '#4A2C14', fontStyle: 'bold' });
      const sub = this.add.text(185, y + 16, equipped ? 'Equipped' : owned ? 'Owned' : `${item.price} 🍯`, { fontFamily: FONT, fontSize: '22px', color: '#8a6d3b' });
      row.add([name, sub]);
      if (!equipped) {
        const btnLabel = owned ? 'Equip' : profile.syrup >= item.price ? 'Buy' : 'Need 🍯';
        const canAct = owned || profile.syrup >= item.price;
        const btn = makeButton(this, GAME.WIDTH - 165, y, btnLabel, {
          width: 150, height: 56, fontSize: 23, fill: canAct ? 0xff8c42 : 0xbdbdbd,
          onTap: () => this.buyOrEquip(item),
        });
        row.add(btn);
      }
      this.listContainer.add(row);
    });
  }

  private buyOrEquip(item: ShopItem): void {
    const profile = loadProfile();
    if (!profile.owned.includes(item.id)) {
      if (profile.syrup < item.price) return;
      profile.syrup -= item.price;
      profile.owned.push(item.id);
      track('shop_purchase', { item: item.id, price: item.price });
    }
    profile.equipped[item.kind] = item.id;
    saveProfile(profile);
    sfx.plop(true, 2);
    void shopItem;
    this.renderList();
  }
}
