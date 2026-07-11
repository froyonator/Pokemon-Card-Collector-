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

  it('requests the high-resolution PNG variant first when preferHighQuality is set', () => {
    render(
      <CardImage
        imageBase="https://assets.tcgdex.net/en/sv/sv03.5/199"
        alt="Charizard ex"
        preferHighQuality
      />
    );
    const img = screen.getByAltText('Charizard ex');
    expect(img).toHaveAttribute(
      'src',
      'https://assets.tcgdex.net/en/sv/sv03.5/199/high.png'
    );
  });

  it('falls back to the low-resolution webp variant when the high-res one fails to load, under preferHighQuality', () => {
    render(
      <CardImage
        imageBase="https://assets.tcgdex.net/en/sv/sv03.5/199"
        alt="Charizard ex"
        preferHighQuality
      />
    );
    const img = screen.getByAltText('Charizard ex');
    fireEvent.error(img);
    const retriedImg = screen.getByAltText('Charizard ex');
    expect(retriedImg).toHaveAttribute(
      'src',
      'https://assets.tcgdex.net/en/sv/sv03.5/199/low.webp'
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

  it('ignores a stale uploadedImageUri and shows the real image when imageBase is valid', () => {
    render(
      <CardImage
        imageBase="https://assets.tcgdex.net/en/sv/sv03.5/199"
        alt="Charizard ex"
        uploadedImageUri="data:image/jpeg;base64,STALE"
      />
    );
    const img = screen.getByAltText('Charizard ex');
    expect(img).toHaveAttribute('src', 'https://assets.tcgdex.net/en/sv/sv03.5/199/low.webp');
  });

  it('falls back to a stale uploadedImageUri only once the real image variants are actually exhausted', () => {
    render(
      <CardImage
        imageBase="https://assets.tcgdex.net/en/sv/sv03.5/199"
        alt="Charizard ex"
        uploadedImageUri="data:image/jpeg;base64,FALLBACK"
      />
    );
    const img = screen.getByAltText('Charizard ex');
    // Still showing the real image at this point, not the uploaded one.
    expect(img).toHaveAttribute('src', 'https://assets.tcgdex.net/en/sv/sv03.5/199/low.webp');

    fireEvent.error(img);
    fireEvent.error(screen.getByAltText('Charizard ex'));

    expect(screen.getByAltText('Charizard ex')).toHaveAttribute(
      'src',
      'data:image/jpeg;base64,FALLBACK'
    );
  });

  it('shows a "Remove uploaded image" button only when an uploaded image is actually being shown, and clicking it calls onRemoveUploadedImage', async () => {
    const onRemoveUploadedImage = vi.fn();
    render(
      <CardImage
        imageBase=""
        alt="Charizard ex"
        uploadedImageUri="data:image/jpeg;base64,ABC123"
        onRemoveUploadedImage={onRemoveUploadedImage}
      />
    );
    const removeButton = screen.getByRole('button', { name: /remove uploaded image/i });
    await userEvent.click(removeButton);
    expect(onRemoveUploadedImage).toHaveBeenCalledTimes(1);
  });

  it('does not show a "Remove uploaded image" button for a card with no uploaded image, even when onRemoveUploadedImage is provided', () => {
    render(
      <CardImage imageBase="" alt="Mystery card" onRemoveUploadedImage={() => {}} />
    );
    expect(screen.queryByRole('button', { name: /remove uploaded image/i })).not.toBeInTheDocument();
  });

  it('does not render a "Remove uploaded image" button when onRemoveUploadedImage is not provided, even with an uploaded image showing', () => {
    render(
      <CardImage imageBase="" alt="Charizard ex" uploadedImageUri="data:image/jpeg;base64,ABC123" />
    );
    expect(screen.queryByRole('button', { name: /remove uploaded image/i })).not.toBeInTheDocument();
  });

  it('renders the placeholder identically to the no-props case (exact same shape: one role=img element, no wrapper, no img, no buttons) when onSearchImage/onUploadImage are not provided', () => {
    const { container } = render(<CardImage imageBase="" alt="Mystery card" />);
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild).toHaveAttribute('role', 'img');
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.querySelectorAll('input')).toHaveLength(0);
  });

  it('pressing Enter or Space while the Search button is focused still calls onSearchImage (keyboard activation works)', async () => {
    const onSearchImage = vi.fn();
    render(<CardImage imageBase="" alt="Mystery card" onSearchImage={onSearchImage} />);
    const searchButton = screen.getByRole('button', { name: 'Search' });
    searchButton.focus();
    await userEvent.keyboard('{Enter}');
    expect(onSearchImage).toHaveBeenCalledTimes(1);
    await userEvent.keyboard(' ');
    expect(onSearchImage).toHaveBeenCalledTimes(2);
  });

  describe('hosted image URLs', () => {
    it('renders hostedThumbUrl instead of the imageBase-constructed URL when both are present', () => {
      render(
        <CardImage
          imageBase="https://assets.tcgdex.net/en/sv/sv03.5/199"
          hostedThumbUrl="https://raw.githubusercontent.com/example/repo/main/en/sv03.5/199/thumb.webp"
          alt="Charizard ex"
        />
      );
      const img = screen.getByAltText('Charizard ex');
      expect(img).toHaveAttribute(
        'src',
        'https://raw.githubusercontent.com/example/repo/main/en/sv03.5/199/thumb.webp'
      );
    });

    it('renders hostedThumbUrl even when imageBase is empty (a fallback-only match with no primary image)', () => {
      render(
        <CardImage
          imageBase=""
          hostedThumbUrl="https://raw.githubusercontent.com/example/repo/main/en/sv03.5/199/thumb.webp"
          alt="Charizard ex"
        />
      );
      expect(screen.getByAltText('Charizard ex')).toHaveAttribute(
        'src',
        'https://raw.githubusercontent.com/example/repo/main/en/sv03.5/199/thumb.webp'
      );
      expect(screen.queryByText(/no image available/i)).not.toBeInTheDocument();
    });

    it('falls back to the imageBase-constructed URL, completely unchanged, when no hosted URL is present', () => {
      render(
        <CardImage imageBase="https://assets.tcgdex.net/en/sv/sv03.5/199" alt="Charizard ex" />
      );
      expect(screen.getByAltText('Charizard ex')).toHaveAttribute(
        'src',
        'https://assets.tcgdex.net/en/sv/sv03.5/199/low.webp'
      );
    });

    it('prefers hostedFullUrl (not hostedThumbUrl) when preferHighQuality is set', () => {
      render(
        <CardImage
          imageBase="https://assets.tcgdex.net/en/sv/sv03.5/199"
          hostedThumbUrl="https://raw.githubusercontent.com/example/repo/main/en/sv03.5/199/thumb.webp"
          hostedFullUrl="https://raw.githubusercontent.com/example/repo/main/en/sv03.5/199/original.webp"
          alt="Charizard ex"
          preferHighQuality
        />
      );
      expect(screen.getByAltText('Charizard ex')).toHaveAttribute(
        'src',
        'https://raw.githubusercontent.com/example/repo/main/en/sv03.5/199/original.webp'
      );
    });

    it('ignores hostedThumbUrl when preferHighQuality is set and hostedFullUrl is absent, falling back to the imageBase construction', () => {
      render(
        <CardImage
          imageBase="https://assets.tcgdex.net/en/sv/sv03.5/199"
          hostedThumbUrl="https://raw.githubusercontent.com/example/repo/main/en/sv03.5/199/thumb.webp"
          alt="Charizard ex"
          preferHighQuality
        />
      );
      expect(screen.getByAltText('Charizard ex')).toHaveAttribute(
        'src',
        'https://assets.tcgdex.net/en/sv/sv03.5/199/high.png'
      );
    });

    it('falls to the placeholder (not the imageBase variant chain) when the hosted image itself fails to load', () => {
      render(
        <CardImage
          imageBase="https://assets.tcgdex.net/en/sv/sv03.5/199"
          hostedThumbUrl="https://raw.githubusercontent.com/example/repo/main/en/sv03.5/199/thumb.webp"
          alt="Charizard ex"
        />
      );
      const img = screen.getByAltText('Charizard ex');
      fireEvent.error(img);
      expect(screen.getByText(/no image available/i)).toBeInTheDocument();
      expect(screen.queryByAltText('Charizard ex')).not.toBeInTheDocument();
    });

    it('resets stale exhausted state when hostedThumbUrl changes on an already-mounted instance', () => {
      const { rerender } = render(
        <CardImage
          imageBase=""
          hostedThumbUrl="https://raw.githubusercontent.com/example/repo/main/en/sv03.5/199/thumb.webp"
          alt="Charizard ex"
        />
      );
      fireEvent.error(screen.getByAltText('Charizard ex'));
      expect(screen.getByText(/no image available/i)).toBeInTheDocument();

      rerender(
        <CardImage
          imageBase=""
          hostedThumbUrl="https://raw.githubusercontent.com/example/repo/main/en/ja12/74/thumb.webp"
          alt="Pikachu"
        />
      );
      expect(screen.queryByText(/no image available/i)).not.toBeInTheDocument();
      expect(screen.getByAltText('Pikachu')).toHaveAttribute(
        'src',
        'https://raw.githubusercontent.com/example/repo/main/en/ja12/74/thumb.webp'
      );
    });
  });
});
