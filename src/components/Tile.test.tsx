import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReducedMotion } from 'framer-motion';
import { Tile } from './Tile';

// Defaults to motion enabled -- matches every existing test in this file,
// none of which care about reduced motion, and mirrors the exact
// convention BinderShelf.test.tsx/BinderView.test.tsx already use. The
// dedicated "sprite state" describe block below flips this to true for its
// own reduced-motion test only.
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return { ...actual, useReducedMotion: vi.fn(() => false) };
});

beforeEach(() => {
  vi.mocked(useReducedMotion).mockReturnValue(false);
});

describe('Tile', () => {
  it('renders the dex number and name', () => {
    render(
      <Tile
        dexNumber={6}
        name="Charizard"
        spriteStaticUrl="https://example.com/6.png"
        spriteAnimatedUrl={null}
        spriteFallbackUrl="https://example.com/fallback.png"
        state="available"
        view="sprite"
        onClick={() => {}}
      />
    );
    expect(screen.getByText('#006')).toBeInTheDocument();
    expect(screen.getByText('Charizard')).toBeInTheDocument();
  });

  it('applies a state-specific class name', () => {
    render(
      <Tile
        dexNumber={11}
        name="Metapod"
        spriteStaticUrl="https://example.com/11.png"
        spriteAnimatedUrl={null}
        spriteFallbackUrl="https://example.com/fallback.png"
        state="unavailable"
        view="sprite"
        onClick={() => {}}
      />
    );
    expect(screen.getByRole('button')).toHaveClass('tile--unavailable');
  });

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    render(
      <Tile
        dexNumber={25}
        name="Pikachu"
        spriteStaticUrl="https://example.com/25.png"
        spriteAnimatedUrl={null}
        spriteFallbackUrl="https://example.com/fallback.png"
        state="owned"
        view="sprite"
        onClick={onClick}
      />
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('calls onClick with its own dex number, not a no-argument callback', async () => {
    // Regression test: DexGrid now hands every Tile the exact SAME onClick
    // function reference (for React.memo to actually take effect across up
    // to 151 tiles -- see DexGrid.tsx's handleTileClick), so onClick can no
    // longer rely on a per-tile closure to know which dex number it's for.
    // It must receive that as an argument instead.
    const onClick = vi.fn();
    render(
      <Tile
        dexNumber={25}
        name="Pikachu"
        spriteStaticUrl="https://example.com/25.png"
        spriteAnimatedUrl={null}
        spriteFallbackUrl="https://example.com/fallback.png"
        state="owned"
        view="sprite"
        onClick={onClick}
      />
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledWith(25);
  });

  it('shows the owned card image in card view when one is provided', () => {
    render(
      <Tile
        dexNumber={6}
        name="Charizard"
        spriteStaticUrl="https://example.com/6.png"
        spriteAnimatedUrl={null}
        spriteFallbackUrl="https://example.com/fallback.png"
        state="owned"
        view="card"
        ownedCardImageBase="https://example.com/card"
        onClick={() => {}}
      />
    );
    expect(screen.getByAltText('Charizard card')).toBeInTheDocument();
  });

  it('shows the "no image available" placeholder, not the sprite, when the owned card has an empty image base', () => {
    render(
      <Tile
        dexNumber={4}
        name="Charmander"
        spriteStaticUrl="https://example.com/4.png"
        spriteAnimatedUrl={null}
        spriteFallbackUrl="https://example.com/fallback.png"
        state="owned"
        view="card"
        ownedCardImageBase=""
        onClick={() => {}}
      />
    );
    expect(screen.getByText(/no image available/i)).toBeInTheDocument();
    expect(screen.queryByAltText('Charmander')).not.toBeInTheDocument();
    expect(screen.queryByAltText('Charmander card')).not.toBeInTheDocument();
  });

  it('shows a user-uploaded replacement image, not the placeholder, when the owned card has no real image', () => {
    render(
      <Tile
        dexNumber={4}
        name="Charmander"
        spriteStaticUrl="https://example.com/4.png"
        spriteAnimatedUrl={null}
        spriteFallbackUrl="https://example.com/fallback.png"
        state="owned"
        view="card"
        ownedCardImageBase=""
        uploadedImageUri="data:image/jpeg;base64,UPLOADED"
        onClick={() => {}}
      />
    );
    const img = screen.getByAltText('Charmander card');
    expect(img).toHaveAttribute('src', 'data:image/jpeg;base64,UPLOADED');
    expect(screen.queryByText(/no image available/i)).not.toBeInTheDocument();
  });

  it('does not apply the sprite-dulling filter class to real card art in Card view', () => {
    render(
      <Tile
        dexNumber={25}
        name="Pikachu"
        spriteStaticUrl="https://example.com/25.png"
        spriteAnimatedUrl={null}
        spriteFallbackUrl="https://example.com/fallback.png"
        state="owned"
        view="card"
        ownedCardImageBase="https://assets.tcgdex.net/en/sv/sv03.5/236"
        onClick={() => {}}
      />
    );
    const cardImg = screen.getByAltText('Pikachu card');
    expect(cardImg.className).not.toContain('spriteImg');
  });

  it('renders ownedCardHostedThumbUrl instead of the live-API-constructed URL when present', () => {
    render(
      <Tile
        dexNumber={6}
        name="Charizard"
        spriteStaticUrl="https://example.com/6.png"
        spriteAnimatedUrl={null}
        spriteFallbackUrl="https://example.com/fallback.png"
        state="owned"
        view="card"
        ownedCardImageBase="https://assets.tcgdex.net/en/sv/sv03.5/199"
        ownedCardHostedThumbUrl="https://raw.githubusercontent.com/example/repo/main/en/sv03.5/199/thumb.webp"
        onClick={() => {}}
      />
    );
    expect(screen.getByAltText('Charizard card')).toHaveAttribute(
      'src',
      'https://raw.githubusercontent.com/example/repo/main/en/sv03.5/199/thumb.webp'
    );
  });

  it('renders exactly as before (the live-API-constructed URL) when ownedCardHostedThumbUrl is absent', () => {
    render(
      <Tile
        dexNumber={6}
        name="Charizard"
        spriteStaticUrl="https://example.com/6.png"
        spriteAnimatedUrl={null}
        spriteFallbackUrl="https://example.com/fallback.png"
        state="owned"
        view="card"
        ownedCardImageBase="https://assets.tcgdex.net/en/sv/sv03.5/199"
        onClick={() => {}}
      />
    );
    expect(screen.getByAltText('Charizard card')).toHaveAttribute(
      'src',
      'https://assets.tcgdex.net/en/sv/sv03.5/199/low.webp'
    );
  });

  it('falls back to the sprite image in card view when no owned card image is provided', () => {
    render(
      <Tile
        dexNumber={1}
        name="Bulbasaur"
        spriteStaticUrl="https://example.com/1.png"
        spriteAnimatedUrl={null}
        spriteFallbackUrl="https://example.com/fallback.png"
        state="available"
        view="card"
        onClick={() => {}}
      />
    );
    expect(screen.getByAltText('Bulbasaur')).toBeInTheDocument();
    expect(screen.queryByAltText('Bulbasaur card')).not.toBeInTheDocument();
  });

  it('applies the available state class name', () => {
    render(
      <Tile
        dexNumber={1}
        name="Bulbasaur"
        spriteStaticUrl="https://example.com/1.png"
        spriteAnimatedUrl={null}
        spriteFallbackUrl="https://example.com/fallback.png"
        state="available"
        view="sprite"
        onClick={() => {}}
      />
    );
    expect(screen.getByRole('button')).toHaveClass('tile--available');
  });

  it('applies the loading state class name, aria-busy, and a distinct title when still loading', () => {
    render(
      <Tile
        dexNumber={11}
        name="Metapod"
        spriteStaticUrl="https://example.com/11.png"
        spriteAnimatedUrl={null}
        spriteFallbackUrl="https://example.com/fallback.png"
        state="loading"
        view="sprite"
        onClick={() => {}}
      />
    );
    const button = screen.getByRole('button');
    expect(button).toHaveClass('tile--loading');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('title', 'Loading card data for Metapod...');
  });

  it('shows the Poke Ball loading animation instead of the sprite while loading, and the sprite once loaded', () => {
    const { rerender } = render(
      <Tile
        dexNumber={11}
        name="Metapod"
        spriteStaticUrl="https://example.com/11.png"
        spriteAnimatedUrl={null}
        spriteFallbackUrl="https://example.com/fallback.png"
        state="loading"
        view="sprite"
        onClick={() => {}}
      />
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    rerender(
      <Tile
        dexNumber={11}
        name="Metapod"
        spriteStaticUrl="https://example.com/11.png"
        spriteAnimatedUrl={null}
        spriteFallbackUrl="https://example.com/fallback.png"
        state="available"
        view="sprite"
        onClick={() => {}}
      />
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('applies the extra dull-in-card-view class only when unavailable and in card view', () => {
    const { rerender } = render(
      <Tile
        dexNumber={11}
        name="Metapod"
        spriteStaticUrl="https://example.com/11.png"
        spriteAnimatedUrl={null}
        spriteFallbackUrl="https://example.com/fallback.png"
        state="unavailable"
        view="sprite"
        onClick={() => {}}
      />
    );
    expect(screen.getByRole('button')).not.toHaveClass('dullCardView');

    rerender(
      <Tile
        dexNumber={11}
        name="Metapod"
        spriteStaticUrl="https://example.com/11.png"
        spriteAnimatedUrl={null}
        spriteFallbackUrl="https://example.com/fallback.png"
        state="unavailable"
        view="card"
        onClick={() => {}}
      />
    );
    expect(screen.getByRole('button')).toHaveClass('dullCardView');
  });

  it('does not apply the dull-in-card-view class to an available Pokemon in card view', () => {
    render(
      <Tile
        dexNumber={1}
        name="Bulbasaur"
        spriteStaticUrl="https://example.com/1.png"
        spriteAnimatedUrl={null}
        spriteFallbackUrl="https://example.com/fallback.png"
        state="available"
        view="card"
        onClick={() => {}}
      />
    );
    expect(screen.getByRole('button')).not.toHaveClass('dullCardView');
  });

  it('sets aria-busy to false for non-loading states', () => {
    render(
      <Tile
        dexNumber={1}
        name="Bulbasaur"
        spriteStaticUrl="https://example.com/1.png"
        spriteAnimatedUrl={null}
        spriteFallbackUrl="https://example.com/fallback.png"
        state="available"
        view="sprite"
        onClick={() => {}}
      />
    );
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'false');
  });

  describe('enlarge button', () => {
    it('shows an Enlarge button for an owned card in card view', () => {
      render(
        <Tile
          dexNumber={6}
          name="Charizard"
          spriteStaticUrl="https://example.com/6.png"
        spriteAnimatedUrl={null}
        spriteFallbackUrl="https://example.com/fallback.png"
          state="owned"
          view="card"
          ownedCardImageBase="https://example.com/card"
          onEnlarge={() => {}}
          onClick={() => {}}
        />
      );
      expect(screen.getByRole('button', { name: /enlarge charizard card/i })).toBeInTheDocument();
    });

    it('does not show an Enlarge button in sprite view, even for an owned card', () => {
      render(
        <Tile
          dexNumber={6}
          name="Charizard"
          spriteStaticUrl="https://example.com/6.png"
        spriteAnimatedUrl={null}
        spriteFallbackUrl="https://example.com/fallback.png"
          state="owned"
          view="sprite"
          ownedCardImageBase="https://example.com/card"
          onEnlarge={() => {}}
          onClick={() => {}}
        />
      );
      expect(screen.queryByRole('button', { name: /enlarge/i })).not.toBeInTheDocument();
    });

    it('does not show an Enlarge button for an unowned tile in card view', () => {
      render(
        <Tile
          dexNumber={1}
          name="Bulbasaur"
          spriteStaticUrl="https://example.com/1.png"
        spriteAnimatedUrl={null}
        spriteFallbackUrl="https://example.com/fallback.png"
          state="available"
          view="card"
          onEnlarge={() => {}}
          onClick={() => {}}
        />
      );
      expect(screen.queryByRole('button', { name: /enlarge/i })).not.toBeInTheDocument();
    });

    it('does not show an Enlarge button when no onEnlarge callback is provided, even for an owned card-view tile', () => {
      render(
        <Tile
          dexNumber={6}
          name="Charizard"
          spriteStaticUrl="https://example.com/6.png"
        spriteAnimatedUrl={null}
        spriteFallbackUrl="https://example.com/fallback.png"
          state="owned"
          view="card"
          ownedCardImageBase="https://example.com/card"
          onClick={() => {}}
        />
      );
      expect(screen.queryByRole('button', { name: /enlarge/i })).not.toBeInTheDocument();
    });

    it("calls onEnlarge, and not the tile's own onClick, when Enlarge is clicked", async () => {
      const onEnlarge = vi.fn();
      const onClick = vi.fn();
      render(
        <Tile
          dexNumber={6}
          name="Charizard"
          spriteStaticUrl="https://example.com/6.png"
        spriteAnimatedUrl={null}
        spriteFallbackUrl="https://example.com/fallback.png"
          state="owned"
          view="card"
          ownedCardImageBase="https://example.com/card"
          onEnlarge={onEnlarge}
          onClick={onClick}
        />
      );
      await userEvent.click(screen.getByRole('button', { name: /enlarge charizard card/i }));
      expect(onEnlarge).toHaveBeenCalledTimes(1);
      expect(onClick).not.toHaveBeenCalled();
    });

    it('calls onEnlarge with its own dex number, not a no-argument callback', async () => {
      // Same reasoning as the analogous onClick regression test above --
      // see DexGrid.tsx's handleTileEnlarge, which is likewise shared by
      // every Tile and looks up the owned card by this argument.
      const onEnlarge = vi.fn();
      render(
        <Tile
          dexNumber={6}
          name="Charizard"
          spriteStaticUrl="https://example.com/6.png"
        spriteAnimatedUrl={null}
        spriteFallbackUrl="https://example.com/fallback.png"
          state="owned"
          view="card"
          ownedCardImageBase="https://example.com/card"
          onEnlarge={onEnlarge}
          onClick={() => {}}
        />
      );
      await userEvent.click(screen.getByRole('button', { name: /enlarge charizard card/i }));
      expect(onEnlarge).toHaveBeenCalledWith(6);
    });
  });

  describe('sprite state (self-hosted static/animated, see src/data/sprites.ts)', () => {
    it('renders the animated URL for an available tile with animated coverage', () => {
      render(
        <Tile
          dexNumber={6}
          name="Charizard"
          spriteStaticUrl="https://example.com/static/6.png"
          spriteAnimatedUrl="https://example.com/animated/6.gif"
          spriteFallbackUrl="https://example.com/fallback/6.png"
          state="available"
          view="sprite"
          onClick={() => {}}
        />
      );
      expect(screen.getByAltText('Charizard')).toHaveAttribute(
        'src',
        'https://example.com/animated/6.gif'
      );
    });

    it('renders the animated URL, plus the owned-state strong-grey filter selector target, for an owned tile with animated coverage', () => {
      render(
        <Tile
          dexNumber={25}
          name="Pikachu"
          spriteStaticUrl="https://example.com/static/25.png"
          spriteAnimatedUrl="https://example.com/animated/25.gif"
          spriteFallbackUrl="https://example.com/fallback/25.png"
          state="owned"
          view="sprite"
          onClick={() => {}}
        />
      );
      const img = screen.getByAltText('Pikachu');
      expect(img).toHaveAttribute('src', 'https://example.com/animated/25.gif');
      // The strong grayscale/brightness dulling is applied by Tile.module.css's
      // `.tile--owned .spriteImg` descendant selector, not a class on the img
      // itself -- so the actual "very greyed out" look is this exact
      // combination: the img keeps its ordinary spriteImg class, and the
      // ancestor button carries tile--owned.
      expect(img.className).toContain('spriteImg');
      expect(screen.getByRole('button')).toHaveClass('tile--owned');
    });

    it('always renders the static URL for an unavailable tile, even when animated coverage exists', () => {
      render(
        <Tile
          dexNumber={11}
          name="Metapod"
          spriteStaticUrl="https://example.com/static/11.png"
          spriteAnimatedUrl="https://example.com/animated/11.gif"
          spriteFallbackUrl="https://example.com/fallback/11.png"
          state="unavailable"
          view="sprite"
          onClick={() => {}}
        />
      );
      expect(screen.getByAltText('Metapod')).toHaveAttribute(
        'src',
        'https://example.com/static/11.png'
      );
    });

    it('renders the static URL, not the animated one, for an available/owned tile when there is no animated coverage (manifest miss)', () => {
      render(
        <Tile
          dexNumber={999}
          name="Missingno"
          spriteStaticUrl="https://example.com/static/999.png"
          spriteAnimatedUrl={null}
          spriteFallbackUrl="https://example.com/fallback/999.png"
          state="available"
          view="sprite"
          onClick={() => {}}
        />
      );
      expect(screen.getByAltText('Missingno')).toHaveAttribute(
        'src',
        'https://example.com/static/999.png'
      );
    });

    it('forces the static URL for every tile state when prefers-reduced-motion is set, even with animated coverage', () => {
      vi.mocked(useReducedMotion).mockReturnValue(true);
      render(
        <Tile
          dexNumber={6}
          name="Charizard"
          spriteStaticUrl="https://example.com/static/6.png"
          spriteAnimatedUrl="https://example.com/animated/6.gif"
          spriteFallbackUrl="https://example.com/fallback/6.png"
          state="owned"
          view="sprite"
          onClick={() => {}}
        />
      );
      expect(screen.getByAltText('Charizard')).toHaveAttribute(
        'src',
        'https://example.com/static/6.png'
      );
    });

    it('falls back to the OLD remote sprite URL once the self-hosted sprite fails to load', () => {
      render(
        <Tile
          dexNumber={6}
          name="Charizard"
          spriteStaticUrl="https://example.com/static/6.png"
          spriteAnimatedUrl="https://example.com/animated/6.gif"
          spriteFallbackUrl="https://example.com/fallback/6.png"
          state="available"
          view="sprite"
          onClick={() => {}}
        />
      );
      const img = screen.getByAltText('Charizard');
      expect(img).toHaveAttribute('src', 'https://example.com/animated/6.gif');
      // Simulates the self-hosted animated file 404ing (e.g. a manifest/file
      // mismatch from a partial deploy) -- this must swap to the old remote
      // URL rather than leaving a broken image icon showing. The img is
      // re-queried afterward, not reused: Tile.tsx keys this element on its
      // own intended src (see that file's comment on why), so the fallback
      // is a freshly-mounted element, not the original one mutated in place.
      fireEvent.error(img);
      expect(screen.getByAltText('Charizard')).toHaveAttribute(
        'src',
        'https://example.com/fallback/6.png'
      );
    });

    it('loads sprite images lazily with async decoding', () => {
      render(
        <Tile
          dexNumber={1}
          name="Bulbasaur"
          spriteStaticUrl="https://example.com/static/1.png"
          spriteAnimatedUrl={null}
          spriteFallbackUrl="https://example.com/fallback/1.png"
          state="available"
          view="sprite"
          onClick={() => {}}
        />
      );
      const img = screen.getByAltText('Bulbasaur');
      expect(img).toHaveAttribute('loading', 'lazy');
      expect(img).toHaveAttribute('decoding', 'async');
    });
  });
});
