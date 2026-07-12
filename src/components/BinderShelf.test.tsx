import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BinderShelf } from './BinderShelf';
import type { Binder } from '../types';

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
});
