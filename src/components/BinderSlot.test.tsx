import { fireEvent, render, screen } from '@testing-library/react';
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

  it("renders the custom image with the exact same translate+scale transform as the editor's own live preview, not objectPosition", () => {
    // Regression test: a previous version used `objectPosition:
    // "${50+offsetX*100}% ${50+offsetY*100}%"` plus a plain `scale(zoom)`
    // transform -- a fundamentally different, non-equivalent
    // interpretation of offsetX/offsetY than SlotImageEditor's own preview
    // (which pans via `translate(offsetX*frameWidth, offsetY*frameHeight)
    // scale(zoom)`), so a saved crop never actually matched what the editor
    // showed. Percentage units here (not the editor's hardcoded 200x280px
    // frame) make this resolution-independent -- see customImageStyle's own
    // comment in BinderSlot.tsx.
    render(
      <BinderSlot
        entry={{
          type: 'blank',
          customImage: { dataUri: 'data:image/png;base64,ABC', offsetX: 0.1, offsetY: -0.2, zoom: 1.5 },
        }}
        onClick={() => {}}
        onEditCustomImage={() => {}}
      />
    );
    const img = screen.getByAltText('Custom binder slot image');
    expect(img.style.transform).toBe('translate(10%, -20%) scale(1.5)');
    expect(img.style.objectPosition).toBe('');
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

  it('keeps an empty slot selectable and draggable during manual arrange, instead of going fully inert', async () => {
    const onSelect = vi.fn();
    render(
      <BinderSlot
        entry={{ type: 'blank' }}
        onClick={() => {}}
        onEditCustomImage={() => {}}
        isManualArrangeActive
        onSelect={onSelect}
      />
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('draggable', 'true');
    await userEvent.click(button);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('shows an empty slot as selected during manual arrange, same as a pokemon slot', () => {
    render(
      <BinderSlot
        entry={{ type: 'blank' }}
        onClick={() => {}}
        isManualArrangeActive
        isSelected
      />
    );
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps a blank slot that already has a custom image selectable and draggable during manual arrange too, still without an edit affordance', async () => {
    const onSelect = vi.fn();
    render(
      <BinderSlot
        entry={{
          type: 'blank',
          customImage: { dataUri: 'data:image/png;base64,ABC', offsetX: 0, offsetY: 0, zoom: 1 },
        }}
        onClick={() => {}}
        onEditCustomImage={() => {}}
        isManualArrangeActive
        onSelect={onSelect}
      />
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('draggable', 'true');
    expect(screen.getByAltText('Custom binder slot image')).toBeInTheDocument();
    await userEvent.click(button);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('passes the click event through to onSelect for a blank slot, so BinderView can detect Shift for a range selection', () => {
    const onSelect = vi.fn();
    render(
      <BinderSlot entry={{ type: 'blank' }} onClick={() => {}} isManualArrangeActive onSelect={onSelect} />
    );
    fireEvent.click(screen.getByRole('button'), { shiftKey: true });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toMatchObject({ shiftKey: true });
  });

  it('passes the click event through to onSelect for a pokemon slot during manual arrange too', () => {
    const onSelect = vi.fn();
    render(
      <BinderSlot
        entry={{ type: 'pokemon', dexNumber: 1 }}
        pokemonName="Bulbasaur"
        spriteUrl="https://example.com/1.png"
        onClick={() => {}}
        isManualArrangeActive
        onSelect={onSelect}
      />
    );
    fireEvent.click(screen.getByRole('button'), { shiftKey: true });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toMatchObject({ shiftKey: true });
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
