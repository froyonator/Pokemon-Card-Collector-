import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SlotImageEditor } from './SlotImageEditor';

describe('SlotImageEditor', () => {
  it('shows an upload prompt when there is no image yet', () => {
    render(<SlotImageEditor initialImage={null} onSave={() => {}} onCancel={() => {}} />);
    expect(screen.getByLabelText(/upload an image/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('shows the zoom slider and Save/Cancel once an image is loaded', async () => {
    render(
      <SlotImageEditor
        initialImage={{ dataUri: 'data:image/png;base64,ABC', offsetX: 0, offsetY: 0, zoom: 1 }}
        onSave={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByRole('slider', { name: /zoom/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('calls onSave with the current crop transform', async () => {
    const onSave = vi.fn();
    render(
      <SlotImageEditor
        initialImage={{ dataUri: 'data:image/png;base64,ABC', offsetX: 0, offsetY: 0, zoom: 1 }}
        onSave={onSave}
        onCancel={() => {}}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({
      dataUri: 'data:image/png;base64,ABC',
      offsetX: 0,
      offsetY: 0,
      zoom: 1,
    });
  });

  it('calls onCancel and does not call onSave when Cancel is clicked', async () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(
      <SlotImageEditor
        initialImage={{ dataUri: 'data:image/png;base64,ABC', offsetX: 0, offsetY: 0, zoom: 1 }}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows a Remove image button that clears back to the upload prompt, only once an image is loaded', async () => {
    render(
      <SlotImageEditor
        initialImage={{ dataUri: 'data:image/png;base64,ABC', offsetX: 0, offsetY: 0, zoom: 1 }}
        onSave={() => {}}
        onCancel={() => {}}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove image' }));
    expect(screen.getByLabelText(/upload an image/i)).toBeInTheDocument();
  });
});
