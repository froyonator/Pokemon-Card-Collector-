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

export function parseImportPayload(raw: string): ExportedUserData {
  const data = JSON.parse(raw);
  if (data.version !== 1) {
    throw new Error('Unsupported export file version.');
  }
  if (typeof data.language !== 'string' || typeof data.currency !== 'string') {
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
