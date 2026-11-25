import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../shared/api/http';
import { ThemeProvider } from '../../../shared/theme/ThemeProvider';
import { Console } from './App';
import { timeLeft } from './pages/SupportPage';
import { BILLING, SUPPORT, client, fakeApi, fakeSupport, started } from './test-api';

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

  it('is reachable from the nav and lists the first client\'s passes with time left', async () => {
    const { support } = renderAt('/');
    const nav = await screen.findByRole('navigation', { name: 'Platform admin' });
    await userEvent.click(within(nav).getByRole('link', { name: /Support access/ }));
    const row = (await screen.findByText(/Ticket #4182/)).closest('tr')!;
    expect(within(row).getByText('Read-only')).toBeInTheDocument();
    expect(within(row).getByText('25 min left')).toBeInTheDocument();
    expect(within(row).getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Expired')).toBeInTheDocument();
    expect(support.passes).toHaveBeenCalledWith('c1');
  });

  it('opens a pass with a reason, duration and access level', async () => {
    const start = vi.fn().mockResolvedValue(started({ id: 'p2' }));
    renderAt('/support', fakeApi({ me: vi.fn().mockResolvedValue(SUPPORT) }), fakeSupport({ start }));
    await userEvent.click(await screen.findByRole('button', { name: /Request access/ }));
    const dialog = screen.getByRole('dialog', { name: 'Support access to Gulf Facilities Co.' });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Start 60-minute session' }));
    expect(within(dialog).getByText(/Say why you need access/)).toBeInTheDocument();
    expect(start).not.toHaveBeenCalled();

    expect(within(dialog).getByRole('option', { name: /Read and change/ })).toBeDisabled();
    expect(within(dialog).getByText(/Only the Platform Owner can open a pass with change access/)).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/Reason/), 'Ticket #4182: locations missing');
    await userEvent.selectOptions(within(dialog).getByLabelText('Duration'), '30');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Start 30-minute session' }));

    expect(start).toHaveBeenCalledWith('c1', { reason: 'Ticket #4182: locations missing', minutes: 30, access: 'read' });
    expect(await screen.findByText(/Support pass for Gulf Facilities Co. opened \(read-only\)/)).toBeInTheDocument();
  });

  it('lets the Platform Owner choose change access', async () => {
    const start = vi.fn().mockResolvedValue(started({ access: 'change' }));
    renderAt('/support', fakeApi(), fakeSupport({ start }));
    await userEvent.click(await screen.findByRole('button', { name: /Request access/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/Reason/), 'Ticket #4190: fix a broken import');
    await userEvent.selectOptions(within(dialog).getByLabelText(/Access/), 'change');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Start 60-minute session' }));
    expect(start).toHaveBeenCalledWith('c1', expect.objectContaining({ access: 'change' }));
  });

  it('tells billing staff why they cannot request access', async () => {
    renderAt('/support', fakeApi({ me: vi.fn().mockResolvedValue(BILLING) }));
    const button = await screen.findByRole('button', { name: /Request access/ });
    expect(button).toHaveAccessibleDescription('Only Support staff and the Platform Owner can request support access.');
  });

  it('ends a pass and shows the server reason when it cannot', async () => {
    const end = vi.fn().mockRejectedValueOnce(new ApiError(403, 'Only the person who opened this pass, or the Platform Owner, can end it.')).mockResolvedValue(started().pass);
    renderAt('/support', fakeApi(), fakeSupport({ end }));
    await userEvent.click(await screen.findByRole('button', { name: 'End support pass opened by Support Agent' }));
    expect(await screen.findByText(/Only the person who opened this pass/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'End support pass opened by Support Agent' }));
    expect(end).toHaveBeenLastCalledWith('c1', 'p1');
    expect(await screen.findByText('The support pass for Gulf Facilities Co. has ended.')).toBeInTheDocument();
  });

  it('shows load errors with a retry, and an empty state', async () => {
    const passes = vi.fn().mockRejectedValueOnce(new ApiError(0, "Can't reach the server.")).mockResolvedValue([]);
    renderAt('/support', fakeApi(), fakeSupport({ passes }));
    expect(await screen.findByText(/Support passes didn't load: Can't reach the server/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No support passes for this client')).toBeInTheDocument();
  });

  it('starts a request from a client row', async () => {
    const start = vi.fn().mockResolvedValue(started());
    renderAt('/', fakeApi({ listClients: vi.fn().mockResolvedValue([client()]) }), fakeSupport({ start }));
    await userEvent.click(await screen.findByRole('button', { name: 'Request support access to Gulf Facilities Co.' }));
    const dialog = await screen.findByRole('dialog', { name: 'Support access to Gulf Facilities Co.' });
    await userEvent.type(within(dialog).getByLabelText(/Reason/), 'Ticket #4190: fix a broken import');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Start 60-minute session' }));
    expect(await screen.findByText(/Follow it under Support access/)).toBeInTheDocument();
  });
});

describe('Owner invitation', () => {
  it('shows the status and makes a new link to copy', async () => {
    const { support } = renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Owner invitation for Gulf Facilities Co.' }));
    const dialog = await screen.findByRole('dialog', { name: 'Gulf Facilities Co.: Owner invitation' });
    expect(await within(dialog).findByText(/Not joined yet/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Make a new link' }));
    expect(support.reissueOwnerInvitation).toHaveBeenCalledWith('c1');
    expect(await within(dialog).findByDisplayValue('http://localhost:5174/join#abc')).toBeInTheDocument();
  });

  it('says why support staff cannot make a new link', async () => {
    renderAt('/', fakeApi({ me: vi.fn().mockResolvedValue(SUPPORT) }));
    await userEvent.click(await screen.findByRole('button', { name: 'Owner invitation for Gulf Facilities Co.' }));
    const button = await screen.findByRole('button', { name: 'Make a new link' });
    expect(button).toHaveAccessibleDescription('Only the Platform Owner can do this.');
  });

  it('says when the Owner has joined', async () => {
    renderAt('/', fakeApi(), fakeSupport({ ownerInvitation: vi.fn().mockResolvedValue({ clientId: 'c1', email: 'm@x.example', name: 'Mona Haddad', status: 'active', expiresAt: null, acceptUrl: null }) }));
    await userEvent.click(await screen.findByRole('button', { name: 'Owner invitation for Gulf Facilities Co.' }));
    expect(await screen.findByText("Mona Haddad has joined, so there's no invitation to send.")).toBeInTheDocument();
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
