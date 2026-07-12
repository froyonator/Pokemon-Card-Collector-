import type { CardRecord } from './parseCardDetail';

export function validateCardRecord(
  record: CardRecord,
  expected: { cardId: string; setId: string }
): string[] {
  const errors: string[] = [];

  if (record.cardId !== expected.cardId) errors.push('card id does not match the requested card');
  if (!record.name) errors.push('name is missing');
  if (!record.supertype) errors.push('supertype is missing');
  if (record.hp !== null && (!Number.isInteger(record.hp) || record.hp <= 0)) {
    errors.push('hp is invalid');
  }
  if (!record.expansionName) errors.push('expansion name is missing');
  if (record.expansionId !== expected.setId)
    errors.push('expansion id does not match the requested set');
  if (!record.cardNumber) errors.push('card number is missing');

  let imageUrl: URL | null = null;
  try {
    imageUrl = new URL(record.imageUrl);
  } catch {
    errors.push('image URL is invalid');
  }
  if (imageUrl && imageUrl.protocol !== 'https:') errors.push('image URL must use HTTPS');

  return errors;
}
