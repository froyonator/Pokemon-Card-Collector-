import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Picker } from './Picker';
import { useAppStore } from '../state/store';
import { DEFAULT_RARITY_GROUPS } from '../data/defaultRarityGroups';
import { resizeImageForUpload } from '../state/imageResize';
import { buildTcgplayerSearchUrl } from '../state/tcgplayerSearch';
import type { CardRecord } from '../types';

// Wraps the real resizeImageForUpload in a vi.fn so most tests below never
// touch it (Picker only calls it from onUploadImage, which most tests here
// never trigger), while the upload-specific test further down swaps in a
// resolved value directly -- avoiding driving the real canvas-based resize,
// which jsdom cannot exercise (see src/state/imageResize.ts).
vi.mock('../state/imageResize', () => ({
  resizeImageForUpload: vi.fn(),
}));

// Fully mocked to "no static data": "Show all cards" now enriches its live
// results from the static database (see loadCardData's enrichFromStatic),
// which would otherwise issue its own data/cards/<language>.json fetch
// through the same global fetch several tests here stub and assert against.
// Null keeps every fetch these tests observe a live-API fetch, exactly as
// before enrichment existed.
vi.mock('../api/staticDatabase', () => ({
  loadStaticCardData: vi.fn(async () => null),
}));

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

