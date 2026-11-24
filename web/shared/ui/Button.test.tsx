import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('runs its action when enabled', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('says why it is disabled and does nothing when pressed', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick} disabledReason="Only the Platform Owner can create clients.">New client</Button>);
    const button = screen.getByRole('button', { name: 'New client' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription('Only the Platform Owner can create clients.');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
