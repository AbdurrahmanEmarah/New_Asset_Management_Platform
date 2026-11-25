import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../shared/api/http';
import { renderWorkspace } from './test-utils';

async function openRole(name: string) {
  const list = await screen.findByRole('group', { name: 'Roles' });
  await userEvent.click(within(list).getByRole('button', { name: new RegExp(`^${name}`) }));
  return screen.findByRole('heading', { name, level: 2 });
}

describe('Settings › Roles & permissions', () => {
  it('lists roles with members and permission counts', async () => {
    renderWorkspace('/settings/roles');
    const list = await screen.findByRole('group', { name: 'Roles' });
    const tech = within(list).getByRole('button', { name: /^Technician/ });
    expect(tech).toHaveTextContent('1 person');
    expect(tech).toHaveTextContent('4 of 18 permissions');
    expect(within(list).getByRole('button', { name: /^Owner/ })).toHaveTextContent('All permissions');
  });

  it('locks the Owner role and explains why', async () => {
    renderWorkspace('/settings/roles');
    expect(await screen.findByRole('heading', { name: 'Owner', level: 2 })).toBeInTheDocument();
    expect(screen.getByText(/The Owner role always has every permission and can't be edited. A company must keep at least one Owner./)).toBeInTheDocument();
    const box = screen.getByRole('checkbox', { name: /Retire or dispose/ });
    expect(box).toBeChecked();
    expect(box).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save role' })).toHaveAccessibleDescription("The Owner role always has every permission and can't be edited.");
  });

  it('groups permissions by area with their area.action codes, and lists members with their sites', async () => {
    renderWorkspace('/settings/roles');
    await openRole('Technician');
    const area = screen.getByRole('group', { name: 'Work orders' });
    expect(within(area).getByText('workorders.complete')).toBeInTheDocument();
    expect(within(area).getByRole('checkbox', { name: /Complete and sign off/ })).toBeChecked();
    expect(within(area).getByRole('checkbox', { name: /Assign technicians/ })).not.toBeChecked();
    expect(screen.queryByRole('group', { name: 'Sites' })).not.toBeInTheDocument();
    const members = screen.getByRole('heading', { name: 'Members (1)' }).closest('.role-section')! as HTMLElement;
    const yusuf = (await within(members).findByText('Yusuf Rahman')).closest('li')!;
    expect(yusuf).toHaveTextContent('Tower B, North depot');
  });

  it('shows an unsaved-changes bar, saves, and discards', async () => {
    const { api } = renderWorkspace('/settings/roles');
    await openRole('Technician');
    const save = screen.getByRole('button', { name: 'Save role' });
    expect(save).toHaveAccessibleDescription(/Nothing to save yet/);

    await userEvent.click(screen.getByRole('checkbox', { name: /Assign technicians/ }));
    expect(screen.getByText(/You have unsaved changes/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByRole('checkbox', { name: /Assign technicians/ })).not.toBeChecked();

    await userEvent.click(screen.getByRole('checkbox', { name: /Assign technicians/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save role' }));
    expect(api.updateRole).toHaveBeenCalledWith('tech', expect.objectContaining({
      permissions: ['assets.read', 'workorders.read', 'workorders.complete', 'inventory.read', 'workorders.assign'],
    }));
    expect(await screen.findByText(/Technician is saved/)).toBeInTheDocument();
    expect(screen.getByText('All changes saved.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Assign technicians/ })).toBeChecked();
  });

  it('asks before leaving a role with unsaved changes', async () => {
    renderWorkspace('/settings/roles');
    await openRole('Technician');
    await userEvent.click(screen.getByRole('checkbox', { name: /Assign technicians/ }));
    const list = screen.getByRole('group', { name: 'Roles' });
    await userEvent.click(within(list).getByRole('button', { name: /^Storekeeper/ }));
    const dialog = screen.getByRole('dialog', { name: 'Discard your changes to Technician?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByRole('heading', { name: 'Technician', level: 2 })).toBeInTheDocument();
    await userEvent.click(within(list).getByRole('button', { name: /^Storekeeper/ }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard changes' }));
    expect(screen.getByRole('heading', { name: 'Storekeeper', level: 2 })).toBeInTheDocument();
  });

  it('shows a refusal from the server as written', async () => {
    const updateRole = vi.fn().mockRejectedValue(new ApiError(409, 'Someone else changed this role while you were editing. Discard your changes to see theirs, then try again.'));
    renderWorkspace('/settings/roles', { api: { updateRole } });
    await openRole('Requester');
    await userEvent.click(screen.getByRole('checkbox', { name: /View reports/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save role' }));
    expect(await screen.findByText(/Someone else changed this role/)).toBeInTheDocument();
  });

  it('duplicates a saved role, and asks to save first when there are changes', async () => {
    const { api } = renderWorkspace('/settings/roles');
    await openRole('Storekeeper');
    await userEvent.click(screen.getByRole('checkbox', { name: /View reports/ }));
    expect(screen.getByRole('button', { name: 'Duplicate' })).toHaveAccessibleDescription(/Save or discard your changes first/);
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await userEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    const dialog = screen.getByRole('dialog', { name: 'Duplicate Storekeeper' });
    expect(within(dialog).getByLabelText(/Role name/)).toHaveValue('Storekeeper (copy)');
    await userEvent.clear(within(dialog).getByLabelText(/Role name/));
    await userEvent.type(within(dialog).getByLabelText(/Role name/), 'Night storekeeper');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create copy' }));
    expect(api.copyRole).toHaveBeenCalledWith('store', 'Night storekeeper');
    expect(await screen.findByRole('heading', { name: 'Night storekeeper', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Custom')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Receive and issue parts/ })).toBeChecked();
  });

  it('creates a new role and refuses a duplicate name', async () => {
    renderWorkspace('/settings/roles');
    await userEvent.click(await screen.findByRole('button', { name: /New role/ }));
    const dialog = screen.getByRole('dialog', { name: 'New role' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create role' }));
    expect(within(dialog).getByText(/Give the role a name/)).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/Role name/), 'admin');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create role' }));
    expect(await within(dialog).findByText('A role called "admin" already exists. Choose another name.')).toBeInTheDocument();
    await userEvent.clear(within(dialog).getByLabelText(/Role name/));
    await userEvent.type(within(dialog).getByLabelText(/Role name/), 'Site supervisor');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create role' }));
    expect(await screen.findByRole('heading', { name: 'Site supervisor', level: 2 })).toBeInTheDocument();
    expect(screen.getByText(/Site supervisor was created/)).toBeInTheDocument();
  });

  it('deletes an unused custom role but explains built-in and in-use roles', async () => {
    renderWorkspace('/settings/roles');
    await userEvent.click(await screen.findByRole('button', { name: /New role/ }));
    await userEvent.type(within(screen.getByRole('dialog')).getByLabelText(/Role name/), 'Temp');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create role' }));
    await screen.findByRole('heading', { name: 'Temp', level: 2 });
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Delete Temp?' })).getByRole('button', { name: 'Delete role' }));
    expect(await screen.findByText('Temp was deleted.')).toBeInTheDocument();
    await openRole('Admin');
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('shows an empty members list with what to do, and links to Users filtered by the role', async () => {
    renderWorkspace('/settings/roles');
    await openRole('Requester');
    expect(await screen.findByText(/Nobody has this role yet/)).toBeInTheDocument();
    await openRole('Technician');
    await userEvent.click(screen.getByRole('link', { name: 'Manage in Users' }));
    expect(await screen.findByRole('heading', { name: 'Users', level: 1 })).toBeInTheDocument();
    expect(window.location.search).toBe('?role=tech');
  });

  it('is read-only without roles.manage, and says so', async () => {
    renderWorkspace('/settings/roles', { withoutPermissions: ['roles.manage'] });
    await openRole('Technician');
    const reason = 'You need the roles.manage permission to change roles. Ask an Admin.';
    expect(screen.getByRole('button', { name: /New role/ })).toHaveAccessibleDescription(reason);
    expect(screen.getByRole('checkbox', { name: /Assign technicians/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save role' })).toHaveAccessibleDescription(reason);
  });

  it('shows load errors with a retry', async () => {
    const roles = vi.fn().mockRejectedValueOnce(new ApiError(500, 'The server had a problem.'));
    const { api } = renderWorkspace('/settings/roles', { api: { roles } });
    expect(await screen.findByText(/Roles didn't load: The server had a problem/)).toBeInTheDocument();
    roles.mockImplementation(() => Promise.resolve([]));
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(api.roles).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('No roles yet')).toBeInTheDocument();
  });
});
