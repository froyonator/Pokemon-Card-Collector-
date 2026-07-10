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

export interface CardPricing {
  cardId: string;
  cardmarketEurAvg: number | null;
  tcgplayerUsdMarket: number | null;
  fetchedAt: string;
}

export type Condition =
  | 'Mint'
  | 'Near Mint'
  | 'Lightly Played'
  | 'Moderately Played'
  | 'Heavily Played'
  | 'Damaged';

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

export type BinderSlotEntry =
  | { type: 'pokemon'; dexNumber: number }
  | { type: 'blank' };

export interface BinderConfig {
  rows: number;
  columns: number;
  pageCount: number;
  fillDirection: BinderFillDirection;
}

export type Currency = 'USD' | 'EUR' | 'AUD' | 'GBP' | 'CAD';

export const CURRENCIES: Currency[] = ['USD', 'EUR', 'AUD', 'GBP', 'CAD'];

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
