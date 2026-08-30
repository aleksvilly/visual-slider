export type AttributeKey = string;

export interface AttributeDefinition {
  key: AttributeKey;
  label: string;
  lowLabel: string;
  highLabel: string;
  defaultValue: number;
  weight?: number;
}

export interface CategoryDefinition {
  id: string;
  name: string;
  eyebrow: string;
  description: string;
  attributes: AttributeDefinition[];
}

export interface CatalogItem {
  id: string;
  categoryId: string;
  title: string;
  creator?: string;
  sourceSite: string;
  sourceUrl: string;
  imageUrl: string;
  priceLabel?: string;
  buyable?: boolean;
  note?: string;
  attributes: Record<AttributeKey, number>;
}

export interface RankedItem {
  item: CatalogItem;
  score: number;
}

export type Preferences = Record<AttributeKey, number>;
