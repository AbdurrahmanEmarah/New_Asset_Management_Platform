import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../shared/api/http';
import { renderWorkspace } from './test-utils';

const row = async (text: string) => (await screen.findByText(text)).closest('tr')!;

describe('Settings › Users', () => {
  it('lists people with their roles, sites, status and seats', async () => {
    renderWorkspace('/settings/users');
    const sara = await row('Sara Nasser');
    expect(within(sara).getByText('Maintenance Planner · HQ Tower, Tower B')).toBeInTheDocument();
    expect(within(await row('Yusuf Rahman')).getByText('Technician · Tower B, North depot')).toBeInTheDocument();
    expect(within(await row('Omar Fathi')).getByText('Admin · All sites')).toBeInTheDocument();
    expect(within(sara).getByText('Active')).toBeInTheDocument();
    const layla = await row('layla@gulf-fm.example');
    expect(within(layla).getByText('Invite sent')).toBeInTheDocument();
    expect(within(layla).getByText('Not accepted yet')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Seats: 5 of 25' })).toBeInTheDocument();
  });

  it('explains why the last Owner and your own account cannot be deactivated', async () => {
    renderWorkspace('/settings/users', { meId: 'u-omar' });
    const mona = await screen.findByRole('button', { name: 'Deactivate Mona Haddad' });
    expect(mona).toHaveAttribute('aria-disabled', 'true');
    expect(mona).toHaveAccessibleDescription("The last Owner can't be removed. Make someone else an Owner first.");
    expect(screen.getByRole('button', { name: 'Deactivate Omar Fathi' })).toHaveAccessibleDescription("You can't deactivate your own account. Ask another admin.");
  });

  it('deactivates after confirming, and can reactivate', async () => {
    const { api } = renderWorkspace('/settings/users');
    await userEvent.click(await screen.findByRole('button', { name: 'Deactivate Sara Nasser' }));
    const dialog = screen.getByRole('dialog', { name: 'Deactivate Sara Nasser?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Deactivate' }));
    expect(api.deactivate).toHaveBeenCalledWith('u-sara');
    expect(await screen.findByText('Sara Nasser is deactivated.')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Reactivate Sara Nasser' }));
    expect(await screen.findByText('Sara Nasser can sign in again.')).toBeInTheDocument();
  });

  it('resends an invite and shows server refusals as written', async () => {
    const resendInvite = vi.fn().mockRejectedValueOnce(new ApiError(409, 'An invite was sent less than a minute ago. Wait a moment and try again.'));
    renderWorkspace('/settings/users', { api: { resendInvite } });
    await userEvent.click(await screen.findByRole('button', { name: 'Resend invite to layla@gulf-fm.example' }));
    expect(await screen.findByText('An invite was sent less than a minute ago. Wait a moment and try again.')).toBeInTheDocument();
  });

  it('invites by email with roles and one site choice applied to each, checking fields first', async () => {
    const { api } = renderWorkspace('/settings/users');
    await userEvent.click(await screen.findByRole('button', { name: /Invite people/ }));
    const dialog = screen.getByRole('dialog', { name: 'Invite people' });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Send invite' }));
    expect(within(dialog).getByText(/Enter their work email address/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Choose at least one role/)).toBeInTheDocument();
    expect(api.invite).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByLabelText(/Email/), 'nadia@gulf-fm.example');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Technician/ }));
    const sites = within(dialog).getByRole('group', { name: 'Sites they work at' });
    await userEvent.click(within(sites).getByRole('button', { name: 'North depot' }));
    expect(within(dialog).getByText(/Their roles apply only at these sites/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Storekeeper/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send invite' }));

    expect(api.invite).toHaveBeenCalledWith({
      email: 'nadia@gulf-fm.example',
      roles: [{ roleId: 'tech', siteIds: ['north'] }, { roleId: 'store', siteIds: ['north'] }],
    });
    expect(await screen.findByText('An invite was sent to nadia@gulf-fm.example.')).toBeInTheDocument();
    expect(within(await row('nadia@gulf-fm.example')).getByText('Technician · North depot')).toBeInTheDocument();
  });

  it('shows a duplicate email next to the field', async () => {
    renderWorkspace('/settings/users');
    await userEvent.click(await screen.findByRole('button', { name: /Invite people/ }));
    const dialog = screen.getByRole('dialog', { name: 'Invite people' });
    await userEvent.type(within(dialog).getByLabelText(/Email/), 'sara@gulf-fm.example');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Requester/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send invite' }));
    expect(await within(dialog).findByText(/already has an account here/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Email/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('only lets an Owner invite another Owner', async () => {
    renderWorkspace('/settings/users', { meId: 'u-omar' });
    await userEvent.click(await screen.findByRole('button', { name: /Invite people/ }));
    const dialog = screen.getByRole('dialog', { name: 'Invite people' });
    const owner = await within(dialog).findByRole('checkbox', { name: /Owner/ });
    expect(owner).toBeDisabled();
    expect(owner).toHaveAccessibleDescription('Only an Owner can make someone else an Owner.');
  });

  it('says why inviting is blocked when every seat is used', async () => {
    renderWorkspace('/settings/users', { seatLimit: 5 });
    const invite = await screen.findByRole('button', { name: /Invite people/ });
    await waitFor(() => expect(invite).toHaveAccessibleDescription(/All 5 seats on your plan are in use/));
  });

  it('says why buttons are disabled without users.manage', async () => {
    renderWorkspace('/settings/users', { withoutPermissions: ['users.manage'] });
    const invite = await screen.findByRole('button', { name: /Invite people/ });
    expect(invite).toHaveAccessibleDescription('You need the users.manage permission to manage users. Ask an Admin.');
    expect(await screen.findByRole('button', { name: 'Deactivate Sara Nasser' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('filters by status and search, and by role from the Roles page', async () => {
    const { api } = renderWorkspace('/settings/users?role=tech');
    expect(await screen.findByText('Yusuf Rahman')).toBeInTheDocument();
    expect(screen.queryByText('Sara Nasser')).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Stop showing only Technician' }));
    expect(await screen.findByText('Sara Nasser')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Deactivated' }));
    await waitFor(() => expect(api.listUsers).toHaveBeenLastCalledWith({ status: 'deactivated', search: '', roleId: null }));
    expect(await screen.findByText('Karim Saleh')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Search people'), 'zzz');
    expect(await screen.findByText('Nobody matches')).toBeInTheDocument();
  });

  it('shows load errors with a retry, and an empty state', async () => {
    const listUsers = vi.fn()
      .mockRejectedValueOnce(new ApiError(0, "Can't reach the server."))
      .mockResolvedValue({ items: [], seats: { used: 0, limit: 25 } });
    renderWorkspace('/settings/users', { api: { listUsers } });
    expect(await screen.findByText(/People didn't load: Can't reach the server/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Nobody here yet')).toBeInTheDocument();
    expect(screen.getByText(/Invite your colleagues by email/)).toBeInTheDocument();
  });
});