const cardA: CardRecord = {
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

const cardB: CardRecord = {
  ...cardA,
  id: 'sv03-223',
  setId: 'sv03',
  setName: 'Obsidian Flames',
  localId: '223',
};

function resetStore() {
  useAppStore.setState({
    language: 'en',
    activeGroupIds: DEFAULT_RARITY_GROUPS.map((g) => g.id),
    groups: DEFAULT_RARITY_GROUPS,
    owned: {},
    wishlist: {},
    selectedGenerations: [1],
    cardOverrides: {},
    uploadedImages: {},
    hasUnsavedChanges: false,
  });
}

beforeEach(() => {
  // "Show all cards" persists a durable "already fetched" flag to
  // localStorage (see hasFullPrintHistory in src/storage/cardCache.ts), on
  // purpose: it needs to survive a Picker remount. But that also means it
  // survives across tests in this file unless cleared here, since several
  // tests below toggle "show all" for the same dexNumber=6/language='en'
  // combination with their own distinct fetch mocks.
  localStorage.clear();
  resetStore();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(resizeImageForUpload).mockReset();
});

describe('Picker', () => {
  it('shows a message when there are no matching cards', () => {
    render(<Picker dexNumber={11} pokemonName="Metapod" cards={[]} onClose={() => {}} />);
    expect(screen.getByText(/no special or full art cards match/i)).toBeInTheDocument();
  });

  it('stars a card to add it to the wishlist', async () => {
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /add charizard ex to wishlist/i }));
    expect(useAppStore.getState().wishlist[6]).toMatchObject({ cardId: cardA.id });
  });

  it('warns instead of switching when a second card is starred for the same dex number', async () => {
    render(
      <Picker dexNumber={6} pokemonName="Charizard" cards={[cardA, cardB]} onClose={() => {}} />
    );
    const stars = screen.getAllByRole('button', { name: /add charizard ex to wishlist/i });
    await userEvent.click(stars[0]);
    const starsAfter = screen.getAllByRole('button', { name: /add charizard ex to wishlist/i });
    await userEvent.click(starsAfter[starsAfter.length - 1]);
    expect(screen.getByRole('alert')).toHaveTextContent(/only one wishlist card/i);
    expect(useAppStore.getState().wishlist[6]).toMatchObject({ cardId: cardA.id });
  });

  it('clicking a card body opens the condition picker, and confirming marks it owned and closes', async () => {
    const onClose = vi.fn();
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={onClose} />);
    await userEvent.click(screen.getByAltText(/charizard ex from 151/i));
    expect(screen.getByText(/what condition/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Near Mint' }));
    expect(useAppStore.getState().owned[6]).toMatchObject({ cardId: cardA.id, condition: 'Near Mint' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking outside the panel (the overlay backdrop) closes the picker', async () => {
    const onClose = vi.fn();
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={onClose} />);
    await userEvent.click(screen.getByRole('dialog', { name: /card options for charizard/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders a card\'s hostedThumbUrl instead of the live-API-constructed URL when present', () => {
    const hostedCard: CardRecord = {
      ...cardA,
      hostedThumbUrl: 'https://raw.githubusercontent.com/example/repo/main/en/sv03.5/199/thumb.webp',
    };
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[hostedCard]} onClose={() => {}} />);
    expect(screen.getByAltText(/charizard ex from 151/i)).toHaveAttribute(
      'src',
      'https://raw.githubusercontent.com/example/repo/main/en/sv03.5/199/thumb.webp'
    );
  });

  it('renders exactly as before (the live-API-constructed URL) when a card has no hostedThumbUrl', () => {
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
    expect(screen.getByAltText(/charizard ex from 151/i)).toHaveAttribute(
      'src',
      'https://assets.tcgdex.net/en/sv/sv03.5/199/low.webp'
    );
  });

  it('clicking inside the panel does not close the picker', async () => {
    const onClose = vi.fn();
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={onClose} />);
    await userEvent.click(screen.getByRole('heading', { name: 'Charizard' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('clicking outside the condition picker returns to the card grid instead of fully closing', async () => {
    const onClose = vi.fn();
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={onClose} />);
    await userEvent.click(screen.getByAltText(/charizard ex from 151/i));
    expect(screen.getByText(/what condition/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('dialog', { name: /choose condition for charizard ex/i }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText(/what condition/i)).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: /card options for charizard/i })).toBeInTheDocument();
  });

  it('shows a "Show all cards" toggle that is off by default', () => {
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: /show all cards/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('fetches and shows every printed card, including ones outside the curated view, when toggled on', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/cards/svp-044')) {
          return jsonResponse({
            id: 'svp-044',
            localId: '044',
            name: 'Charizard',
            rarity: 'Promo',
            set: { id: 'svp', name: 'SVP Black Star Promos' },
          });
        }
        if (url.includes('dexId=eq%3A6') || url.includes('dexId=eq:6')) {
          return jsonResponse([
            { id: 'svp-044', localId: '044', name: 'Charizard', image: 'https://assets.tcgdex.net/en/sv/svp/044' },
          ]);
        }
        return jsonResponse([]);
      })
    );
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
    expect(screen.queryByAltText(/charizard from svp/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /show all cards/i }));
    expect(await screen.findByAltText(/charizard from svp black star promos/i)).toBeInTheDocument();
    expect(screen.getByAltText(/charizard ex from 151/i)).toBeInTheDocument();
  });

  it('shows a loading state while the full print history is being fetched, then clears it', async () => {
    let resolveFetch: (value: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('dexId=eq%3A6') || url.includes('dexId=eq:6')) {
          return new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          });
        }
        return Promise.resolve(jsonResponse([]));
      })
    );
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /show all cards/i }));
    expect(screen.getByText(/loading all cards/i)).toBeInTheDocument();
    resolveFetch(jsonResponse([]));
    await waitFor(() => {
      expect(screen.queryByText(/loading all cards/i)).not.toBeInTheDocument();
    });
  });

  it('does not refetch on a second toggle-on once the full print history is already cached', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/cards/svp-044')) {
        return jsonResponse({
          id: 'svp-044',
          localId: '044',
          name: 'Charizard',
          rarity: 'Promo',
          set: { id: 'svp', name: 'SVP Black Star Promos' },
        });
      }
      if (url.includes('dexId=eq%3A6') || url.includes('dexId=eq:6')) {
        return jsonResponse([
          { id: 'svp-044', localId: '044', name: 'Charizard', image: 'https://assets.tcgdex.net/en/sv/svp/044' },
        ]);
      }
      return jsonResponse([]);
    });
    vi.stubGlobal('fetch', fetchImpl);
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
    const toggle = screen.getByRole('button', { name: /show all cards/i });
    await userEvent.click(toggle);
    await screen.findByAltText(/charizard from svp black star promos/i);
    const callsAfterFirstToggle = fetchImpl.mock.calls.length;
    await userEvent.click(toggle);
    await userEvent.click(toggle);
    expect(fetchImpl.mock.calls.length).toBe(callsAfterFirstToggle);
  });

  it('every shown card displays its rarity label', () => {
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
    expect(screen.getByText(cardA.rarity)).toBeInTheDocument();
  });

  it('prefers the fetched full print history over the curated prop when the same card id appears in both, on conflict', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/cards/sv03.5-199')) {
          return jsonResponse({
            id: 'sv03.5-199',
            localId: '199',
            name: 'Charizard ex',
            rarity: 'Ultra Rare',
            set: { id: 'sv03.5', name: '151' },
          });
        }
        if (url.includes('dexId=eq%3A6') || url.includes('dexId=eq:6')) {
          return jsonResponse([
            {
              id: 'sv03.5-199',
              localId: '199',
              name: 'Charizard ex',
              image: 'https://assets.tcgdex.net/en/sv/sv03.5/199',
            },
          ]);
        }
        return jsonResponse([]);
      })
    );
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
    expect(screen.getByText(cardA.rarity)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /show all cards/i }));
    await waitFor(() => {
      expect(screen.queryByText(cardA.rarity)).not.toBeInTheDocument();
    });
    expect(screen.getByText('Ultra Rare')).toBeInTheDocument();
  });

  // cardA and cardB share the same `name` ("Charizard ex"), so the classify
  // control's aria-label includes each card's set name and local id too
  // (not just its name) to stay unambiguous when both are rendered together.
  it('classifying a card assigns it to the chosen group, persisted in the store', async () => {
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
    await userEvent.selectOptions(
      screen.getByLabelText(`Classify ${cardA.name} (${cardA.setName} #${cardA.localId}) as`),
      'rainbow-gold'
    );
    expect(useAppStore.getState().cardOverrides[cardA.id]).toBe('rainbow-gold');
  });

  it("defaults a card's classification select to its existing override, or to using its own rarity if none", () => {
    useAppStore.setState({ cardOverrides: { [cardA.id]: 'vintage-special' } });
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA, cardB]} onClose={() => {}} />);
    expect(
      screen.getByLabelText(`Classify ${cardA.name} (${cardA.setName} #${cardA.localId}) as`)
    ).toHaveValue('vintage-special');
    expect(
      screen.getByLabelText(`Classify ${cardB.name} (${cardB.setName} #${cardB.localId}) as`)
    ).toHaveValue('');
  });

  it('choosing "Use this card\'s own rarity" clears an existing override', async () => {
    useAppStore.setState({ cardOverrides: { [cardA.id]: 'vintage-special' } });
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
    await userEvent.selectOptions(
      screen.getByLabelText(`Classify ${cardA.name} (${cardA.setName} #${cardA.localId}) as`),
      ''
    );
    expect(useAppStore.getState().cardOverrides[cardA.id]).toBeUndefined();
  });

  it('opens a TCGplayer search built from the card\'s name, local id, and set name (not the dex number) when Search is clicked on a card with no image', async () => {
    const noImageCard: CardRecord = { ...cardA, id: 'no-image-card', imageBase: '' };
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[noImageCard]} onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(openSpy).toHaveBeenCalledWith(
      buildTcgplayerSearchUrl(noImageCard),
      '_blank',
      'noopener,noreferrer'
    );
    openSpy.mockRestore();
  });

  it('uploading an image for a card with no TCGdex image resizes it and stores the result via setUploadedImage', async () => {
    vi.mocked(resizeImageForUpload).mockResolvedValue('data:image/jpeg;base64,RESIZED');
    const noImageCard: CardRecord = { ...cardA, id: 'no-image-card', imageBase: '' };
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[noImageCard]} onClose={() => {}} />);
    const file = new File(['fake-bytes'], 'photo.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);
    expect(resizeImageForUpload).toHaveBeenCalledWith(file);
    await waitFor(() => {
      expect(useAppStore.getState().uploadedImages['no-image-card']).toBe(
        'data:image/jpeg;base64,RESIZED'
      );
    });
  });

  it('renders a previously uploaded image directly instead of the "no image" placeholder', () => {
    const noImageCard: CardRecord = { ...cardA, id: 'no-image-card', imageBase: '' };
    useAppStore.setState({
      uploadedImages: { 'no-image-card': 'data:image/jpeg;base64,EXISTING' },
    });
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[noImageCard]} onClose={() => {}} />);
    const img = screen.getByAltText(`${noImageCard.name} from ${noImageCard.setName}`);
    expect(img).toHaveAttribute('src', 'data:image/jpeg;base64,EXISTING');
    expect(screen.queryByText(/no image available/i)).not.toBeInTheDocument();
  });

  // Regression test for a bug found in review of 04d52c1: a card with a
  // real, working image must keep showing it even if uploadedImages happens
  // to have a stale entry for that card id (e.g. TCGdex gained a real image
  // after the user had uploaded one) -- an upload must only ever be a
  // fallback for a card with no real image, never an override of one.
  it('ignores a stale uploaded image and shows the real card image when imageBase is valid', () => {
    useAppStore.setState({
      uploadedImages: { [cardA.id]: 'data:image/jpeg;base64,STALE' },
    });
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
    const img = screen.getByAltText(/charizard ex from 151/i);
    expect(img).toHaveAttribute('src', `${cardA.imageBase}/low.webp`);
  });

  // Regression test for a bug found in review of 04d52c1: once an image is
  // uploaded there was previously no way to undo it from the UI at all.
  it('shows a "Remove uploaded image" button for a card with an uploaded image, and clicking it clears the upload from the store', async () => {
    const noImageCard: CardRecord = { ...cardA, id: 'no-image-card', imageBase: '' };
    useAppStore.setState({
      uploadedImages: { 'no-image-card': 'data:image/jpeg;base64,EXISTING' },
    });
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[noImageCard]} onClose={() => {}} />);
    // Not getByRole: the outer card-select div is also role="button" and
    // (with no explicit aria-label of its own) computes its accessible name
    // from its full text content, which includes this button's own label --
    // so a role+name query matches both. getByText's exact-text match picks
    // out just the inner <button>, which is the only element whose OWN
    // direct text content is precisely "Remove uploaded image".
    const removeButton = screen.getByText('Remove uploaded image');
    await userEvent.click(removeButton);
    expect(useAppStore.getState().uploadedImages['no-image-card']).toBeUndefined();
    // Back to the ordinary "no image" placeholder with Search/Upload again.
    expect(screen.getByText(/no image available/i)).toBeInTheDocument();
  });

  // Regression test for a bug found in review of 04d52c1: keydown bubbles
  // past CardImage's click-propagation stop (that only stops click events),
  // so tabbing to the placeholder's Search/Upload button and pressing Enter
  // or Space used to ALSO fire the outer card-select div's onKeyDown,
  // spuriously opening the "Choose condition" (mark-owned) dialog. Uses raw
  // keyboard events (not userEvent.click) since the bug is keyboard-only --
  // mouse clicks already had propagation correctly stopped.
  it('pressing Enter or Space while the Search button is focused does not also open the condition picker', async () => {
    const noImageCard: CardRecord = { ...cardA, id: 'no-image-card', imageBase: '' };
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[noImageCard]} onClose={() => {}} />);
    screen.getByRole('button', { name: 'Search' }).focus();

    await userEvent.keyboard('{Enter}');
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/what condition/i)).not.toBeInTheDocument();

    await userEvent.keyboard(' ');
    expect(openSpy).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/what condition/i)).not.toBeInTheDocument();

    openSpy.mockRestore();
  });

  it('pressing Enter while the card body itself (not a nested button) is focused still opens the condition picker', async () => {
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
    const cardBody = screen
      .getByAltText(/charizard ex from 151/i)
      .closest('[role="button"]') as HTMLElement;
    cardBody.focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByText(/what condition/i)).toBeInTheDocument();
  });

  // Regression test for a bug found in review of 04d52c1: resizeImageForUpload
  // rejecting (e.g. a corrupt file, or a non-image file slipped past the
  // advisory accept="image/*" hint) used to produce a genuine unhandled
  // promise rejection with zero feedback to the user.
  it('shows a warning instead of an unhandled rejection when resizing an uploaded image fails', async () => {
    vi.mocked(resizeImageForUpload).mockRejectedValue(new Error('createImageBitmap failed'));
    const noImageCard: CardRecord = { ...cardA, id: 'no-image-card', imageBase: '' };
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[noImageCard]} onClose={() => {}} />);
    const file = new File(['not-an-image'], 'corrupt.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't use that image file/i);
    expect(useAppStore.getState().uploadedImages['no-image-card']).toBeUndefined();
  });

  it('shows a "Select cards" toggle that is off by default, with no select bar or bulk-assign control', () => {
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA, cardB]} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: /select cards/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mark as not usable/i })).not.toBeInTheDocument();
  });

  it('entering select mode replaces card-click-opens-condition-picker with toggling selection, and shows a running count', async () => {
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA, cardB]} onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /select cards/i }));
    expect(screen.getByRole('status')).toHaveTextContent('0 selected');

    await userEvent.click(screen.getByAltText(/charizard ex from 151/i));
    expect(screen.queryByText(/what condition/i)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 selected');

    const cardBody = screen.getByAltText(/charizard ex from 151/i).closest('[role="button"]');
    expect(cardBody).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking a selected card again deselects it', async () => {
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /select cards/i }));
    const cardBody = screen.getByAltText(/charizard ex from 151/i).closest('[role="button"]') as HTMLElement;
    await userEvent.click(cardBody);
    expect(screen.getByRole('status')).toHaveTextContent('1 selected');
    await userEvent.click(cardBody);
    expect(screen.getByRole('status')).toHaveTextContent('0 selected');
    expect(cardBody).toHaveAttribute('aria-pressed', 'false');
  });

  it('"Mark as Not Usable" is disabled until at least one card is selected', async () => {
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /select cards/i }));
    expect(screen.getByRole('button', { name: /mark as not usable/i })).toBeDisabled();
    await userEvent.click(screen.getByAltText(/charizard ex from 151/i));
    expect(screen.getByRole('button', { name: /mark as not usable/i })).toBeEnabled();
  });

  it('bulk-assigns every selected card to the not-usable group, then exits select mode', async () => {
    render(
      <Picker dexNumber={6} pokemonName="Charizard" cards={[cardA, cardB]} onClose={() => {}} />
    );
    await userEvent.click(screen.getByRole('button', { name: /select cards/i }));
    await userEvent.click(screen.getByAltText(/charizard ex from 151/i));
    await userEvent.click(screen.getByAltText(/charizard ex from obsidian flames/i));
    await userEvent.click(screen.getByRole('button', { name: /mark as not usable/i }));

    expect(useAppStore.getState().cardOverrides[cardA.id]).toBe('not-usable');
    expect(useAppStore.getState().cardOverrides[cardB.id]).toBe('not-usable');
    expect(screen.getByRole('button', { name: /select cards/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('canceling select mode clears the pending selection without assigning anything', async () => {
    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /select cards/i }));
    await userEvent.click(screen.getByAltText(/charizard ex from 151/i));
    await userEvent.click(screen.getByRole('button', { name: /cancel selection/i }));

    expect(useAppStore.getState().cardOverrides[cardA.id]).toBeUndefined();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    // Re-entering select mode starts from a clean slate, not the old selection.
    await userEvent.click(screen.getByRole('button', { name: /select cards/i }));
    expect(screen.getByRole('status')).toHaveTextContent('0 selected');
  });

  it('uses languageOverride instead of the store language when provided, for the Show all cards fetch', async () => {
    useAppStore.setState({ language: 'en' });
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/ja/')) {
        return jsonResponse([]);
      }
      throw new Error(`Unexpected URL for this test: ${url}`);
    });
    vi.stubGlobal('fetch', fetchImpl);
    render(
      <Picker
        dexNumber={6}
        pokemonName="Charizard"
        cards={[]}
        onClose={() => {}}
        languageOverride="ja"
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /show all cards/i }));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    expect(fetchImpl.mock.calls.every(([url]) => url.includes('/ja/'))).toBe(true);
  });

  // Regression test for a confirmed bug: opened from the ordinary Dex Grid
  // (no languageOverride), `language` tracks the global store reactively.
  // Nothing traps focus inside the Picker overlay, so the language selector
  // is reachable (e.g. via keyboard Tab) while a "Show all cards" fetch is
  // still in flight. Before the fix, handleToggleShowAll's closure captured
  // the OLD language and unconditionally applied the fetch result on
  // resolution, merging full-print-history cards fetched under the OLD
  // language with the curated `cards` prop's NEW-language cards into one
  // mixed-language list.
  it('discards a "Show all cards" fetch result if the language changes before it resolves, instead of merging it into the new language\'s cards', async () => {
    useAppStore.setState({ language: 'en' });
    let resolveDexList: (value: Response) => void = () => {};
    const fetchImpl = vi.fn((url: string) => {
      if (url.includes('/cards/svp-044')) {
        return Promise.resolve(
          jsonResponse({
            id: 'svp-044',
            localId: '044',
            name: 'Charizard',
            rarity: 'Promo',
            set: { id: 'svp', name: 'SVP Black Star Promos' },
          })
        );
      }
      if (url.includes('dexId=eq%3A6') || url.includes('dexId=eq:6')) {
        return new Promise<Response>((resolve) => {
          resolveDexList = resolve;
        });
      }
      return Promise.resolve(jsonResponse([]));
    });
    vi.stubGlobal('fetch', fetchImpl);

    render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /show all cards/i }));
    expect(screen.getByText(/loading all cards/i)).toBeInTheDocument();

    // The language selector changes (e.g. via the sidebar, still reachable
    // by keyboard while this overlay is open) while the 'en' fetch above is
    // still unresolved.
    useAppStore.setState({ language: 'ja' });
    await waitFor(() => {
      expect(screen.queryByText(/loading all cards/i)).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /show all cards/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );

    // Only now does the stale 'en' fetch resolve, and its detail fan-out run.
    resolveDexList(
      jsonResponse([
        {
          id: 'svp-044',
          localId: '044',
          name: 'Charizard',
          image: 'https://assets.tcgdex.net/en/sv/svp/044',
        },
      ])
    );
    await waitFor(() => {
      expect(fetchImpl.mock.calls.some(([url]) => url.includes('/cards/svp-044'))).toBe(true);
    });
    // Flush the rest of the stale fetch's continuation so that, if the bug
    // were present, its (incorrect) setAllCards call would have landed by now.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The stale 'en' full-print-history card must never appear...
    expect(screen.queryByAltText(/charizard from svp/i)).not.toBeInTheDocument();
    // ...the toggle must still read as off rather than falsely claiming all
    // cards are shown for a fetch that was actually for a different
    // language...
    expect(screen.getByRole('button', { name: /show all cards/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    // ...and no mixed-language merge is displayed: only the curated 'en'
    // card the Picker was opened with is visible.
    expect(screen.getByAltText(/charizard ex from 151/i)).toBeInTheDocument();
  });

  describe('enlarge / zoom overlay', () => {
    it('clicking Enlarge opens the overlay showing that card', async () => {
      render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
      await userEvent.click(screen.getByRole('button', { name: `Enlarge ${cardA.name}` }));

      const zoomDialog = screen.getByRole('dialog', { name: `${cardA.name} enlarged` });
      expect(zoomDialog).toBeInTheDocument();
      expect(
        within(zoomDialog).getByAltText(/charizard ex from 151/i)
      ).toHaveAttribute('src', `${cardA.imageBase}/high.png`);
    });

    it('clicking Enlarge does not also open the condition picker or toggle wishlist', async () => {
      render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
      await userEvent.click(screen.getByRole('button', { name: `Enlarge ${cardA.name}` }));

      expect(screen.queryByText(/what condition/i)).not.toBeInTheDocument();
      expect(useAppStore.getState().owned[6]).toBeUndefined();
      expect(useAppStore.getState().wishlist[6]).toBeUndefined();
    });

    it('closing the overlay returns to the normal picker grid', async () => {
      render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
      await userEvent.click(screen.getByRole('button', { name: `Enlarge ${cardA.name}` }));

      const zoomDialog = screen.getByRole('dialog', { name: `${cardA.name} enlarged` });
      await userEvent.click(within(zoomDialog).getByRole('button', { name: 'Close' }));

      // The overlay now plays a reverse spin-and-shrink exit (see
      // CardZoomOverlay's AnimatePresence-driven close) before AnimatePresence
      // actually removes it, so it lingers in the DOM briefly after the click
      // rather than vanishing on the same tick -- waitFor gives that exit
      // animation time to finish.
      await waitFor(() => {
        expect(
          screen.queryByRole('dialog', { name: `${cardA.name} enlarged` })
        ).not.toBeInTheDocument();
      });
      expect(
        screen.getByRole('dialog', { name: /card options for charizard/i })
      ).toBeInTheDocument();
      expect(screen.getByAltText(/charizard ex from 151/i)).toBeInTheDocument();
    });

    // Enlarge is a read-only preview action unrelated to selection, so it
    // must keep working while select mode is active, and must not itself
    // toggle a card's selection state.
    it('still opens the overlay while select mode is active, without toggling selection', async () => {
      render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
      await userEvent.click(screen.getByRole('button', { name: /select cards/i }));

      await userEvent.click(screen.getByRole('button', { name: `Enlarge ${cardA.name}` }));

      expect(
        screen.getByRole('dialog', { name: `${cardA.name} enlarged` })
      ).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('0 selected');
      // getByAltText alone would now match two images (the grid tile behind
      // the zoom overlay's own enlarged copy), so scope the query to the
      // main picker dialog specifically.
      const pickerDialog = screen.getByRole('dialog', { name: /card options for charizard/i });
      const cardBody = within(pickerDialog)
        .getByAltText(/charizard ex from 151/i)
        .closest('[role="button"]');
      expect(cardBody).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('holo tilt effect', () => {
    function getCardBody(altText: RegExp) {
      return screen.getByAltText(altText).closest('[role="button"]') as HTMLElement;
    }

    // Tracking (ref + mouse handlers) lives on the card's outer,
    // never-transformed CELL; the rotation style lands on the inner card
    // body. Listening on the rotated element itself caused the "vibrates at
    // the card edge" bug: the tilt moved the projected edge out from under
    // a cursor parked at the boundary, oscillating leave/enter. These tests
    // pin both halves of that contract.
    function getCardCell(cardBody: HTMLElement) {
      return cardBody.parentElement as HTMLElement;
    }

    it('tracks mouse movement over the stationary cell, tilting the inner card body', () => {
      render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
      const cardBody = getCardBody(/charizard ex from 151/i);
      const cell = getCardCell(cardBody);
      cell.getBoundingClientRect = () => new DOMRect(0, 0, 200, 280);

      expect(cardBody.style.getPropertyValue('--tilt-shine-opacity')).toBe('0');

      fireEvent.mouseMove(cell, { clientX: 200, clientY: 0 });

      expect(cardBody.style.getPropertyValue('--tilt-shine-opacity')).not.toBe('0');
      expect(cardBody.style.getPropertyValue('--tilt-shine-x')).toBe('100%');
      expect(cardBody.style.getPropertyValue('--tilt-shine-y')).toBe('0%');
      expect(cardBody.style.transform).toContain('rotateX');
      expect(cardBody.style.transform).toContain('rotateY');
      // The tracked cell itself must never carry the rotation -- that's the
      // stationary-hitbox guarantee that prevents edge jitter.
      expect(cell.style.transform).toBe('');
    });

    it('resets the tilt and hides the shine again when the cursor leaves the cell', () => {
      render(<Picker dexNumber={6} pokemonName="Charizard" cards={[cardA]} onClose={() => {}} />);
      const cardBody = getCardBody(/charizard ex from 151/i);
      const cell = getCardCell(cardBody);
      cell.getBoundingClientRect = () => new DOMRect(0, 0, 200, 280);

      fireEvent.mouseMove(cell, { clientX: 200, clientY: 0 });
      expect(cardBody.style.getPropertyValue('--tilt-shine-opacity')).not.toBe('0');

      fireEvent.mouseLeave(cell);

      expect(cardBody.style.getPropertyValue('--tilt-shine-opacity')).toBe('0');
      expect(cardBody.style.transform).toContain('rotateX(0deg)');
      expect(cardBody.style.transform).toContain('rotateY(0deg)');
    });

    it('does not apply the tilt effect to a card showing the "no image" placeholder', () => {
      const noImageCard: CardRecord = { ...cardA, id: 'no-image-card', imageBase: '' };
      render(<Picker dexNumber={6} pokemonName="Charizard" cards={[noImageCard]} onClose={() => {}} />);
      const cardBody = screen.getByText(/no image available/i).closest('[role="button"]') as HTMLElement;
      const cell = getCardCell(cardBody);
      cell.getBoundingClientRect = () => new DOMRect(0, 0, 200, 280);

      fireEvent.mouseMove(cell, { clientX: 200, clientY: 0 });

      expect(cardBody.style.transform).toBe('');
      expect(cardBody.style.getPropertyValue('--tilt-shine-opacity')).toBe('');
    });
  });
});
