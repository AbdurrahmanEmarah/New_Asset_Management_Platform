import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../shared/api/http';
import { ThemeProvider } from '../../../shared/theme/ThemeProvider';
import { Console } from './App';
import { timeLeft } from './pages/SupportPage';
import { BILLING, SUPPORT, client, fakeApi, fakeSupport, session } from './test-api';

function renderAt(path: string, api = fakeApi(), support = fakeSupport()) {
  window.history.pushState(null, '', path);
  render(<ThemeProvider><Console api={api} support={support} onSignOut={() => {}} /></ThemeProvider>);
  return { api, support };
}

describe('Support access page', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date('2026-11-24T09:35:00Z') });
  });
  afterEach(() => vi.useRealTimers());

  it('is reachable from the nav and lists active sessions with the time left', async () => {
    renderAt('/');
    const nav = await screen.findByRole('navigation', { name: 'Platform admin' });
    await userEvent.click(within(nav).getByRole('link', { name: /Support access/ }));
    const active = await screen.findByRole('region', { name: 'Active and waiting' });
    const row = (await within(active).findByText('Gulf Facilities Co.')).closest('tr')!;
    expect(within(row).getByText('Read-only')).toBeInTheDocument();
    expect(within(row).getByText('25 min left')).toBeInTheDocument();
    expect(within(row).getByText('Active')).toBeInTheDocument();
    expect(await screen.findByText('No past sessions')).toBeInTheDocument();
  });

  it('requests access with a reason, duration and access level', async () => {
    const request = vi.fn().mockResolvedValue(session({ id: 's2', durationMinutes: 30 }));
    const { support } = renderAt('/support', fakeApi({ me: vi.fn().mockResolvedValue(SUPPORT) }), fakeSupport({ request }));
    await userEvent.click(await screen.findByRole('button', { name: /Request access/ }));
    const dialog = screen.getByRole('dialog', { name: 'Request support access' });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Start 60-minute session' }));
    expect(within(dialog).getByText('Choose the client you need to help.')).toBeInTheDocument();
    expect(within(dialog).getByText(/Say why you need access/)).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();

    await within(dialog).findByRole('option', { name: /Gulf Facilities Co./ });
    await userEvent.selectOptions(within(dialog).getByLabelText(/Client/), 'c1');
    await userEvent.type(within(dialog).getByLabelText(/Reason/), 'Ticket #4182: locations missing');
    await userEvent.selectOptions(within(dialog).getByLabelText('Duration'), '30');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Start 30-minute session' }));

    expect(request).toHaveBeenCalledWith({ clientId: 'c1', reason: 'Ticket #4182: locations missing', durationMinutes: 30, access: 'read' });
    expect(await screen.findByText(/Support session with Gulf Facilities Co. started/)).toBeInTheDocument();
    expect(support.list).toHaveBeenCalledTimes(4);
  });

  it('explains that read and write needs the client to approve', async () => {
    renderAt('/support');
    await userEvent.click(await screen.findByRole('button', { name: /Request access/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText(/Access/), 'read_write');
    expect(within(dialog).getByText(/starts once one of the client's admins approves it/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Ask the client to approve' })).toBeInTheDocument();
  });

  it('tells billing staff why they cannot request access', async () => {
    renderAt('/support', fakeApi({ me: vi.fn().mockResolvedValue(BILLING) }));
    const button = await screen.findByRole('button', { name: /Request access/ });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription('Only Support staff and the Platform Owner can request support access.');
  });

  it('ends a session and shows the server reason when it cannot', async () => {
    const end = vi.fn().mockRejectedValueOnce(new ApiError(409, 'This session already ended.')).mockResolvedValue(session({ status: 'ended' }));
    renderAt('/support', fakeApi(), fakeSupport({ end }));
    await userEvent.click(await screen.findByRole('button', { name: 'End session with Gulf Facilities Co.' }));
    expect(await screen.findByText('This session already ended.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'End session with Gulf Facilities Co.' }));
    expect(await screen.findByText('The session with Gulf Facilities Co. has ended.')).toBeInTheDocument();
  });

  it('shows load errors with a retry, and an empty state', async () => {
    const list = vi.fn().mockRejectedValueOnce(new ApiError(0, "Can't reach the server.")).mockResolvedValue([]);
    renderAt('/support', fakeApi(), fakeSupport({ list }));
    expect(await screen.findByText(/didn't load: Can't reach the server/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No open sessions')).toBeInTheDocument();
  });

  it('starts a request from a client row with that client chosen', async () => {
    const request = vi.fn().mockResolvedValue(session({ status: 'pending_approval', access: 'read_write' }));
    renderAt('/', fakeApi({ listClients: vi.fn().mockResolvedValue([client()]) }), fakeSupport({ request }));
    await userEvent.click(await screen.findByRole('button', { name: 'Request support access to Gulf Facilities Co.' }));
    const dialog = await screen.findByRole('dialog', { name: 'Support access to Gulf Facilities Co.' });
    await userEvent.type(within(dialog).getByLabelText(/Reason/), 'Ticket #4190: fix a broken import');
    await userEvent.selectOptions(within(dialog).getByLabelText(/Access/), 'read_write');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ask the client to approve' }));
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'c1', access: 'read_write' }));
    expect(await screen.findByText(/admins were asked to approve/)).toBeInTheDocument();
  });
});

describe('timeLeft', () => {
  const now = new Date('2026-11-24T09:00:00Z').getTime();
  it('formats minutes and hours', () => {
    expect(timeLeft('2026-11-24T09:30:00Z', now)).toBe('30 min left');
    expect(timeLeft('2026-11-24T11:15:00Z', now)).toBe('2 h 15 min left');
    expect(timeLeft('2026-11-24T13:00:00Z', now)).toBe('4 h left');
    expect(timeLeft('2026-11-24T08:00:00Z', now)).toBe('Ending now');
    expect(timeLeft(null, now)).toBe('–');
  });
});
