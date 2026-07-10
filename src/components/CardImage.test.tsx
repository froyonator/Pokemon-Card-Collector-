import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CardImage } from './CardImage';

describe('CardImage', () => {
  it('renders the image at the default low/webp variant when imageBase is present', () => {
    render(<CardImage imageBase="https://assets.tcgdex.net/en/sv/sv03.5/199" alt="Charizard ex" />);
    const img = screen.getByAltText('Charizard ex');
    expect(img).toHaveAttribute('src', 'https://assets.tcgdex.net/en/sv/sv03.5/199/low.webp');
  });

  it('renders the "No image available" placeholder immediately when imageBase is empty, with no img attempted', () => {
    const { container } = render(<CardImage imageBase="" alt="Mystery card" />);
    expect(screen.getByText(/no image available/i)).toBeInTheDocument();
    expect(container.querySelector('img')).not.toBeInTheDocument();
  });

  it('gives the placeholder an accessible name matching the card, not just the generic visible text', () => {
    render(<CardImage imageBase="" alt="Charizard ex from 151" />);
    const placeholder = screen.getByRole('img', { name: 'Charizard ex from 151' });
    expect(placeholder).toHaveTextContent(/no image available/i);
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
    const { container } = render(
      <CardImage imageBase="https://assets.tcgdex.net/en/sv/sv03.5/199" alt="Charizard ex" />
    );
    const img = screen.getByAltText('Charizard ex');
    fireEvent.error(img);

    const retriedImg = screen.getByAltText('Charizard ex');
    fireEvent.error(retriedImg);

    expect(screen.getByText(/no image available/i)).toBeInTheDocument();
    expect(container.querySelector('img')).not.toBeInTheDocument();
  });

  it('resets stale retry/exhausted state when imageBase changes on an already-mounted instance', () => {
    const { rerender, container } = render(
      <CardImage imageBase="https://assets.tcgdex.net/en/sv/sv03.5/199" alt="Charizard ex" />
    );
    // Exhaust both variants for the first card, reaching the placeholder.
    fireEvent.error(screen.getByAltText('Charizard ex'));
    fireEvent.error(screen.getByAltText('Charizard ex'));
    expect(screen.getByText(/no image available/i)).toBeInTheDocument();

    // A different, perfectly valid card is now shown via the same mounted
    // instance (e.g. the user re-marked a different card owned for the same
    // Pokemon in DexGrid, which keeps Tile mounted across tab switches).
    rerender(<CardImage imageBase="https://assets.tcgdex.net/en/swsh/swsh35/74" alt="Pikachu VMAX" />);

    expect(screen.queryByText(/no image available/i)).not.toBeInTheDocument();
    const img = screen.getByAltText('Pikachu VMAX');
    expect(img).toHaveAttribute('src', 'https://assets.tcgdex.net/en/swsh/swsh35/74/low.webp');
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('renders the placeholder with no Search/Upload controls when onSearchImage/onUploadImage are not provided, unchanged from today', () => {
    render(<CardImage imageBase="" alt="Mystery card" />);
    expect(screen.getByText(/no image available/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Search' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /upload image/i })).not.toBeInTheDocument();
  });

  it('shows a Search button on the placeholder when onSearchImage is provided, and clicking it calls onSearchImage', async () => {
    const onSearchImage = vi.fn();
    render(<CardImage imageBase="" alt="Mystery card" onSearchImage={onSearchImage} />);
    const searchButton = screen.getByRole('button', { name: 'Search' });
    await userEvent.click(searchButton);
    expect(onSearchImage).toHaveBeenCalledTimes(1);
    // The placeholder itself is still shown alongside the new controls.
    expect(screen.getByText(/no image available/i)).toBeInTheDocument();
  });

  it('shows an upload control on the placeholder when onUploadImage is provided, and selecting a file calls it with that file', async () => {
    const onUploadImage = vi.fn();
    const { container } = render(
      <CardImage imageBase="" alt="Mystery card" onUploadImage={onUploadImage} />
    );
    const file = new File(['fake-bytes'], 'photo.jpg', { type: 'image/jpeg' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);
    expect(onUploadImage).toHaveBeenCalledTimes(1);
    expect(onUploadImage).toHaveBeenCalledWith(file);
  });

  it('renders an uploadedImageUri directly via <img>, bypassing cardImageUrl variant logic, even when imageBase is empty', () => {
    render(
      <CardImage
        imageBase=""
        alt="Charizard ex"
        uploadedImageUri="data:image/jpeg;base64,ABC123"
      />
    );
    const img = screen.getByAltText('Charizard ex');
    expect(img).toHaveAttribute('src', 'data:image/jpeg;base64,ABC123');
    expect(screen.queryByText(/no image available/i)).not.toBeInTheDocument();
  });
});
