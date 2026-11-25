import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../shared/api/http';
import { createDemoAccessApi } from './api/demo';
import { renderWorkspace } from './test-utils';

describe('Client shell', () => {
  it('shows the company name and opens the asset register by default', async () => {
    renderWorkspace('/');
    expect(await screen.findByText('Gulf Facilities Co.', { selector: '.topbar-company' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Assets', level: 1 })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/assets');
    const main = screen.getByRole('navigation', { name: 'Main' });
    expect(within(main).getByRole('link', { name: 'Assets' })).toHaveClass('top-on');
  });

  it('marks parts not built yet as Soon and says when they arrive', async () => {
    renderWorkspace('/settings/users');
    const main = await screen.findByRole('navigation', { name: 'Main' });
    for (const label of ['Dashboard', 'Work orders', 'Inventory', 'Reports']) {
      expect(within(main).getByRole('link', { name: 'Assets' })).toBeInTheDocument();
      const item = within(main).getByText(label).closest('.top')!;
      expect(item).toHaveAttribute('aria-disabled', 'true');
      expect(item).toHaveTextContent('Soon');
    }
    expect(within(main).getByText('Inventory').closest('.top')).toHaveTextContent('Inventory arrives in phase 3.');
    const settings = screen.getByRole('navigation', { name: 'Settings' });
    expect(within(settings).getByText('Company profile').closest('.sidelink')).toHaveAttribute('aria-disabled', 'true');
    expect(within(settings).getByRole('link', { name: 'Roles & permissions' })).toBeInTheDocument();
    expect(within(settings).getByRole('link', { name: 'Sites' })).toBeInTheDocument();
    expect(within(settings).getByRole('link', { name: 'Support access' })).toBeInTheDocument();
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

  it('shows why someone cannot use the app, as the server wrote it', async () => {
    renderWorkspace('/', { api: { me: vi.fn().mockRejectedValue(new ApiError(403, 'Your account is deactivated in Gulf Facilities Co. Ask your Admin to reactivate it.')) } });
    expect(await screen.findByText('Your account is deactivated in Gulf Facilities Co. Ask your Admin to reactivate it.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('offers a retry when the profile does not load', async () => {
    const base = createDemoAccessApi();
    const me = vi.fn().mockRejectedValueOnce(new ApiError(0, "Can't reach the server.")).mockImplementation(() => base.me());
    renderWorkspace('/', { api: { me } });
    expect(await screen.findByText(/Your profile didn't load: Can't reach the server/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Assets', level: 1 })).toBeInTheDocument();
  });

  it('uses the theme saved on the profile, and saves a new choice there', async () => {
    const base = createDemoAccessApi();
    const me = vi.fn(async () => ({ ...(await base.me()), theme: 'dark' as const }));
    const { api } = renderWorkspace('/settings/users', { api: { me } });
    await screen.findByRole('heading', { name: 'Users', level: 1 });
    expect(document.documentElement.dataset.theme).toBe('dark');
    await userEvent.click(screen.getByRole('button', { name: /Account:/ }));
    await userEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(api.savePreferences).toHaveBeenCalledWith('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('shows a banner while platform support is inside the workspace', async () => {
    const base = createDemoAccessApi();
    const me = vi.fn(async () => ({ ...(await base.me()), supportSession: { passId: 'p1', access: 'read' as const, expiresAt: '2026-11-24T12:30:00Z' } }));
    renderWorkspace('/settings/users', { api: { me } });
    expect(await screen.findByText(/Support session: you're in Gulf Facilities Co. as platform support \(read-only\)/)).toBeInTheDocument();
  });
});
