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
  // Optional: only present when the static database build resolved a better
  // hosted image than imageBase's own live-API-derived one (see the card
  // asset resolver used by that build step). Undefined for every card built
  // before this field existed, and for every card the resolver had nothing
  // better to offer, so any existing caller ignoring these two fields keeps
  // working unchanged.
  hostedThumbUrl?: string;
  hostedFullUrl?: string;
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

// How a binder's physical cover looks on the shelf (and anywhere else the
// closed binder is drawn). Every field is cosmetic and optional-with-
// defaults, so binders saved before this existed (or imported from older
// backups) render fine with no migration: a missing cover just means the
// default leather.
export interface BinderCover {
  // The leather color, one of the preset swatches in BinderSettings (any
  // CSS color string is accepted for forward compatibility).
  color?: string;
  // Short label lettered down the spine, like a real labeled binder.
  spineText?: string;
  // A picture mounted on the front cover (data URI, same storage approach
  // as uploadedImages).
  coverImageUri?: string;
}

export interface Binder {
  id: string;
  name: string;
  language: string;
  config: BinderConfig;
  customOrder: BinderSlotEntry[] | null;
  cover?: BinderCover;
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
