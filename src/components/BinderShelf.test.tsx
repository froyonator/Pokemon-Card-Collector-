import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReducedMotion } from 'framer-motion';
import { BinderShelf } from './BinderShelf';
import type { Binder } from '../types';

// Defaults to motion enabled (matches this file's previous behavior, back
// when BinderShelf used no framer-motion hooks at all -- jsdom has no
// matchMedia, and useReducedMotion falls back to false without one). The
// dedicated reduced-motion block below flips this to true for its own
// tests, same convention as BinderView.test.tsx.
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return { ...actual, useReducedMotion: vi.fn(() => false) };
});

beforeEach(() => {
  vi.mocked(useReducedMotion).mockReturnValue(false);
});

function makeBinder(overrides: Partial<Binder> = {}): Binder {
  return {
    id: 'a',
    name: 'My Binder',
    language: 'en',
    config: { rows: 3, columns: 3, pageCount: 17, fillDirection: 'horizontal' },
    customOrder: null,
    ...overrides,
  };
}

describe('BinderShelf', () => {
  it('renders every binder as an openable volume', () => {
    render(
      <BinderShelf
        binders={[makeBinder(), makeBinder({ id: 'b', name: 'Shinies' })]}
        onOpenBinder={() => {}}
        onCreateBinder={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: 'Open My Binder' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Shinies' })).toBeInTheDocument();
  });

  it('clicking a volume opens that binder', async () => {
    const onOpenBinder = vi.fn();
    render(
      <BinderShelf
        binders={[makeBinder(), makeBinder({ id: 'b', name: 'Shinies' })]}
        onOpenBinder={onOpenBinder}
        onCreateBinder={() => {}}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open Shinies' }));
    expect(onOpenBinder).toHaveBeenCalledWith('b');
  });

  it('creating a binder asks for a name first, then reports it', async () => {
    const onCreateBinder = vi.fn();
    render(
      <BinderShelf binders={[makeBinder()]} onOpenBinder={() => {}} onCreateBinder={onCreateBinder} />
    );
    await userEvent.click(screen.getByRole('button', { name: /new binder/i }));
    await userEvent.type(screen.getByLabelText(/binder name/i), 'Trades');
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect(onCreateBinder).toHaveBeenCalledWith('Trades');
  });

  it('falls back to a default name when the create form is submitted empty', async () => {
    const onCreateBinder = vi.fn();
    render(
      <BinderShelf binders={[makeBinder()]} onOpenBinder={() => {}} onCreateBinder={onCreateBinder} />
    );
    await userEvent.click(screen.getByRole('button', { name: /new binder/i }));
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect(onCreateBinder).toHaveBeenCalledWith('New Binder');
  });

  it("shows a binder's customized spine label and mounted cover picture", () => {
    render(
      <BinderShelf
        binders={[
          makeBinder({
            cover: {
              color: '#1e3325',
              spineText: 'GEN 1 FULL ARTS',
              coverImageUri: 'data:image/png;base64,ABC',
            },
          }),
        ]}
        onOpenBinder={() => {}}
        onCreateBinder={() => {}}
      />
    );
    expect(screen.getByText('GEN 1 FULL ARTS')).toBeInTheDocument();
    const volume = screen.getByRole('button', { name: 'Open My Binder' });
    expect(volume.querySelector('img')).toHaveAttribute('src', 'data:image/png;base64,ABC');
  });

  describe('full-bleed cover picture', () => {
    it('renders a mounted cover picture edge to edge, with a legibility scrim behind the title', () => {
      render(
        <BinderShelf
          binders={[
            makeBinder({
              cover: { color: '#1e3325', coverImageUri: 'data:image/png;base64,ABC' },
            }),
          ]}
          onOpenBinder={() => {}}
          onCreateBinder={() => {}}
        />
      );
      const volume = screen.getByRole('button', { name: 'Open My Binder' });
      const cover = volume.querySelector('.cover') as HTMLElement;
      const image = cover.querySelector('img') as HTMLImageElement;
      expect(image).toHaveClass('coverPlate');
      // The scrim sits behind the title, over the full-bleed image.
      expect(cover.querySelector('.coverScrim')).toBeInTheDocument();
      // The title itself gets the on-image contrast treatment. (Queried by
      // class, not text, since the plaque below the volume repeats the same
      // binder name as its own separate span.)
      const title = cover.querySelector('.coverTitle') as HTMLElement;
      expect(title).toHaveClass('coverTitleOnImage');
      expect(title).toHaveTextContent('My Binder');
      // No picture mounted means no framed plate -- it's the full-bleed
      // image class or nothing.
      expect(cover.querySelector('.coverEmblem')).not.toBeInTheDocument();
    });

    it('leaves the empty-state emblem exactly as before when no cover picture is set', () => {
      render(<BinderShelf binders={[makeBinder()]} onOpenBinder={() => {}} onCreateBinder={() => {}} />);
      const volume = screen.getByRole('button', { name: 'Open My Binder' });
      const cover = volume.querySelector('.cover') as HTMLElement;
      expect(cover.querySelector('img')).not.toBeInTheDocument();
      expect(cover.querySelector('.coverScrim')).not.toBeInTheDocument();
      expect(cover.querySelector('.coverEmblem')).toBeInTheDocument();
      const title = cover.querySelector('.coverTitle') as HTMLElement;
      expect(title).not.toHaveClass('coverTitleOnImage');
    });
  });

  describe('cursor tilt', () => {
    function setVolumeRect(button: HTMLElement, width = 158, height = 216) {
      button.getBoundingClientRect = () => new DOMRect(0, 0, width, height);
    }

    it('leans the volume toward the cursor on mouse move, and springs back on mouse leave', () => {
      render(<BinderShelf binders={[makeBinder()]} onOpenBinder={() => {}} onCreateBinder={() => {}} />);
      const button = screen.getByRole('button', { name: 'Open My Binder' });
      setVolumeRect(button);
      const volume = button.querySelector('.volume') as HTMLElement;

      // At rest, before any hover: the resting rotateY is still applied
      // inline (so JS and CSS agree on the starting pose), no tilt tracking
      // active yet.
      expect(volume).not.toHaveClass('volumeTilting');
      expect(volume.style.transform).toContain('rotateY(-24deg)');

      fireEvent.mouseMove(button, { clientX: 158, clientY: 0 });
      expect(volume).toHaveClass('volumeTilting');
      // Cursor at the far right, top edge: rotateY swings past the resting
      // angle and rotateX tilts the top back.
      expect(volume.style.transform).toContain('rotateY(-4deg)');
      expect(volume.style.transform).toContain('rotateX(7deg)');

      fireEvent.mouseLeave(button);
      expect(volume).not.toHaveClass('volumeTilting');
      expect(volume.style.transform).toContain('rotateY(-24deg)');
      expect(volume.style.transform).toContain('rotateX(0deg)');
    });

    it('does not crash when the mouse moves before the volume has a measurable rect', () => {
      render(<BinderShelf binders={[makeBinder()]} onOpenBinder={() => {}} onCreateBinder={() => {}} />);
      const button = screen.getByRole('button', { name: 'Open My Binder' });
      // jsdom's default getBoundingClientRect is all zeros -- computeCardTilt
      // must handle the zero-area case without dividing by zero.
      expect(() => fireEvent.mouseMove(button, { clientX: 10, clientY: 10 })).not.toThrow();
    });
  });

  describe('reduced motion', () => {
    beforeEach(() => {
      vi.mocked(useReducedMotion).mockReturnValue(true);
    });

    it('renders with no tilt tracking and does not crash on hover', () => {
      render(<BinderShelf binders={[makeBinder()]} onOpenBinder={() => {}} onCreateBinder={() => {}} />);
      const button = screen.getByRole('button', { name: 'Open My Binder' });
      button.getBoundingClientRect = () => new DOMRect(0, 0, 158, 216);
      const volume = button.querySelector('.volume') as HTMLElement;

      // No inline transform at all -- the resting pose comes from the CSS
      // class instead, and the hover fallback (a simple lift) is pure CSS.
      expect(volume.style.transform).toBe('');

      expect(() => fireEvent.mouseMove(button, { clientX: 158, clientY: 0 })).not.toThrow();
      expect(volume).not.toHaveClass('volumeTilting');
      expect(volume.style.transform).toBe('');

      expect(() => fireEvent.mouseLeave(button)).not.toThrow();
    });
  });
});
