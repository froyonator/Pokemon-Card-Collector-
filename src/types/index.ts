export type RarityTier = string;

export interface CardRecord {
  id: string;
  name: string;
  dexNumber: number;
  setId: string;
  setName: string;
  localId: string;
  rarity: RarityTier;
  imageBase: string;
  language: string;
}

export type Condition =
  'Mint' | 'Near Mint' | 'Lightly Played' | 'Moderately Played' | 'Heavily Played' | 'Damaged';

export const CONDITIONS: Condition[] = [
  'Mint',
  'Near Mint',
  'Lightly Played',
  'Moderately Played',
  'Heavily Played',
  'Damaged',
];

export interface OwnedRecord {
  dexNumber: number;
  cardId: string;
  condition: Condition;
  addedAt: string;
}

export interface WishlistRecord {
  dexNumber: number;
  cardId: string;
  addedAt: string;
}

export interface RarityGroup {
  id: string;
  name: string;
  rarities: RarityTier[];
}

export type BinderFillDirection = 'horizontal' | 'vertical';

export interface CustomSlotImage {
  // The ORIGINAL uploaded image, not a pre-cropped raster -- storing the
  // crop as a separate transform (offsetX/offsetY/zoom) instead of baking it
  // into the pixels lets the user re-open the editor and adjust the crop
  // later without any quality loss, and lets a future print-size export
  // re-render the crop at full resolution from the original source.
  dataUri: string;
  // Pan offset as a fraction of the image's own width/height (0 = centered
  // on that axis), not raw pixels -- keeps the transform independent of
  // whatever size the image happens to be uploaded at.
  offsetX: number;
  offsetY: number;
  zoom: number;
}

export type BinderSlotEntry =
  | { type: 'pokemon'; dexNumber: number }
  | { type: 'blank'; customImage?: CustomSlotImage };

export interface BinderConfig {
  rows: number;
  columns: number;
  pageCount: number;
  fillDirection: BinderFillDirection;
}

export interface Binder {
  id: string;
  name: string;
  language: string;
  config: BinderConfig;
  customOrder: BinderSlotEntry[] | null;
}

export interface Language {
  code: string;
  label: string;
}

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: 'en', label: 'English' },
  { code: 'ja', label: 'Japanese' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'es', label: 'Spanish' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'pl', label: 'Polish' },
  { code: 'ru', label: 'Russian' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh-tw', label: 'Chinese (Traditional)' },
  { code: 'zh-cn', label: 'Chinese (Simplified)' },
  { code: 'id', label: 'Indonesian' },
  { code: 'th', label: 'Thai' },
];
