// src/components/BinderZoomControl.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BinderZoomControl } from './BinderZoomControl';

describe('BinderZoomControl', () => {
  it('renders a slider reflecting the current zoom level', () => {
    render(<BinderZoomControl zoom={1.5} onZoomChange={() => {}} isZoomModeActive={false} />);
    expect(screen.getByRole('slider', { name: /zoom/i })).toHaveValue('1.5');
  });

  it('calls onZoomChange when the slider is moved', async () => {
    const onZoomChange = vi.fn();
    render(<BinderZoomControl zoom={1} onZoomChange={onZoomChange} isZoomModeActive={false} />);
    const slider = screen.getByRole('slider', { name: /zoom/i });
    fireEventChange(slider, '2');
    expect(onZoomChange).toHaveBeenCalledWith(2);
  });

  it('shows a zoom-mode hint only while zoom mode is active', () => {
    const { rerender } = render(
      <BinderZoomControl zoom={1} onZoomChange={() => {}} isZoomModeActive={false} />
    );
    expect(screen.queryByText(/scroll to zoom/i)).not.toBeInTheDocument();
    rerender(<BinderZoomControl zoom={1} onZoomChange={() => {}} isZoomModeActive />);
    expect(screen.getByText(/scroll to zoom/i)).toBeInTheDocument();
  });
});

// Testing Library's fireEvent.change on a range input needs a native value
// setter to work reliably with React-controlled inputs -- this small helper
// avoids repeating that boilerplate at each call site above.
function fireEventChange(element: HTMLElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  setter.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}
