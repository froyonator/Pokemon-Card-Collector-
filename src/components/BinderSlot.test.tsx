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
});
