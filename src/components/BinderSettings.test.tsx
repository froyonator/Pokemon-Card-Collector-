import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BinderSettings } from './BinderSettings';
import { COVER_COLORS } from '../data/binderCovers';
import { useAppStore } from '../state/store';

function resetStore() {
  useAppStore.setState({
    binders: [
      {
        id: 'a',
        name: 'My Binder',
        language: 'en',
        config: { rows: 3, columns: 3, pageCount: 17, fillDirection: 'horizontal' },
        customOrder: null,
      },
    ],
    activeBinderId: 'a',
    hasUnsavedChanges: false,
  });
}

describe('BinderSettings', () => {
  beforeEach(resetStore);

  it('shows the active binder\'s name in an editable field', () => {
    render(<BinderSettings isManualArrangeActive={false} onToggleManualArrange={() => {}} />);
    expect(screen.getByLabelText(/binder name/i)).toHaveValue('My Binder');
  });

  it('editing the name field renames the active binder', async () => {
    render(<BinderSettings isManualArrangeActive={false} onToggleManualArrange={() => {}} />);
    const input = screen.getByLabelText(/binder name/i);
    await userEvent.clear(input);
    await userEvent.type(input, 'Chinese Binder');
    expect(useAppStore.getState().binders[0].name).toBe('Chinese Binder');
  });

  it('shows a language selector defaulting to the active binder\'s language', () => {
    render(<BinderSettings isManualArrangeActive={false} onToggleManualArrange={() => {}} />);
    expect(screen.getByLabelText(/binder language/i)).toHaveValue('en');
  });

  it('changing the language selector updates the active binder\'s language', async () => {
    render(<BinderSettings isManualArrangeActive={false} onToggleManualArrange={() => {}} />);
    await userEvent.selectOptions(screen.getByLabelText(/binder language/i), 'zh-cn');
    expect(useAppStore.getState().binders[0].language).toBe('zh-cn');
  });

  it('lists every binder in a switcher, and selecting one makes it active', async () => {
    useAppStore.getState().createBinder('Second Binder', 'ja');
    render(<BinderSettings isManualArrangeActive={false} onToggleManualArrange={() => {}} />);
    const switcher = screen.getByLabelText(/switch binder/i);
    expect(screen.getByRole('option', { name: 'My Binder' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Second Binder' })).toBeInTheDocument();
    await userEvent.selectOptions(switcher, 'My Binder');
    expect(useAppStore.getState().activeBinderId).toBe('a');
  });

  it('a "New binder" button creates and switches to a new binder', async () => {
    render(<BinderSettings isManualArrangeActive={false} onToggleManualArrange={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /new binder/i }));
    const state = useAppStore.getState();
    expect(state.binders).toHaveLength(2);
    expect(state.activeBinderId).toBe(state.binders[1].id);
  });

  it('places the Manual arrange toggle before the grid size / page count / fill direction controls', () => {
    render(
      <BinderSettings isManualArrangeActive={false} onToggleManualArrange={() => {}} />
    );
    const settingsRoot = screen.getByRole('group', { name: /binder settings/i }) ?? document.body;
    const allText = settingsRoot.textContent ?? '';
    const manualArrangeIndex = allText.indexOf('Manual arrange');
    const pageCountIndex = allText.indexOf('Page count');
    expect(manualArrangeIndex).toBeGreaterThan(-1);
    expect(pageCountIndex).toBeGreaterThan(-1);
    expect(manualArrangeIndex).toBeLessThan(pageCountIndex);
  });

  it('relabels the toggle to "Done arranging" while manual arrange is active, so the exit is obvious', () => {
    render(<BinderSettings isManualArrangeActive onToggleManualArrange={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Manual arrange' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done arranging' })).toBeInTheDocument();
  });

  describe('Cover section', () => {
    it('renders one swatch per palette color, each actually filled with its own color', () => {
      render(<BinderSettings isManualArrangeActive={false} onToggleManualArrange={() => {}} />);
      const swatchGroup = screen.getByRole('radiogroup', { name: /cover color/i });
      const swatchButtons = within(swatchGroup).getAllByRole('button');
      expect(swatchButtons).toHaveLength(COVER_COLORS.length);
      COVER_COLORS.forEach((swatch) => {
        const button = within(swatchGroup).getByRole('button', { name: `${swatch.name} cover` });
        expect(button).toHaveStyle({ backgroundColor: swatch.value });
        // The color name is exposed both as an accessible name (for screen
        // readers) and a tooltip (for sighted mouse users), since the six
        // dark leather tones alone aren't reliably distinguishable at a
        // glance.
        expect(button).toHaveAttribute('title', swatch.name);
      });
    });

    it('marks the active binder\'s current cover color as pressed, defaulting to Oxblood', () => {
      render(<BinderSettings isManualArrangeActive={false} onToggleManualArrange={() => {}} />);
      expect(screen.getByRole('button', { name: 'Oxblood cover' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      expect(screen.getByRole('button', { name: 'Forest cover' })).toHaveAttribute(
        'aria-pressed',
        'false'
      );
    });

    it('clicking a swatch sets the active binder\'s cover color', async () => {
      render(<BinderSettings isManualArrangeActive={false} onToggleManualArrange={() => {}} />);
      await userEvent.click(screen.getByRole('button', { name: 'Navy cover' }));
      expect(useAppStore.getState().binders[0].cover?.color).toBe('#1c2740');
      expect(screen.getByRole('button', { name: 'Navy cover' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
    });

    it('hides the native file input and offers a styled button instead, so nothing overflows the sidebar', () => {
      render(<BinderSettings isManualArrangeActive={false} onToggleManualArrange={() => {}} />);
      const fileInput = screen.getByLabelText(/upload cover picture/i);
      expect(fileInput).toHaveClass('hiddenInput');
      expect(screen.getByRole('button', { name: /choose picture/i })).toBeInTheDocument();
    });

    it('clicking the styled "Choose picture..." button opens the hidden file picker', async () => {
      render(<BinderSettings isManualArrangeActive={false} onToggleManualArrange={() => {}} />);
      const fileInput = screen.getByLabelText(/upload cover picture/i) as HTMLInputElement;
      const clickSpy = vi.spyOn(fileInput, 'click');
      await userEvent.click(screen.getByRole('button', { name: /choose picture/i }));
      expect(clickSpy).toHaveBeenCalled();
    });

    it('shows no picture-set confirmation or Remove button when no cover picture is set', () => {
      render(<BinderSettings isManualArrangeActive={false} onToggleManualArrange={() => {}} />);
      expect(screen.queryByText(/picture set/i)).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /remove cover picture/i })
      ).not.toBeInTheDocument();
    });

    it('shows a thumbnail confirmation and a Remove button once a cover picture is set', async () => {
      useAppStore.setState((state) => ({
        binders: state.binders.map((binder) =>
          binder.id === 'a'
            ? { ...binder, cover: { coverImageUri: 'data:image/png;base64,ABC' } }
            : binder
        ),
      }));
      render(<BinderSettings isManualArrangeActive={false} onToggleManualArrange={() => {}} />);
      expect(screen.getByText(/picture set/i)).toBeInTheDocument();
      const thumb = screen.getByAltText('') as HTMLImageElement;
      expect(thumb.src).toContain('data:image/png;base64,ABC');
      await userEvent.click(screen.getByRole('button', { name: /remove cover picture/i }));
      expect(useAppStore.getState().binders[0].cover?.coverImageUri).toBeUndefined();
    });
  });
});
