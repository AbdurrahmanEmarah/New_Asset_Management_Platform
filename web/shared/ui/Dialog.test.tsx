import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

function Parent({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  // An inline onClose, and parent state that changes on every keystroke, like the real dialogs.
  return (
    <Dialog title="Invite people" onClose={() => onClose()}>
      <input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <input aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
    </Dialog>
  );
}

describe('Dialog', () => {
  it('focuses the first field once, and keeps focus where the person is typing', async () => {
    render(<Parent onClose={vi.fn()} />);
    expect(screen.getByLabelText('Name')).toHaveFocus();
    await userEvent.click(screen.getByLabelText('Email'));
    await userEvent.type(screen.getByLabelText('Email'), 'nadia@gulf-fm.example');
    expect(screen.getByLabelText('Email')).toHaveFocus();
    expect(screen.getByLabelText('Email')).toHaveValue('nadia@gulf-fm.example');
    expect(screen.getByLabelText('Name')).toHaveValue('');
  });

  it('closes with Escape using the latest onClose', async () => {
    const onClose = vi.fn();
    render(<Parent onClose={onClose} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });
});
