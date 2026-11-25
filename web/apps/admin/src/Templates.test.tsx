import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../shared/api/http';
import { ThemeProvider } from '../../../shared/theme/ThemeProvider';
import { Console } from './App';
import { passHeaderValue } from './api/support';
import { SETUP_RETRY, untilSetUp } from './pages/OwnerInvitationDialog';
import { SUPPORT, fakeApi, fakeCatalog, fakeSupport, pass } from './test-api';

function renderAt(path: string, { api = fakeApi(), support = fakeSupport(), catalog = fakeCatalog() } = {}) {
  window.history.pushState(null, '', path);
  render(<ThemeProvider><Console api={api} support={support} catalog={catalog} onSignOut={() => {}} /></ThemeProvider>);
  return { api, support, catalog };
}

describe('Template library', () => {
  it('lists templates from the nav', async () => {
    renderAt('/');
    const nav = await screen.findByRole('navigation', { name: 'Platform admin' });
    await userEvent.click(within(nav).getByRole('link', { name: /Template library/ }));
    const row = (await screen.findByText('Fire safety equipment')).closest('tr')!;
    expect(within(row).getByText('Safety')).toBeInTheDocument();
    expect(within(row).getByText('Zone')).toBeInTheDocument();
    expect(within(row).getByText('Compliant')).toBeInTheDocument();
  });

  it('adds a template with fields and statuses', async () => {
    const { catalog } = renderAt('/templates');
    await userEvent.click(await screen.findByRole('button', { name: /New template/ }));
    const dialog = screen.getByRole('dialog', { name: 'New template' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add template' }));
    expect(within(dialog).getByText('Name is required.')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Water pump');
    await userEvent.type(within(dialog).getByLabelText(/^Tag prefix/), 'pmp');
    await userEvent.click(within(dialog).getByRole('button', { name: '+ Add field' }));
    await userEvent.type(within(dialog).getByLabelText('Label of field 1'), 'Flow rate');
    await userEvent.selectOptions(within(dialog).getByLabelText('Kind of field 1'), 'number');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rules' }));
    await userEvent.type(within(dialog).getByLabelText('Unit'), 'm³/h');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add template' }));
    expect(catalog.saveTemplate).toHaveBeenCalledWith('water-pump', expect.objectContaining({
      name: 'Water pump', tagPrefix: 'PMP',
      fields: [{ key: null, label: 'Flow rate', kind: 'number', required: false, rules: { unit: 'm³/h' } }],
      statuses: [{ key: null, label: 'In service', meaning: 'ok' }],
    }));
    expect(await screen.findByText('Water pump was added to the library.')).toBeInTheDocument();
  });

  it('refuses a key already in use, and edits keep the key', async () => {
    const { catalog } = renderAt('/templates');
    await userEvent.click(await screen.findByRole('button', { name: /New template/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Fire');
    await userEvent.type(within(dialog).getByLabelText(/^Tag prefix/), 'FS');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add template' }));
    expect(within(dialog).getByText(/"fire" is already used/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit Fire safety equipment' }));
    const edit = screen.getByRole('dialog', { name: 'Edit Fire safety equipment' });
    expect(within(edit).getByLabelText(/^Key/)).toHaveAttribute('readonly');
    await userEvent.click(within(edit).getByRole('button', { name: 'Save template' }));
    expect(catalog.saveTemplate).toHaveBeenCalledWith('fire', expect.objectContaining({ fields: [expect.objectContaining({ key: 'zone' })] }));
  });

  it('deletes a template', async () => {
    const { catalog } = renderAt('/templates');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Fire safety equipment' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete template' }));
    expect(catalog.deleteTemplate).toHaveBeenCalledWith('fire');
    expect(await screen.findByText(/was removed from the library/)).toBeInTheDocument();
  });

  it('is read-only for support staff, and shows load errors with a retry', async () => {
    const templates = vi.fn().mockRejectedValueOnce(new ApiError(0, "Can't reach the server.")).mockResolvedValue([]);
    renderAt('/templates', { api: fakeApi({ me: vi.fn().mockResolvedValue(SUPPORT) }), catalog: fakeCatalog({ templates }) });
    expect(await screen.findByRole('button', { name: /New template/ })).toHaveAccessibleDescription('Only the Platform Owner can do this.');
    expect(await screen.findByText(/Templates didn't load/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('The library is empty')).toBeInTheDocument();
  });
});

describe('Open workspace', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('builds the pass header from the client and pass ids', () => {
    expect(passHeaderValue({ clientId: 'aaaa-bbbb', id: 'cccc-dddd' })).toBe('aaaabbbb.ccccdddd');
  });

  it('opens the client app on the pass in a new tab', async () => {
    vi.stubEnv('VITE_CLIENT_APP_URL', 'http://localhost:5174/');
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderAt('/support', { support: fakeSupport({ passes: vi.fn().mockResolvedValue([pass({ id: 'p-1', clientId: 'c-1' })]) }) });
    await userEvent.click(await screen.findByRole('button', { name: /Open .* workspace/ }));
    expect(open).toHaveBeenCalledWith('http://localhost:5174/support#c1.p1', '_blank', 'noopener');
    open.mockRestore();
  });

  it("says why it can't open when the client app address isn't set", async () => {
    vi.stubEnv('VITE_CLIENT_APP_URL', '');
    renderAt('/support');
    expect(await screen.findByRole('button', { name: /Open .* workspace/ })).toHaveAccessibleDescription(/VITE_CLIENT_APP_URL/);
  });
});

describe('Owner invitation retry', () => {
  it('asks again while Access sets the client up, then gives up after about 10 s', async () => {
    SETUP_RETRY.delayMs = 1;
    const settingUp = new ApiError(404, "Access hasn't set up this client yet. If it was just created, wait a few seconds and try again.");
    const load = vi.fn().mockRejectedValueOnce(settingUp).mockRejectedValueOnce(settingUp).mockResolvedValue('ok');
    await expect(untilSetUp(load)).resolves.toBe('ok');
    expect(load).toHaveBeenCalledTimes(3);

    const never = vi.fn().mockRejectedValue(settingUp);
    await expect(untilSetUp(never)).rejects.toBe(settingUp);
    expect(never).toHaveBeenCalledTimes(SETUP_RETRY.attempts);

    const other = vi.fn().mockRejectedValue(new ApiError(500, 'Boom'));
    await expect(untilSetUp(other)).rejects.toThrow('Boom');
    expect(other).toHaveBeenCalledOnce();
    SETUP_RETRY.delayMs = 2000;
  });

  it('shows the invitation once Access is ready', async () => {
    SETUP_RETRY.delayMs = 1;
    const ownerInvitation = vi.fn()
      .mockRejectedValueOnce(new ApiError(404, "Access hasn't set up this client yet. If it was just created, wait a few seconds and try again."))
      .mockResolvedValue({ clientId: 'c1', email: 'mona@gulf-fm.example', name: 'Mona Haddad', status: 'invited', expiresAt: null, acceptUrl: null });
    renderAt('/', { support: fakeSupport({ ownerInvitation }) });
    await userEvent.click(await screen.findByRole('button', { name: 'Owner invitation for Gulf Facilities Co.' }));
    await waitFor(() => expect(screen.getByText(/Not joined yet/)).toBeInTheDocument());
    expect(ownerInvitation).toHaveBeenCalledTimes(2);
    SETUP_RETRY.delayMs = 2000;
  });
});
