import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GridSizePicker } from './GridSizePicker';

describe('GridSizePicker', () => {
  it('shows the current selection as a label', () => {
    render(<GridSizePicker rows={3} columns={4} onChange={() => {}} />);
    expect(screen.getByText('4 x 3')).toBeInTheDocument();
  });

  it('calls onChange with the hovered cell as rows/columns when clicked', async () => {
    const onChange = vi.fn();
    render(<GridSizePicker rows={3} columns={3} onChange={onChange} />);
    // Cells are exposed with an accessible name encoding their position,
    // e.g. "2 x 5" for column index 1 (0-based), row index 4 (0-based).
    await userEvent.click(screen.getByRole('button', { name: '2 x 5' }));
    expect(onChange).toHaveBeenCalledWith({ rows: 5, columns: 2 });
  });

  it('caps the grid at 10x10', () => {
    render(<GridSizePicker rows={3} columns={3} onChange={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(100);
  });
});
