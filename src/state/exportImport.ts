import type { Currency, OwnedRecord, RarityGroup, WishlistRecord } from '../types';
import type { ExportedUserData } from './store';

export type { ExportedUserData } from './store';

export interface ExportableState {
  language: string;
  currency: Currency;
  activeGroupIds: string[];
  groups: RarityGroup[];
  owned: Record<number, OwnedRecord>;
  wishlist: Record<number, WishlistRecord>;
  selectedGenerations: number[];
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
  return data as ExportedUserData;
}
