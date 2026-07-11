import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BinderSlot } from './BinderSlot';

describe('BinderSlot', () => {
  it('renders black/blank by default for a pokemon entry, with no visible sprite', () => {
    render(
      <BinderSlot
        entry={{ type: 'pokemon', dexNumber: 1 }}
        pokemonName="Bulbasaur"
        spriteUrl="https://example.com/1.png"
        onClick={() => {}}
      />
    );
    expect(screen.queryByAltText('Bulbasaur')).not.toBeInTheDocument();
  });

  it('reveals the sprite on hover for a pokemon entry', async () => {
    render(
      <BinderSlot
        entry={{ type: 'pokemon', dexNumber: 1 }}
        pokemonName="Bulbasaur"
        spriteUrl="https://example.com/1.png"
        onClick={() => {}}
      />
    );
    await userEvent.hover(screen.getByRole('button'));
    expect(screen.getByAltText('Bulbasaur')).toBeInTheDocument();
  });

  it('calls onClick with the dex number when a pokemon slot is clicked', async () => {
    const onClick = vi.fn();
    render(
      <BinderSlot
        entry={{ type: 'pokemon', dexNumber: 6 }}
        pokemonName="Charizard"
        spriteUrl="https://example.com/6.png"
        onClick={onClick}
      />
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledWith(6);
  });

  it('renders a non-interactive blank for a blank entry, with no hover preview and no click', async () => {
    const onClick = vi.fn();
    render(<BinderSlot entry={{ type: 'blank' }} onClick={onClick} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders a non-interactive blank for an out-of-capacity undefined entry', () => {
    render(<BinderSlot entry={undefined} onClick={() => {}} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('permanently shows the owned card, not the black/hover-sprite placeholder, when ownedCardImageBase is set', () => {
    render(
      <BinderSlot
        entry={{ type: 'pokemon', dexNumber: 1 }}
        pokemonName="Bulbasaur"
        spriteUrl="https://example.com/1.png"
        ownedCardImageBase="https://assets.tcgdex.net/en/sv/sv03.5/199"
        onClick={() => {}}
      />
    );
    // Shown immediately, without needing to hover first.
    expect(screen.getByAltText('Bulbasaur card')).toBeInTheDocument();
  });

  it('does not reveal the sprite on hover once an owned card is showing', async () => {
    render(
      <BinderSlot
        entry={{ type: 'pokemon', dexNumber: 1 }}
        pokemonName="Bulbasaur"
        spriteUrl="https://example.com/1.png"
        ownedCardImageBase="https://assets.tcgdex.net/en/sv/sv03.5/199"
        onClick={() => {}}
      />
    );
    await userEvent.hover(screen.getByRole('button'));
    expect(screen.queryByAltText('Bulbasaur')).not.toBeInTheDocument();
    expect(screen.getByAltText('Bulbasaur card')).toBeInTheDocument();
  });

  it('shows a user-uploaded replacement image for an owned card with no real image', () => {
    render(
      <BinderSlot
        entry={{ type: 'pokemon', dexNumber: 1 }}
        pokemonName="Bulbasaur"
        spriteUrl="https://example.com/1.png"
        ownedCardImageBase=""
        uploadedImageUri="data:image/jpeg;base64,ABC"
        onClick={() => {}}
      />
    );
    expect(screen.getByAltText('Bulbasaur card')).toHaveAttribute(
      'src',
      'data:image/jpeg;base64,ABC'
    );
    expect(screen.queryByText('No image available')).not.toBeInTheDocument();
  });

  it('renders a plain non-interactive blank when not in manual arrange and there is no onEditCustomImage handler', () => {
    render(<BinderSlot entry={{ type: 'blank' }} onClick={() => {}} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders an interactive "add image" affordance for a blank slot when onEditCustomImage is provided and not in manual arrange', async () => {
    const onEditCustomImage = vi.fn();
    render(<BinderSlot entry={{ type: 'blank' }} onClick={() => {}} onEditCustomImage={onEditCustomImage} />);
    await userEvent.click(screen.getByRole('button', { name: /add a custom image/i }));
    expect(onEditCustomImage).toHaveBeenCalledTimes(1);
  });

  it("permanently renders a blank slot's custom image instead of the add-image affordance", () => {
    render(
      <BinderSlot
        entry={{
          type: 'blank',
          customImage: { dataUri: 'data:image/png;base64,ABC', offsetX: 0.1, offsetY: 0, zoom: 1.5 },
        }}
        onClick={() => {}}
        onEditCustomImage={() => {}}
      />
    );
    expect(screen.getByAltText('Custom binder slot image')).toBeInTheDocument();
  });

  it('does not offer to edit a blank slot\'s custom image while manual arrange is active (drag/select takes priority)', () => {
    render(
      <BinderSlot
        entry={{ type: 'blank' }}
        onClick={() => {}}
        onEditCustomImage={() => {}}
        isManualArrangeActive
      />
    );
    expect(screen.queryByRole('button', { name: /add a custom image/i })).not.toBeInTheDocument();
  });

  describe('enlarge button', () => {
    it('shows an Enlarge button for an owned slot when onEnlarge is provided', () => {
      render(
        <BinderSlot
          entry={{ type: 'pokemon', dexNumber: 1 }}
          pokemonName="Bulbasaur"
          spriteUrl="https://example.com/1.png"
          ownedCardImageBase="https://assets.tcgdex.net/en/sv/sv03.5/199"
          onClick={() => {}}
          onEnlarge={() => {}}
        />
      );
      expect(screen.getByRole('button', { name: /enlarge bulbasaur card/i })).toBeInTheDocument();
    });

    it('does not show an Enlarge button for an unowned slot even when onEnlarge is provided', () => {
      render(
        <BinderSlot
          entry={{ type: 'pokemon', dexNumber: 1 }}
          pokemonName="Bulbasaur"
          spriteUrl="https://example.com/1.png"
          onClick={() => {}}
          onEnlarge={() => {}}
        />
      );
      expect(screen.queryByRole('button', { name: /enlarge/i })).not.toBeInTheDocument();
    });

    it('does not show an Enlarge button when no onEnlarge callback is provided, even for an owned slot', () => {
      render(
        <BinderSlot
          entry={{ type: 'pokemon', dexNumber: 1 }}
          pokemonName="Bulbasaur"
          spriteUrl="https://example.com/1.png"
          ownedCardImageBase="https://assets.tcgdex.net/en/sv/sv03.5/199"
          onClick={() => {}}
        />
      );
      expect(screen.queryByRole('button', { name: /enlarge/i })).not.toBeInTheDocument();
    });

    it("calls onEnlarge, and not the slot's own onClick, when Enlarge is clicked", async () => {
      const onEnlarge = vi.fn();
      const onClick = vi.fn();
      render(
        <BinderSlot
          entry={{ type: 'pokemon', dexNumber: 1 }}
          pokemonName="Bulbasaur"
          spriteUrl="https://example.com/1.png"
          ownedCardImageBase="https://assets.tcgdex.net/en/sv/sv03.5/199"
          onClick={onClick}
          onEnlarge={onEnlarge}
        />
      );
      await userEvent.click(screen.getByRole('button', { name: /enlarge bulbasaur card/i }));
      expect(onEnlarge).toHaveBeenCalledTimes(1);
      expect(onClick).not.toHaveBeenCalled();
    });
  });
});
