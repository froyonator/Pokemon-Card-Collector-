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
});
