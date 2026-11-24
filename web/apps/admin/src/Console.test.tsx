import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../shared/api/http';
import { ThemeProvider } from '../../../shared/theme/ThemeProvider';
import { Console } from './App';
import { SUPPORT, client, fakeApi, fakeSupport } from './test-api';

function renderConsole(api = fakeApi(), support = fakeSupport()) {
  window.history.pushState(null, '', '/');
  render(<ThemeProvider><Console api={api} support={support} onSignOut={() => {}} /></ThemeProvider>);
  return api;
}

describe('Clients page', () => {
  it('lists clients with their plan, usage and status', async () => {
    renderConsole();
    const row = (await screen.findByText('Gulf Facilities Co.')).closest('tr')!;
    expect(within(row).getByText('Business')).toBeInTheDocument();
    expect(within(row).getByText('171 / 200')).toBeInTheDocument();
    expect(within(row).getByRole('meter', { name: /users: 171 of 200, near the limit/ })).toBeInTheDocument();
    expect(within(row).getByText('Active')).toBeInTheDocument();
  });

  it('explains why support staff cannot create or suspend clients', async () => {
    renderConsole(fakeApi({ me: vi.fn().mockResolvedValue(SUPPORT) }));
    const create = await screen.findByRole('button', { name: /New client/ });
    expect(create).toHaveAttribute('aria-disabled', 'true');
    expect(create).toHaveAccessibleDescription('Only the Platform Owner can do this.');
    expect(await screen.findByRole('button', { name: 'Suspend Gulf Facilities Co.' })).toHaveAccessibleDescription('Only the Platform Owner can do this.');
  });

  it('shows an empty state that says what to do next', async () => {
    renderConsole(fakeApi({ listClients: vi.fn().mockResolvedValue([]) }));
    expect(await screen.findByText('No clients yet')).toBeInTheDocument();
    expect(screen.getByText(/Create the first client/)).toBeInTheDocument();
  });

  it('shows load errors with a retry', async () => {
    const listClients = vi.fn().mockRejectedValueOnce(new ApiError(0, "Can't reach the server.")).mockResolvedValue([client()]);
    renderConsole(fakeApi({ listClients }));
    expect(await screen.findByText(/Clients didn't load: Can't reach the server/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Gulf Facilities Co.')).toBeInTheDocument();
  });

  it('filters by status', async () => {
    const api = renderConsole();
    await screen.findByText('Gulf Facilities Co.');
    await userEvent.click(screen.getByRole('button', { name: 'Suspended' }));
    await waitFor(() => expect(api.listClients).toHaveBeenLastCalledWith('suspended', ''));
  });

  it('requires a reason before suspending', async () => {
    const suspend = vi.fn().mockResolvedValue(client({ status: 'suspended', suspendedReason: 'Unpaid' }));
    renderConsole(fakeApi({ suspend }));
    await userEvent.click(await screen.findByRole('button', { name: 'Suspend Gulf Facilities Co.' }));
    const dialog = screen.getByRole('dialog', { name: 'Suspend Gulf Facilities Co.?' });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Suspend client' }));
    expect(within(dialog).getByText(/Say why the client is suspended/)).toBeInTheDocument();
    expect(suspend).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByRole('textbox'), 'Unpaid');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Suspend client' }));
    expect(suspend).toHaveBeenCalledWith('c1', 'Unpaid');
    expect(await screen.findByText('Gulf Facilities Co. is suspended.')).toBeInTheDocument();
  });

  it('shows disabled sections as coming soon instead of dead links', async () => {
    renderConsole();
    await screen.findByText('Gulf Facilities Co.');
    const nav = screen.getByRole('navigation', { name: 'Platform admin' });
    const billing = within(nav).getByText('Billing').closest('.nav')!;
    expect(billing).toHaveAttribute('aria-disabled', 'true');
    expect(billing).toHaveTextContent('Billing arrives in a later release.');
  });
});

describe('New client dialog', () => {
  it('suggests a sub-domain from the name and checks fields before sending', async () => {
    const createClient = vi.fn().mockResolvedValue(client({ name: 'Delta Schools Trust', plan: { key: 'trial', name: 'Trial' } }));
    renderConsole(fakeApi({ createClient }));
    await userEvent.click(await screen.findByRole('button', { name: /New client/ }));
    const dialog = screen.getByRole('dialog', { name: 'New client' });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Create client' }));
    expect(within(dialog).getByText('Company name is required.')).toBeInTheDocument();
    expect(within(dialog).getByText("Enter the owner's email address, e.g. name@company.com.")).toBeInTheDocument();
    expect(createClient).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByLabelText(/Company name/), 'Delta Schools Trust');
    expect(within(dialog).getByLabelText(/Sub-domain/)).toHaveValue('delta-schools-trust');
    await userEvent.selectOptions(within(dialog).getByLabelText(/Data region/), 'west-europe');
    await userEvent.type(within(dialog).getByLabelText(/Owner's name/), 'Lina Farouk');
    await userEvent.type(within(dialog).getByLabelText(/Owner's email/), 'lina@delta.example');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create client' }));

    expect(createClient).toHaveBeenCalledWith({
      name: 'Delta Schools Trust', slug: 'delta-schools-trust', region: 'west-europe', planKey: 'trial', ownerName: 'Lina Farouk', ownerEmail: 'lina@delta.example',
    });
    expect(await screen.findByText('Delta Schools Trust was created on the Trial plan.')).toBeInTheDocument();
  });

  it('shows the server field error next to the field', async () => {
    const createClient = vi.fn().mockRejectedValue(new ApiError(400, 'Fix the highlighted fields and try again.', { slug: ['"gulf-fm" is already used by another client. Choose another sub-domain.'] }));
    renderConsole(fakeApi({ createClient }));
    await userEvent.click(await screen.findByRole('button', { name: /New client/ }));
    const dialog = screen.getByRole('dialog', { name: 'New client' });
    await userEvent.type(within(dialog).getByLabelText(/Company name/), 'Gulf FM');
    await userEvent.clear(within(dialog).getByLabelText(/Sub-domain/));
    await userEvent.type(within(dialog).getByLabelText(/Sub-domain/), 'gulf-fm');
    await userEvent.selectOptions(within(dialog).getByLabelText(/Data region/), 'uae-north');
    await userEvent.type(within(dialog).getByLabelText(/Owner's name/), 'Mona');
    await userEvent.type(within(dialog).getByLabelText(/Owner's email/), 'mona@gulf.example');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create client' }));

    expect(await within(dialog).findByText(/is already used by another client/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Sub-domain/)).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('Profile', () => {
  it('tells a signed-in user without a platform role what to do', async () => {
    renderConsole(fakeApi({ me: vi.fn().mockRejectedValue(new ApiError(403, 'Forbidden')) }));
    expect(await screen.findByText(/your account has no platform role/)).toBeInTheDocument();
  });
});
