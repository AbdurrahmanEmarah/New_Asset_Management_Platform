import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../shared/api/http';
import { renderWorkspace } from './test-utils';

const row = async (text: string) => (await screen.findByText(text)).closest('tr')!;

describe('Settings › Users', () => {
  it('lists people with their roles and sites, status and seats', async () => {
    renderWorkspace('/settings/users');
    const sara = await row('Sara Nasser');
    expect(within(sara).getByText('Maintenance Planner · HQ Tower, Tower B')).toBeInTheDocument();
    expect(within(sara).getByText('Active')).toBeInTheDocument();
    expect(within(await row('Yusuf Rahman')).getByText('Technician · Tower B, North depot')).toBeInTheDocument();
    expect(within(await row('Omar Fathi')).getByText('Admin · All sites')).toBeInTheDocument();
    const layla = await row('Layla Aziz');
    expect(within(layla).getByText('Invite sent')).toBeInTheDocument();
    expect(within(layla).getByText(/Invited by Omar Fathi · link expires 28 Nov 2026/)).toBeInTheDocument();
    expect(within(await row('Karim Saleh')).getByText(/By Omar Fathi on 02 Nov 2026/)).toBeInTheDocument();
    expect(await screen.findByRole('meter', { name: 'Seats: 5 of 25' })).toBeInTheDocument();
  });

  it('explains why the last Owner and your own account cannot be deactivated', async () => {
    renderWorkspace('/settings/users', { meId: 'u-omar' });
    const mona = await screen.findByRole('button', { name: 'Deactivate Mona Haddad' });
    expect(mona).toHaveAttribute('aria-disabled', 'true');
    expect(mona).toHaveAccessibleDescription("The last Owner can't be removed. Make someone else an Owner first.");
    expect(screen.getByRole('button', { name: 'Deactivate Omar Fathi' })).toHaveAccessibleDescription("You can't deactivate your own account. Ask another admin.");
    expect(screen.getByRole('button', { name: 'Change roles for Mona Haddad' })).toHaveAccessibleDescription("Only an Owner can change another Owner's roles.");
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

  it('makes a new invitation link and shows it once with a copy button', async () => {
    const { api } = renderWorkspace('/settings/users');
    await userEvent.click(await screen.findByRole('button', { name: 'New invitation link for Layla Aziz' }));
    expect(api.reissueInvitation).toHaveBeenCalledWith('u-layla');
    const dialog = await screen.findByRole('dialog', { name: 'Send Layla Aziz their invitation' });
    expect((within(dialog).getByLabelText('Invitation link') as HTMLInputElement).value).toMatch(/^http:\/\/localhost:5174\/join#tok-u-layla-/);
    expect(within(dialog).getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
    expect(within(dialog).getByText(/doesn't send emails yet; that arrives with Notifications/)).toBeInTheDocument();
  });

  it('cancels an invitation', async () => {
    renderWorkspace('/settings/users');
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel invitation for Layla Aziz' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel invitation' }));
    expect(await screen.findByText("Layla Aziz's invitation is cancelled.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('layla@gulf-fm.example')).not.toBeInTheDocument());
  });

  it('shows server refusals as written', async () => {
    const reissueInvitation = vi.fn().mockRejectedValue(new ApiError(409, 'Layla Aziz has already joined.'));
    renderWorkspace('/settings/users', { api: { reissueInvitation } });
    await userEvent.click(await screen.findByRole('button', { name: 'New invitation link for Layla Aziz' }));
    expect(await screen.findByText('Layla Aziz has already joined.')).toBeInTheDocument();
  });

  it('invites with a name, roles and one site choice applied to each, then shows the link', async () => {
    const { api } = renderWorkspace('/settings/users');
    await userEvent.click(await screen.findByRole('button', { name: /Invite people/ }));
    const dialog = screen.getByRole('dialog', { name: 'Invite people' });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Create invitation' }));
    expect(within(dialog).getByText(/Enter their name/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Enter their work email address/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Choose at least one role/)).toBeInTheDocument();
    expect(api.invite).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByLabelText(/Name/), 'Nadia Kareem');
    await userEvent.type(within(dialog).getByLabelText(/Email/), 'nadia@gulf-fm.example');
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: /Technician/ }));
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Storekeeper/ }));
    const sites = within(dialog).getByRole('group', { name: 'Sites these roles apply at' });
    expect(within(sites).queryByRole('button', { name: 'Plant yard' })).not.toBeInTheDocument();
    await userEvent.click(within(sites).getByRole('button', { name: 'North depot' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create invitation' }));

    expect(api.invite).toHaveBeenCalledWith({
      email: 'nadia@gulf-fm.example', name: 'Nadia Kareem',
      roles: [{ roleId: 'tech', siteIds: ['north'] }, { roleId: 'store', siteIds: ['north'] }],
    });
    expect(await screen.findByRole('dialog', { name: 'Send Nadia Kareem their invitation' })).toBeInTheDocument();
    expect(within(await row('Nadia Kareem')).getByText('Technician · North depot')).toBeInTheDocument();
  });

  it('shows a duplicate email next to the field', async () => {
    renderWorkspace('/settings/users');
    await userEvent.click(await screen.findByRole('button', { name: /Invite people/ }));
    const dialog = screen.getByRole('dialog', { name: 'Invite people' });
    await userEvent.type(within(dialog).getByLabelText(/Name/), 'Sara');
    await userEvent.type(within(dialog).getByLabelText(/Email/), 'sara@gulf-fm.example');
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: /Requester/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create invitation' }));
    expect(await within(dialog).findByText(/is already in this company/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Email/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('changes a person\'s roles and sites', async () => {
    const { api } = renderWorkspace('/settings/users');
    await userEvent.click(await screen.findByRole('button', { name: 'Change roles for Yusuf Rahman' }));
    const dialog = screen.getByRole('dialog', { name: 'Roles for Yusuf Rahman' });
    expect(await within(dialog).findByRole('checkbox', { name: /Technician/ })).toBeChecked();
    await userEvent.click(within(dialog).getByRole('button', { name: 'All sites' }));
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Storekeeper/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save roles' }));
    expect(api.setRoles).toHaveBeenCalledWith('u-yusuf', [{ roleId: 'tech', siteIds: [] }, { roleId: 'store', siteIds: [] }]);
    expect(await screen.findByText("Yusuf Rahman's roles are saved.")).toBeInTheDocument();
  });

  it('always gives the Owner role every site', async () => {
    const { api } = renderWorkspace('/settings/users');
    await userEvent.click(await screen.findByRole('button', { name: /Invite people/ }));
    const dialog = screen.getByRole('dialog', { name: 'Invite people' });
    await userEvent.type(within(dialog).getByLabelText(/Name/), 'Rami Haddad');
    await userEvent.type(within(dialog).getByLabelText(/Email/), 'rami@gulf-fm.example');
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: /^Owner/ }));
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Technician/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tower B' }));
    expect(within(dialog).getByText(/The Owner role always applies at every site/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create invitation' }));
    expect(api.invite).toHaveBeenCalledWith(expect.objectContaining({
      roles: [{ roleId: 'owner', siteIds: [] }, { roleId: 'tech', siteIds: ['tower-b'] }],
    }));
  });

  it('only lets an Owner make someone an Owner', async () => {
    renderWorkspace('/settings/users', { meId: 'u-omar' });
    await userEvent.click(await screen.findByRole('button', { name: /Invite people/ }));
    const owner = await within(screen.getByRole('dialog')).findByRole('checkbox', { name: /Owner/ });
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
    expect(await screen.findByRole('button', { name: /Invite people/ })).toHaveAccessibleDescription('You need the users.manage permission to manage users. Ask an Admin.');
    expect(await screen.findByRole('button', { name: 'Deactivate Sara Nasser' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('filters by status, search and role', async () => {
    const { api } = renderWorkspace('/settings/users?role=tech');
    expect(await screen.findByText('Yusuf Rahman')).toBeInTheDocument();
    expect(screen.queryByText('Sara Nasser')).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Stop showing only Technician' }));
    expect(await screen.findByText('Sara Nasser')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Deactivated' }));
    await waitFor(() => expect(api.listUsers).toHaveBeenLastCalledWith('deactivated', ''));
    expect(await screen.findByText('Karim Saleh')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Search people'), 'zzz');
    expect(await screen.findByText('Nobody matches')).toBeInTheDocument();
  });

  it('shows load errors with a retry, and an empty state', async () => {
    const listUsers = vi.fn().mockRejectedValueOnce(new ApiError(0, "Can't reach the server.")).mockResolvedValue([]);
    renderWorkspace('/settings/users', { api: { listUsers } });
    expect(await screen.findByText(/People didn't load: Can't reach the server/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Nobody here yet')).toBeInTheDocument();
  });
});
