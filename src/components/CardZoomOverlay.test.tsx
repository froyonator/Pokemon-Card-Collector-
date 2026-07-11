import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CardZoomOverlay } from './CardZoomOverlay';
import type { CardRecord } from '../types';

const card: CardRecord = {
  id: 'sv03.5-199',
  name: 'Charizard ex',
  dexNumber: 6,
  setId: 'sv03.5',
  setName: '151',
  localId: '199',
  rarity: 'Special illustration rare',
  imageBase: 'https://assets.tcgdex.net/en/sv/sv03.5/199',
  language: 'en',
};

const noImageCard: CardRecord = {
  ...card,
  id: 'noimage-001',
  imageBase: '',
};

describe('CardZoomOverlay', () => {
  it('renders card.hostedFullUrl instead of the live-API-constructed URL when present', () => {
    const hostedCard: CardRecord = {
      ...card,
      hostedFullUrl: 'https://raw.githubusercontent.com/example/repo/main/en/sv03.5/199/original.webp',
    };
    render(<CardZoomOverlay card={hostedCard} uploadedImageUri={undefined} onClose={() => {}} />);
    expect(screen.getByAltText(/charizard ex from 151/i)).toHaveAttribute(
      'src',
      'https://raw.githubusercontent.com/example/repo/main/en/sv03.5/199/original.webp'
    );
  });

  it('renders exactly as before (the live-API-constructed URL) when a card has no hostedFullUrl', () => {
    render(<CardZoomOverlay card={card} uploadedImageUri={undefined} onClose={() => {}} />);
    expect(screen.getByAltText(/charizard ex from 151/i)).toHaveAttribute(
      'src',
      'https://assets.tcgdex.net/en/sv/sv03.5/199/high.png'
    );
  });

  it('renders the card image large', () => {
    render(
      <CardZoomOverlay card={card} uploadedImageUri={undefined} onClose={() => {}} />
    );
    const img = screen.getByAltText(/charizard ex from 151/i);
    expect(img).toHaveAttribute(
      'src',
      'https://assets.tcgdex.net/en/sv/sv03.5/199/high.png'
    );
  });

  it('names the dialog after the card', () => {
    render(
      <CardZoomOverlay card={card} uploadedImageUri={undefined} onClose={() => {}} />
    );
    expect(screen.getByRole('dialog', { name: 'Charizard ex enlarged' })).toBeInTheDocument();
  });

  it('clicking the backdrop closes the overlay', async () => {
    const onClose = vi.fn();
    render(<CardZoomOverlay card={card} uploadedImageUri={undefined} onClose={onClose} />);
    await userEvent.click(screen.getByRole('dialog', { name: 'Charizard ex enlarged' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking the card itself does not close the overlay', async () => {
    const onClose = vi.fn();
    render(<CardZoomOverlay card={card} uploadedImageUri={undefined} onClose={onClose} />);
    await userEvent.click(screen.getByAltText(/charizard ex from 151/i));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('pressing Escape closes the overlay', async () => {
    const onClose = vi.fn();
    render(<CardZoomOverlay card={card} uploadedImageUri={undefined} onClose={onClose} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stops listening for Escape after unmount', async () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <CardZoomOverlay card={card} uploadedImageUri={undefined} onClose={onClose} />
    );
    unmount();
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('the close button calls onClose', async () => {
    const onClose = vi.fn();
    render(<CardZoomOverlay card={card} uploadedImageUri={undefined} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders the uploaded image instead of the placeholder when the card has no real image', () => {
    render(
      <CardZoomOverlay
        card={noImageCard}
        uploadedImageUri="data:image/jpeg;base64,ABC123"
        onClose={() => {}}
      />
    );
    const img = screen.getByAltText(/charizard ex from 151/i);
    expect(img).toHaveAttribute('src', 'data:image/jpeg;base64,ABC123');
    expect(screen.queryByText(/no image available/i)).not.toBeInTheDocument();
  });

  it('renders the "no image available" placeholder when there is no real image and no uploaded image', () => {
    render(
      <CardZoomOverlay card={noImageCard} uploadedImageUri={undefined} onClose={() => {}} />
    );
    expect(screen.getByText(/no image available/i)).toBeInTheDocument();
  });
});
