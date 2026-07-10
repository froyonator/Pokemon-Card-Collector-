import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CardImage } from './CardImage';

describe('CardImage', () => {
  it('renders the image at the default low/webp variant when imageBase is present', () => {
    render(<CardImage imageBase="https://assets.tcgdex.net/en/sv/sv03.5/199" alt="Charizard ex" />);
    const img = screen.getByAltText('Charizard ex');
    expect(img).toHaveAttribute('src', 'https://assets.tcgdex.net/en/sv/sv03.5/199/low.webp');
  });

  it('renders the "No image available" placeholder immediately when imageBase is empty, with no img attempted', () => {
    render(<CardImage imageBase="" alt="Mystery card" />);
    expect(screen.getByText(/no image available/i)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('falls back to a second variant when the first image fails to load', () => {
    render(<CardImage imageBase="https://assets.tcgdex.net/en/sv/sv03.5/199" alt="Charizard ex" />);
    const img = screen.getByAltText('Charizard ex');
    expect(img).toHaveAttribute('src', 'https://assets.tcgdex.net/en/sv/sv03.5/199/low.webp');

    fireEvent.error(img);

    const retriedImg = screen.getByAltText('Charizard ex');
    expect(retriedImg).toHaveAttribute(
      'src',
      'https://assets.tcgdex.net/en/sv/sv03.5/199/high.png'
    );
  });

  it('falls back to the placeholder when both variants fail to load', () => {
    render(<CardImage imageBase="https://assets.tcgdex.net/en/sv/sv03.5/199" alt="Charizard ex" />);
    const img = screen.getByAltText('Charizard ex');
    fireEvent.error(img);

    const retriedImg = screen.getByAltText('Charizard ex');
    fireEvent.error(retriedImg);

    expect(screen.getByText(/no image available/i)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
