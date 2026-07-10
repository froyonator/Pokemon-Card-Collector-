import type { CardRecord } from '../types';

// Points the user at TCGplayer's own site search for a card TCGdex has no
// image for, so they can find and verify the right image themselves. Built
// from the card's own name and its LOCAL card number (its position within
// its own set, e.g. "044"), plus its set name -- the set name adds
// disambiguating context beyond the bare local number, since something like
// "044" alone appears in dozens of unrelated sets. Deliberately not the
// Pokemon's national dex number, which has nothing to do with identifying
// one specific printed card.
//
// Kept out of Picker.tsx (its only caller) in its own module rather than
// exported alongside the Picker component: a plain function export
// alongside a component export in the same file breaks React Fast Refresh
// (see the react-refresh/only-export-components lint rule), and this is
// also directly independently unit-testable this way, as intended.
export function buildTcgplayerSearchUrl(
  card: Pick<CardRecord, 'name' | 'localId' | 'setName'>
): string {
  const query = `${card.name} ${card.localId} ${card.setName}`;
  return `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(query)}`;
}
