import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SlotImageEditor } from './SlotImageEditor';
import { downloadCardSizedImage } from '../state/slotImageExport';

// The real implementation needs a live CanvasRenderingContext2D, unavailable
// in this project's jsdom test environment (verified live in a browser
// instead) -- this only needs to confirm the button is wired to call it
// with the editor's current crop transform.
vi.mock('../state/slotImageExport', () => ({
  downloadCardSizedImage: vi.fn().mockResolvedValue(undefined),
}));

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

  it('does not show a download-for-printing button before an image is loaded', () => {
    render(<SlotImageEditor initialImage={null} onSave={() => {}} onCancel={() => {}} />);
    expect(screen.queryByRole('button', { name: /download/i })).not.toBeInTheDocument();
  });

  it('renders the current crop at print size and downloads it when "Download for printing" is clicked', async () => {
    render(
      <SlotImageEditor
        initialImage={{ dataUri: 'data:image/png;base64,ABC', offsetX: 0.2, offsetY: -0.1, zoom: 1.5 }}
        onSave={() => {}}
        onCancel={() => {}}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /download for printing/i }));
    expect(downloadCardSizedImage).toHaveBeenCalledWith({
      dataUri: 'data:image/png;base64,ABC',
      offsetX: 0.2,
      offsetY: -0.1,
      zoom: 1.5,
    });
  });
});
