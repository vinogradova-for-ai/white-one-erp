export type BoardCard = {
  id: string;
  name: string;
  brandLabel: string;
  category: string;
  photo: string | null;
  photos: string[];
  statusLabel: string;
  statusDot: string;
  colorChips: Array<{ name: string; hex: string }>;
  x: number | null;
  y: number | null;
  w: number | null;
  h: number | null;
  z: number | null;
};

export type ItemType = "TEXT" | "STICKY" | "IMAGE";

export type BoardItemData = {
  id: string;
  type: ItemType;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  text: string | null;
  color: string | null;
  fontSize: number | null;
  fontWeight: number | null;
  align: "left" | "center" | "right" | null;
  fontFamily: string | null;
  imageUrl: string | null;
};

export type Geom = { x: number; y: number; w: number; h: number; z: number };
export type El = {
  key: string;
  kind: "card" | "item";
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  // card
  card?: BoardCard;
  // item
  type?: ItemType;
  text?: string | null;
  color?: string | null;
  fontSize?: number | null;
  fontWeight?: number | null;
  align?: "left" | "center" | "right" | null;
  fontFamily?: string | null;
  imageUrl?: string | null;
};
export type View = { scale: number; tx: number; ty: number };
