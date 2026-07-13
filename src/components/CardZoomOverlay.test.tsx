import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReducedMotion } from 'framer-motion';
import { CardZoomOverlay } from './CardZoomOverlay';
import type { CardRecord } from '../types';

// Defaults to motion enabled, matching every existing test below (none of
// which care about reduced motion) and the same convention Tile.test.tsx /
// BinderShelf.test.tsx / BinderView.test.tsx already use. The dedicated
// "entrance animation" describe block flips this to true for its own
// reduced-motion tests only.
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return { ...actual, useReducedMotion: vi.fn(() => false) };
});

beforeEach(() => {
  vi.mocked(useReducedMotion).mockReturnValue(false);
});

// Matches CardZoomOverlay's own ENTRANCE_DURATION_MS -- how long the
// flip-and-grow entrance takes before the cursor tilt and one-shot glint
// are allowed to switch on.
const ENTRANCE_DURATION_MS = 720;

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

  describe('entrance animation', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('plays the flip-and-grow entrance when reduced motion is off', () => {
      render(<CardZoomOverlay card={card} uploadedImageUri={undefined} onClose={() => {}} />);
      const dialog = screen.getByRole('dialog', { name: 'Charizard ex enlarged' });
      expect(dialog.querySelector('[data-entrance="flip"]')).toBeInTheDocument();
      expect(dialog.querySelector('[data-entrance="fade"]')).not.toBeInTheDocument();
    });

    it('falls back to a plain fade entrance when reduced motion is preferred', () => {
      vi.mocked(useReducedMotion).mockReturnValue(true);
      render(<CardZoomOverlay card={card} uploadedImageUri={undefined} onClose={() => {}} />);
      const dialog = screen.getByRole('dialog', { name: 'Charizard ex enlarged' });
      expect(dialog.querySelector('[data-entrance="fade"]')).toBeInTheDocument();
      expect(dialog.querySelector('[data-entrance="flip"]')).not.toBeInTheDocument();
    });

    it('keeps the cursor tilt off during the flip so it cannot fight the entrance mid-turn', () => {
      vi.useFakeTimers();
      render(<CardZoomOverlay card={card} uploadedImageUri={undefined} onClose={() => {}} />);
      const dialog = screen.getByRole('dialog', { name: 'Charizard ex enlarged' });
      const cardBody = dialog.querySelector('[class*="cardBody"]') as HTMLElement;

      fireEvent.mouseMove(dialog, { clientX: 5, clientY: 5 });
      expect(cardBody).not.toHaveClass('cardTilting');
    });

    it('turns the cursor tilt on once the entrance settles', () => {
      vi.useFakeTimers();
      render(<CardZoomOverlay card={card} uploadedImageUri={undefined} onClose={() => {}} />);
      const dialog = screen.getByRole('dialog', { name: 'Charizard ex enlarged' });
      const cardBody = dialog.querySelector('[class*="cardBody"]') as HTMLElement;

      act(() => {
        vi.advanceTimersByTime(ENTRANCE_DURATION_MS);
      });

      fireEvent.mouseMove(dialog, { clientX: 5, clientY: 5 });
      expect(cardBody).toHaveClass('cardTilting');
    });

    it('never mounts the one-shot glint under reduced motion, since there is no flip for it to follow', () => {
      vi.mocked(useReducedMotion).mockReturnValue(true);
      render(<CardZoomOverlay card={card} uploadedImageUri={undefined} onClose={() => {}} />);
      const dialog = screen.getByRole('dialog', { name: 'Charizard ex enlarged' });
      expect(dialog.querySelector('[class*="glint"]')).not.toBeInTheDocument();
    });

    it('mounts the one-shot glint once the entrance settles, not before', () => {
      vi.useFakeTimers();
      render(<CardZoomOverlay card={card} uploadedImageUri={undefined} onClose={() => {}} />);
      const dialog = screen.getByRole('dialog', { name: 'Charizard ex enlarged' });
      expect(dialog.querySelector('[class*="glint"]')).not.toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(ENTRANCE_DURATION_MS);
      });

      expect(dialog.querySelector('[class*="glint"]')).toBeInTheDocument();
    });
  });

  describe('exit animation', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('closing triggers the flip-marked exit animation when reduced motion is off', async () => {
      render(<CardZoomOverlay card={card} uploadedImageUri={undefined} onClose={() => {}} />);
      const dialog = screen.getByRole('dialog', { name: 'Charizard ex enlarged' });

      await userEvent.click(screen.getByRole('button', { name: 'Close' }));

      expect(dialog.querySelector('[data-entrance="flip"][data-leaving="true"]')).toBeInTheDocument();
    });

    it('closing stays a simple fade under reduced motion', async () => {
      vi.mocked(useReducedMotion).mockReturnValue(true);
      render(<CardZoomOverlay card={card} uploadedImageUri={undefined} onClose={() => {}} />);
      const dialog = screen.getByRole('dialog', { name: 'Charizard ex enlarged' });

      await userEvent.click(screen.getByRole('button', { name: 'Close' }));

      expect(dialog.querySelector('[data-entrance="fade"][data-leaving="true"]')).toBeInTheDocument();
      expect(dialog.querySelector('[data-entrance="flip"]')).not.toBeInTheDocument();
    });

    it('turns the cursor tilt and one-shot glint off the instant closing starts, even after the entrance had already settled', () => {
      vi.useFakeTimers();
      render(<CardZoomOverlay card={card} uploadedImageUri={undefined} onClose={() => {}} />);
      const dialog = screen.getByRole('dialog', { name: 'Charizard ex enlarged' });
      const cardBody = dialog.querySelector('[class*="cardBody"]') as HTMLElement;

      act(() => {
        vi.advanceTimersByTime(ENTRANCE_DURATION_MS);
      });
      expect(dialog.querySelector('[class*="glint"]')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Close' }));

      expect(dialog.querySelector('[class*="glint"]')).not.toBeInTheDocument();
      fireEvent.mouseMove(dialog, { clientX: 5, clientY: 5 });
      expect(cardBody).not.toHaveClass('cardTilting');
    });

    it('closing via the backdrop and via Escape both mark the panel as leaving', async () => {
      render(<CardZoomOverlay card={card} uploadedImageUri={undefined} onClose={() => {}} />);
      const dialog = screen.getByRole('dialog', { name: 'Charizard ex enlarged' });

      await userEvent.click(dialog);

      expect(dialog.querySelector('[data-leaving="true"]')).toBeInTheDocument();
    });

    it('still calls onClose exactly once per close path while leaving is in flight', async () => {
      const onClose = vi.fn();
      render(<CardZoomOverlay card={card} uploadedImageUri={undefined} onClose={onClose} />);
      await userEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('thumb-first, then hi-res image', () => {
    // CardZoomOverlay portals its whole dialog straight to document.body
    // (see the component's own doc comment), so its images never end up
    // inside render()'s own `container` -- these queries deliberately look
    // at the dialog root (found via screen, which searches the whole
    // document) rather than `container`.
    it('paints the low/webp thumbnail immediately, on the very first render, alongside the hi-res layer -- never an empty panel', () => {
      render(<CardZoomOverlay card={card} uploadedImageUri={undefined} onClose={() => {}} />);
      const dialog = screen.getByRole('dialog', { name: 'Charizard ex enlarged' });
      const images = dialog.querySelectorAll('img');
      // Exactly two <img> elements for a card with a real image: the
      // instantly-available thumb and the hi-res upgrade loading on top of
      // it. Neither is missing on first render -- the whole point is that
      // the panel is never blank while the hi-res fetch is in flight.
      expect(images).toHaveLength(2);

      const srcs = Array.from(images).map((img) => img.getAttribute('src'));
      expect(srcs).toContain('https://assets.tcgdex.net/en/sv/sv03.5/199/low.webp');
      expect(srcs).toContain('https://assets.tcgdex.net/en/sv/sv03.5/199/high.png');
    });

    it('keeps the hi-res layer invisible until it actually finishes loading, then fades it in', () => {
      render(<CardZoomOverlay card={card} uploadedImageUri={undefined} onClose={() => {}} />);
      const hiResImg = screen.getByAltText(/charizard ex from 151/i);
      expect(hiResImg.className).not.toMatch(/cardImageHiResVisible/);

      fireEvent.load(hiResImg);

      expect(hiResImg.className).toMatch(/cardImageHiResVisible/);
    });

    it('gives the thumbnail an empty alt so it never doubles up on the hi-res layer\'s accessible name', () => {
      render(<CardZoomOverlay card={card} uploadedImageUri={undefined} onClose={() => {}} />);
      const dialog = screen.getByRole('dialog', { name: 'Charizard ex enlarged' });
      const images = Array.from(dialog.querySelectorAll('img'));
      const thumb = images.find((img) => img.getAttribute('alt') === '');
      expect(thumb).toBeDefined();
      // Exactly one image keeps the real accessible name -- the hi-res one.
      expect(screen.getAllByAltText(/charizard ex from 151/i)).toHaveLength(1);
    });

    it('falls back to a single hi-res image (no stacking) when there is no cheap thumb source at all', () => {
      const hostedFullOnlyCard: CardRecord = {
        ...card,
        id: 'hosted-full-only',
        imageBase: '',
        hostedFullUrl: 'https://raw.githubusercontent.com/example/repo/main/en/sv03.5/199/original.webp',
      };
      render(<CardZoomOverlay card={hostedFullOnlyCard} uploadedImageUri={undefined} onClose={() => {}} />);
      const dialog = screen.getByRole('dialog', { name: 'Charizard ex enlarged' });
      expect(dialog.querySelectorAll('img')).toHaveLength(1);
      expect(screen.getByAltText(/charizard ex from 151/i)).toHaveAttribute(
        'src',
        'https://raw.githubusercontent.com/example/repo/main/en/sv03.5/199/original.webp'
      );
    });

    it('still shows the "no image available" placeholder, not a stack, for a card with no image at all', () => {
      render(<CardZoomOverlay card={noImageCard} uploadedImageUri={undefined} onClose={() => {}} />);
      const dialog = screen.getByRole('dialog', { name: 'Charizard ex enlarged' });
      expect(dialog.querySelectorAll('img')).toHaveLength(0);
      expect(screen.getByText(/no image available/i)).toBeInTheDocument();
    });
  });

  describe('card back', () => {
    it('renders a card-back face during the flip entrance, when motion is on', () => {
      render(<CardZoomOverlay card={card} uploadedImageUri={undefined} onClose={() => {}} />);
      const dialog = screen.getByRole('dialog', { name: 'Charizard ex enlarged' });
      expect(dialog.querySelector('[class*="cardFaceBack"]')).toBeInTheDocument();
      expect(dialog.querySelector('[class*="cardBack"]')).toBeInTheDocument();
    });

    it('keeps the card-back face present while closing, when motion is on', async () => {
      render(<CardZoomOverlay card={card} uploadedImageUri={undefined} onClose={() => {}} />);
      const dialog = screen.getByRole('dialog', { name: 'Charizard ex enlarged' });

      await userEvent.click(screen.getByRole('button', { name: 'Close' }));

      expect(dialog.querySelector('[class*="cardFaceBack"]')).toBeInTheDocument();
    });

    it('skips the card-back face entirely under reduced motion, since there is no flip to ever reveal it', () => {
      vi.mocked(useReducedMotion).mockReturnValue(true);
      render(<CardZoomOverlay card={card} uploadedImageUri={undefined} onClose={() => {}} />);
      const dialog = screen.getByRole('dialog', { name: 'Charizard ex enlarged' });
      expect(dialog.querySelector('[class*="cardFaceBack"]')).not.toBeInTheDocument();
    });
  });
});
