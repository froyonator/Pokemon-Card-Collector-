import type { Currency, OwnedRecord, RarityGroup, WishlistRecord } from '../types';
import type { ExportedUserData } from './store';
import { DEFAULT_CARD_OVERRIDES } from '../data/defaultCardOverrides';

export type { ExportedUserData } from './store';

export interface ExportableState {
  language: string;
  currency: Currency;
  activeGroupIds: string[];
  groups: RarityGroup[];
  owned: Record<number, OwnedRecord>;
  wishlist: Record<number, WishlistRecord>;
  selectedGenerations: number[];
  cardOverrides: Record<string, string>;
  uploadedImages: Record<string, string>;
}

export function buildExportPayload(state: ExportableState): ExportedUserData {
  return {
    version: 1,
    language: state.language,
    currency: state.currency,
    activeGroupIds: state.activeGroupIds,
    groups: state.groups,
    owned: state.owned,
    wishlist: state.wishlist,
    selectedGenerations: state.selectedGenerations,
    cardOverrides: state.cardOverrides,
    uploadedImages: state.uploadedImages,
  };
}

export function exportFileName(date: Date): string {
  const iso = date.toISOString().slice(0, 10);
  return `pokemon-collection-export-${iso}.json`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isValidGroups(value: unknown): value is RarityGroup[] {
  return (
    Array.isArray(value) &&
    value.every(
      (group) =>
        isPlainObject(group) &&
        typeof group.id === 'string' &&
        typeof group.name === 'string' &&
        isStringArray(group.rarities)
    )
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isPlainObject(value) && Object.values(value).every((v) => typeof v === 'string');
}

export function parseImportPayload(raw: string): ExportedUserData {
  const data = JSON.parse(raw);
  if (data.version !== 1) {
    throw new Error('Unsupported export file version.');
  }
  if (typeof data.language !== 'string' || typeof data.currency !== 'string') {
    throw new Error('This file does not look like a valid export.');
  }
  // Shape-check the fields that get written straight into app state by
  // replaceUserData with no further guard downstream (e.g. ManageGroupsPanel
  // does `group.rarities.includes(...)` unconditionally). Rejecting a
  // malformed file here, at the one validation/normalization boundary for
  // import data, surfaces a clear error where the user can self-correct,
  // instead of a confusing crash later in an unrelated screen. This
  // intentionally does not validate every OwnedRecord/WishlistRecord field
  // (e.g. exact Condition enum values) — that's diminishing returns beyond
  // the structural shape checked here.
  if (
    !isStringArray(data.activeGroupIds) ||
    !isValidGroups(data.groups) ||
    !isPlainObject(data.owned) ||
    !isPlainObject(data.wishlist)
  ) {
    throw new Error('This file does not look like a valid export.');
  }
  // Backups exported before multi-generation support existed predate this
  // field entirely. Those files only ever covered Gen 1, so default rather
  // than reject an otherwise-valid older backup, consistent with this
  // function's existing role as the one validation/normalization boundary
  // for import data.
  if (!Array.isArray(data.selectedGenerations)) {
    data.selectedGenerations = [1];
  }
  // Backups exported before this feature existed predate this field
  // entirely. Default to the same seeded defaults a fresh install or an
  // existing user's rehydrated localStorage gets (DEFAULT_CARD_OVERRIDES),
  // not an empty map: this mirrors what selectedGenerations does above,
  // where the default ([1]) matches the store's own fresh-user default
  // exactly. An empty map would silently strip hand-verified
  // classifications (e.g. svp-044) from a user who imports an old backup,
  // while a user who never imports anything keeps them, an inconsistency
  // this default is here to avoid. If the field IS present, it must
  // actually be a card id -> group id string map, not some other shape.
  // This is a plain user-data mapping with no further downstream guard,
  // same reasoning as the other shape checks above.
  if (data.cardOverrides === undefined) {
    data.cardOverrides = DEFAULT_CARD_OVERRIDES;
  } else if (!isStringRecord(data.cardOverrides)) {
    throw new Error('This file does not look like a valid export.');
  }
  // Backups exported before this feature existed predate this field
  // entirely. Unlike cardOverrides, there is no seed data to fall back to
  // here, so default to an empty map rather than any pre-populated set.
  // If the field IS present, it must actually be a card id -> data URI
  // string map, not some other shape, same reasoning as the other shape
  // checks above.
  if (data.uploadedImages === undefined) {
    data.uploadedImages = {};
  } else if (!isStringRecord(data.uploadedImages)) {
    throw new Error('This file does not look like a valid export.');
  }
  return data as ExportedUserData;
}
