/** Cosmetic shop data. EVERY skin uses identical physics — fairness rule. */
export interface ShopItem {
  id: string;
  name: string;
  kind: 'pan' | 'pancake' | 'plate' | 'bg';
  price: number; // syrup
  /** Texture key for pancake skins (top face); tint for pan/plate; theme for bg. */
  textureTop?: string;
  textureBottom?: string;
  tint?: number;
  bgColors?: { sky: string; bandA: number; bandB: number };
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: 'pan_classic', name: 'Classic Pan', kind: 'pan', price: 0 },
  { id: 'pan_castiron', name: 'Cast Iron', kind: 'pan', price: 40, tint: 0x8a8f9c },
  { id: 'pan_wok', name: 'Wok', kind: 'pan', price: 60, tint: 0x5a4632 },
  { id: 'pan_griddle', name: 'Griddle', kind: 'pan', price: 80, tint: 0xb08954 },
  { id: 'pan_gold', name: 'Gold Pan', kind: 'pan', price: 200, tint: 0xffd34d },
  { id: 'pancake_buttermilk', name: 'Buttermilk', kind: 'pancake', price: 0, textureTop: 'pancake_top', textureBottom: 'pancake_bottom' },
  { id: 'pancake_blueberry', name: 'Blueberry', kind: 'pancake', price: 50, textureTop: 'pancake_top_blueberry', textureBottom: 'pancake_bottom_blueberry' },
  { id: 'pancake_chocolate', name: 'Chocolate Chip', kind: 'pancake', price: 50, textureTop: 'pancake_top_chocolate', textureBottom: 'pancake_bottom_chocolate' },
  { id: 'pancake_waffle', name: 'Waffle', kind: 'pancake', price: 90, textureTop: 'pancake_top_waffle', textureBottom: 'pancake_bottom_waffle' },
  { id: 'pancake_redvelvet', name: 'Red Velvet', kind: 'pancake', price: 120, textureTop: 'pancake_top_redvelvet', textureBottom: 'pancake_bottom_redvelvet' },
  { id: 'plate_diner', name: 'Diner Plate', kind: 'plate', price: 0 },
  { id: 'plate_blue', name: 'Blue Plate', kind: 'plate', price: 30, tint: 0xaac8ff },
  { id: 'plate_gold', name: 'Gold Plate', kind: 'plate', price: 150, tint: 0xffe08a },
  { id: 'bg_diner', name: 'Diner', kind: 'bg', price: 0, bgColors: { sky: '#FFF3D6', bandA: 0xfff3d6, bandB: 0xffecc4 } },
  { id: 'bg_campfire', name: 'Campfire', kind: 'bg', price: 70, bgColors: { sky: '#FFE3C2', bandA: 0xffe3c2, bandB: 0xffd3a1 } },
  { id: 'bg_space', name: 'Space Station', kind: 'bg', price: 130, bgColors: { sky: '#DCE9FF', bandA: 0xdce9ff, bandB: 0xc4d9fb } },
  { id: 'bg_grandma', name: "Grandma's Kitchen", kind: 'bg', price: 100, bgColors: { sky: '#FDEBD2', bandA: 0xfdebd2, bandB: 0xf7dcb9 } },
];

export function shopItem(id: string): ShopItem | undefined {
  return SHOP_ITEMS.find((i) => i.id === id);
}
