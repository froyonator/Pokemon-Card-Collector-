import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Tutorial } from './Tutorial';

function renderWithTourTargets(onStart?: () => void) {
  render(
    <div>
      <div data-tutorial="tabs">tabs</div>
      <div data-tutorial="filter-bar">filters</div>
      <div data-tutorial="view-toggle">toggle</div>
      <div data-tutorial="first-tile">tile</div>
      <button data-tutorial="refresh-data">refresh</button>
      <div data-tutorial="export-import">export</div>
      <Tutorial onStart={onStart} />
    </div>
  );
}

describe('Tutorial', () => {
  it('renders a Tutorial button', () => {
    renderWithTourTargets();
    expect(screen.getByRole('button', { name: 'Tutorial' })).toBeInTheDocument();
  });

  it('starts the guided tour when the Tutorial button is clicked', async () => {
    renderWithTourTargets();
    await userEvent.click(screen.getByRole('button', { name: 'Tutorial' }));
    expect(
      await screen.findByText(/these tabs switch between the main dex grid/i)
    ).toBeInTheDocument();
  });

  it('calls onStart before starting the tour, so a host app can steer to the right tab first', async () => {
    const onStart = vi.fn();
    renderWithTourTargets(onStart);
    await userEvent.click(screen.getByRole('button', { name: 'Tutorial' }));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText(/these tabs switch between the main dex grid/i)
    ).toBeInTheDocument();
  });
});
