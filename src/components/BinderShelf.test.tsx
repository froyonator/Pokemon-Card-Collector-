import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReducedMotion } from 'framer-motion';
import { BinderShelf } from './BinderShelf';
import { useAppStore } from '../state/store';
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

  describe('hover turn', () => {
    // The turn is pure CSS (see BinderShelf.module.css's `.book:hover
    // .volume` rule): hovering or focusing the stationary .book button
    // turns the nested .volume span to rotate3d(0, 1, 0, 35deg) via a class
    // selector, with no inline style and no mousemove tracking involved.
    // jsdom doesn't compute matched CSS rules for us, so these tests assert
    // on the DOM structure and classes the CSS hooks into rather than on
    // resolved transform values.

    it('renders the book button as the stationary hit target with no inline transform', () => {
      render(<BinderShelf binders={[makeBinder()]} onOpenBinder={() => {}} onCreateBinder={() => {}} />);
      const button = screen.getByRole('button', { name: 'Open My Binder' });
      const volume = button.querySelector('.volume') as HTMLElement;

      expect(volume).toBeInTheDocument();
      // No JS-driven inline transform -- the rest pose and the hover turn
      // both come entirely from the stylesheet.
      expect(volume.style.transform).toBe('');
    });

    it('does not crash on hover, focus, or mouse leave, and the hit target stays put', () => {
      render(<BinderShelf binders={[makeBinder()]} onOpenBinder={() => {}} onCreateBinder={() => {}} />);
      const button = screen.getByRole('button', { name: 'Open My Binder' });

      expect(() => fireEvent.mouseOver(button)).not.toThrow();
      expect(() => fireEvent.focus(button)).not.toThrow();
      expect(() => fireEvent.mouseLeave(button)).not.toThrow();
      expect(() => fireEvent.blur(button)).not.toThrow();

      // Still the same button, still clickable -- the rotation lives on the
      // nested .volume, never on the hit target itself.
      expect(button.style.transform).toBe('');
    });

    it('keeps the spine label readable text content through hover', async () => {
      render(<BinderShelf binders={[makeBinder()]} onOpenBinder={() => {}} onCreateBinder={() => {}} />);
      const button = screen.getByRole('button', { name: 'Open My Binder' });
      const spineText = button.querySelector('.spineText') as HTMLElement;
      expect(spineText).toHaveTextContent('My Binder');

      await userEvent.hover(button);
      expect(spineText).toHaveTextContent('My Binder');
    });

    it('clicking the volume mid-hover still opens the binder', async () => {
      const onOpenBinder = vi.fn();
      render(
        <BinderShelf binders={[makeBinder()]} onOpenBinder={onOpenBinder} onCreateBinder={() => {}} />
      );
      const button = screen.getByRole('button', { name: 'Open My Binder' });
      await userEvent.hover(button);
      await userEvent.click(button);
      expect(onOpenBinder).toHaveBeenCalledWith('a');
    });
  });

  describe('reduced motion', () => {
    beforeEach(() => {
      vi.mocked(useReducedMotion).mockReturnValue(true);
    });

    it('renders with no inline transform and does not crash on hover', () => {
      render(<BinderShelf binders={[makeBinder()]} onOpenBinder={() => {}} onCreateBinder={() => {}} />);
      const button = screen.getByRole('button', { name: 'Open My Binder' });
      const volume = button.querySelector('.volume') as HTMLElement;

      // The reduced-motion fallback (no rotation, a plain shadow cue) is
      // pure CSS via the `prefers-reduced-motion: reduce` media query --
      // there was never any JS tilt tracking to disable here.
      expect(volume.style.transform).toBe('');

      expect(() => fireEvent.mouseOver(button)).not.toThrow();
      expect(volume.style.transform).toBe('');

      expect(() => fireEvent.mouseLeave(button)).not.toThrow();
    });

    it('clicking still opens the binder with reduced motion active', async () => {
      const onOpenBinder = vi.fn();
      render(
        <BinderShelf binders={[makeBinder()]} onOpenBinder={onOpenBinder} onCreateBinder={() => {}} />
      );
      await userEvent.click(screen.getByRole('button', { name: 'Open My Binder' }));
      expect(onOpenBinder).toHaveBeenCalledWith('a');
    });
  });

  describe('delete binder', () => {
    // The delete button calls the real store's deleteBinder action directly
    // (see BinderShelf.tsx) rather than going through a prop, so the store's
    // binders need to match what's passed as the `binders` prop for the
    // assertions below to reflect what the click actually did.
    beforeEach(() => {
      useAppStore.setState({
        binders: [makeBinder(), makeBinder({ id: 'b', name: 'Shinies' })],
        activeBinderId: 'a',
      });
    });

    it('renders a delete button for every binder, labeled with the binder name', () => {
      render(
        <BinderShelf
          binders={[makeBinder(), makeBinder({ id: 'b', name: 'Shinies' })]}
          onOpenBinder={() => {}}
          onCreateBinder={() => {}}
        />
      );
      expect(screen.getByRole('button', { name: 'Delete binder My Binder' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Delete binder Shinies' })).toBeInTheDocument();
    });

    it('disables delete when it is the only binder, with an explanatory title', () => {
      useAppStore.setState({ binders: [makeBinder()], activeBinderId: 'a' });
      render(
        <BinderShelf binders={[makeBinder()]} onOpenBinder={() => {}} onCreateBinder={() => {}} />
      );
      const deleteButton = screen.getByRole('button', { name: 'Delete binder My Binder' });
      expect(deleteButton).toBeDisabled();
      expect(deleteButton).toHaveAttribute('title', 'At least one binder must remain');
    });

    it('does not disable delete when more than one binder exists', () => {
      render(
        <BinderShelf
          binders={[makeBinder(), makeBinder({ id: 'b', name: 'Shinies' })]}
          onOpenBinder={() => {}}
          onCreateBinder={() => {}}
        />
      );
      expect(screen.getByRole('button', { name: 'Delete binder My Binder' })).not.toBeDisabled();
    });

    it('asks for confirmation before deleting, and deletes nothing on cancel', async () => {
      render(
        <BinderShelf
          binders={[makeBinder(), makeBinder({ id: 'b', name: 'Shinies' })]}
          onOpenBinder={() => {}}
          onCreateBinder={() => {}}
        />
      );
      await userEvent.click(screen.getByRole('button', { name: 'Delete binder Shinies' }));
      const dialog = screen.getByRole('dialog', { name: 'Delete binder Shinies' });
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveTextContent('Shinies');
      expect(dialog).toHaveTextContent(/card collection and wishlist are not affected/i);

      await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(useAppStore.getState().binders.map((b) => b.id)).toEqual(['a', 'b']);
    });

    it('deletes only the confirmed binder from the store on confirm', async () => {
      render(
        <BinderShelf
          binders={[makeBinder(), makeBinder({ id: 'b', name: 'Shinies' })]}
          onOpenBinder={() => {}}
          onCreateBinder={() => {}}
        />
      );
      await userEvent.click(screen.getByRole('button', { name: 'Delete binder Shinies' }));
      await userEvent.click(screen.getByRole('button', { name: /^delete binder$/i }));

      // Only the confirmed binder ('b') is gone; the other survives.
      expect(useAppStore.getState().binders.map((b) => b.id)).toEqual(['a']);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('is reachable by keyboard and exposes the "Delete binder <name>" label', () => {
      // Two binders so the delete button isn't disabled -- a disabled
      // button is unfocusable by definition, which would make this a test
      // of the wrong thing.
      render(
        <BinderShelf
          binders={[makeBinder(), makeBinder({ id: 'b', name: 'Shinies' })]}
          onOpenBinder={() => {}}
          onCreateBinder={() => {}}
        />
      );
      const deleteButton = screen.getByRole('button', { name: 'Delete binder My Binder' });
      expect(deleteButton.tagName).toBe('BUTTON');
      expect(deleteButton).toHaveAttribute('aria-label', 'Delete binder My Binder');
      deleteButton.focus();
      expect(deleteButton).toHaveFocus();
    });
  });
});
