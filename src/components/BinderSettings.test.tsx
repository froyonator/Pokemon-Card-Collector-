import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { BinderSettings } from './BinderSettings';
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
});
