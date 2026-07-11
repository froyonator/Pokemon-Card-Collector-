import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Tile } from './Tile';

describe('Tile', () => {
  it('renders the dex number and name', () => {
    render(
      <Tile
        dexNumber={6}
        name="Charizard"
        spriteUrl="https://example.com/6.png"
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
        spriteUrl="https://example.com/11.png"
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
        spriteUrl="https://example.com/25.png"
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
        spriteUrl="https://example.com/25.png"
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
        spriteUrl="https://example.com/6.png"
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
        spriteUrl="https://example.com/4.png"
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
        spriteUrl="https://example.com/4.png"
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
        spriteUrl="https://example.com/25.png"
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
        spriteUrl="https://example.com/6.png"
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
        spriteUrl="https://example.com/6.png"
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
        spriteUrl="https://example.com/1.png"
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
        spriteUrl="https://example.com/1.png"
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
        spriteUrl="https://example.com/11.png"
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

  it('applies the extra dull-in-card-view class only when unavailable and in card view', () => {
    const { rerender } = render(
      <Tile
        dexNumber={11}
        name="Metapod"
        spriteUrl="https://example.com/11.png"
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
        spriteUrl="https://example.com/11.png"
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
        spriteUrl="https://example.com/1.png"
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
        spriteUrl="https://example.com/1.png"
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
          spriteUrl="https://example.com/6.png"
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
          spriteUrl="https://example.com/6.png"
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
          spriteUrl="https://example.com/1.png"
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
          spriteUrl="https://example.com/6.png"
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
          spriteUrl="https://example.com/6.png"
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
          spriteUrl="https://example.com/6.png"
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
});
