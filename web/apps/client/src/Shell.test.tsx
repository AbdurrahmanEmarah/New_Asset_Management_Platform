import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../shared/api/http';
import { renderWorkspace } from './test-utils';

describe('Client shell', () => {
  it('shows the company name and opens Settings › Users by default', async () => {
    renderWorkspace('/');
    expect(await screen.findByText('Gulf Facilities Co.', { selector: '.topbar-company' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Users', level: 1 })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/settings/users');
    const main = screen.getByRole('navigation', { name: 'Main' });
    expect(within(main).getByRole('link', { name: 'Settings' })).toHaveClass('top-on');
  });

  it('marks parts not built yet as Soon and says when they arrive', async () => {
    renderWorkspace('/settings/users');
    const main = await screen.findByRole('navigation', { name: 'Main' });
    for (const label of ['Dashboard', 'Assets', 'Work orders', 'Inventory', 'Reports']) {
      const item = within(main).getByText(label).closest('.top')!;
      expect(item).toHaveAttribute('aria-disabled', 'true');
      expect(item).toHaveTextContent('Soon');
    }
    expect(within(main).getByText('Assets').closest('.top')).toHaveTextContent('The asset register arrives in phase 2.');
    const settings = screen.getByRole('navigation', { name: 'Settings' });
    expect(within(settings).getByText('Company profile').closest('.sidelink')).toHaveAttribute('aria-disabled', 'true');
    expect(within(settings).getByRole('link', { name: 'Roles & permissions' })).toBeInTheDocument();
  });

  it('has a user menu with the theme switch and sign out', async () => {
    const { onSignOut } = renderWorkspace('/settings/users');
    const button = await screen.findByRole('button', { name: /Account: Mona Haddad, Owner/ });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(button);
    const menu = screen.getByRole('group', { name: 'Account' });
    expect(within(menu).getByText('mona@gulf-fm.example')).toBeInTheDocument();
    await userEvent.click(within(menu).getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem('inventra.theme')).toBe('dark');
    await userEvent.click(within(menu).getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it('closes the user menu with Escape', async () => {
    renderWorkspace('/settings/users');
    await userEvent.click(await screen.findByRole('button', { name: /Account:/ }));
    expect(screen.getByRole('group', { name: 'Account' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Account' })).not.toBeInTheDocument());
  });

  it('tells a signed-in person without a workspace what to do', async () => {
    renderWorkspace('/', { api: { me: vi.fn().mockRejectedValue(new ApiError(403, 'Forbidden')) } });
    expect(await screen.findByText(/isn't a member of any company workspace/)).toBeInTheDocument();
  });

  it('offers a retry when the profile does not load', async () => {
    const me = vi.fn().mockRejectedValueOnce(new ApiError(0, "Can't reach the server.")).mockResolvedValue({
      id: 'u-mona', name: 'Mona Haddad', email: 'mona@gulf-fm.example', company: { id: 'c1', name: 'Gulf Facilities Co.', slug: 'gulf-fm' }, roles: [{ id: 'owner', name: 'Owner' }], permissions: ['users.manage'],
    });
    renderWorkspace('/', { api: { me } });
    expect(await screen.findByText(/Your profile didn't load: Can't reach the server/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Users', level: 1 })).toBeInTheDocument();
  });
});
