import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../shared/api/http';
import { createDemoAccessApi } from './api/demo';
import { JoinPage } from './pages/JoinPage';
import { renderWorkspace } from './test-utils';

describe('Settings › Sites', () => {
  it('lists sites, adds one and checks the code', async () => {
    const { api } = renderWorkspace('/settings/sites');
    const yard = (await screen.findByText('Plant yard')).closest('tr')!;
    expect(within(yard).getByText('Not in use')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /New site/ }));
    const dialog = screen.getByRole('dialog', { name: 'New site' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add site' }));
    expect(within(dialog).getByText(/Give the site a name/)).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/Name/), 'South depot');
    await userEvent.type(within(dialog).getByLabelText(/Code/), 'hq');
    expect(within(dialog).getByLabelText(/Code/)).toHaveValue('HQ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add site' }));
    expect(await within(dialog).findByText('Another site already uses the code HQ.')).toBeInTheDocument();
    await userEvent.clear(within(dialog).getByLabelText(/Code/));
    await userEvent.type(within(dialog).getByLabelText(/Code/), 'SDP');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add site' }));
    expect(api.createSite).toHaveBeenCalledWith({ name: 'South depot', code: 'SDP', isActive: true });
    expect(await screen.findByText('South depot was added.')).toBeInTheDocument();
  });

  it('edits a site and takes it out of use', async () => {
    const { api } = renderWorkspace('/settings/sites');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Warehouse 1' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Warehouse 1' });
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /In use/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save site' }));
    expect(api.updateSite).toHaveBeenCalledWith('wh1', { name: 'Warehouse 1', code: 'WH1', isActive: false });
    expect(await screen.findByText('Warehouse 1 is saved.')).toBeInTheDocument();
  });

  it('says why changes are blocked without settings.manage', async () => {
    renderWorkspace('/settings/sites', { withoutPermissions: ['settings.manage'] });
    expect(await screen.findByRole('button', { name: /New site/ })).toHaveAccessibleDescription('You need the settings.manage permission to change sites. Ask an Admin.');
  });

  it('shows load errors with a retry, and an empty state', async () => {
    const sites = vi.fn().mockRejectedValueOnce(new ApiError(500, 'The server had a problem.')).mockResolvedValue([]);
    renderWorkspace('/settings/sites', { api: { sites } });
    expect(await screen.findByText(/Sites didn't load: The server had a problem/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No sites yet')).toBeInTheDocument();
  });
});

describe('Settings › Support access', () => {
  it('lists support passes with reasons and recorded actions, and ends one', async () => {
    const { api } = renderWorkspace('/settings/support');
    const active = (await screen.findByText(/Ticket #4182/)).closest('tr')!;
    expect(within(active).getByText('Read-only')).toBeInTheDocument();
    expect(within(active).getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Expired')).toBeInTheDocument();
    await userEvent.click(within(active).getByRole('button', { name: "End Support Agent's support access" }));
    expect(api.endSupportPass).toHaveBeenCalledWith('p1');
    expect(await screen.findByText("Support Agent's support access has ended.")).toBeInTheDocument();
  });

  it('says why ending is blocked without users.manage', async () => {
    renderWorkspace('/settings/support', { withoutPermissions: ['users.manage'] });
    expect(await screen.findByRole('button', { name: "End Support Agent's support access" })).toHaveAccessibleDescription(/users.manage/);
  });

  it('shows an empty state and load errors with a retry', async () => {
    const supportPasses = vi.fn().mockRejectedValueOnce(new ApiError(0, "Can't reach the server.")).mockResolvedValue([]);
    renderWorkspace('/settings/support', { api: { supportPasses } });
    expect(await screen.findByText(/Support passes didn't load/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Support has never entered your workspace')).toBeInTheDocument();
  });
});

describe('Joining from an invitation', () => {
  it('shows who invited whom, then joins', async () => {
    const api = createDemoAccessApi();
    const onJoined = vi.fn();
    render(<JoinPage api={api} token="tok-u-layla-1" onJoined={onJoined} />);
    expect(await screen.findByText(/invited/)).toHaveTextContent('Omar Fathi invited Layla Aziz (layla@gulf-fm.example) to join Gulf Facilities Co. as Storekeeper.');
    await userEvent.click(screen.getByRole('button', { name: 'Join Gulf Facilities Co.' }));
    expect(onJoined).toHaveBeenCalledWith(expect.objectContaining({ companyName: 'Gulf Facilities Co.', signInAgain: true }));
  });

  it('explains why an invitation cannot be accepted', async () => {
    const api = createDemoAccessApi();
    render(<JoinPage api={api} token="tok-u-sara-1" onJoined={vi.fn()} />);
    const join = await screen.findByRole('button', { name: 'Join Gulf Facilities Co.' });
    expect(join).toHaveAccessibleDescription('This invitation has already been used. Sign in instead.');
  });

  it('shows an invalid link as the server wrote it', async () => {
    render(<JoinPage api={createDemoAccessApi()} token="nope" onJoined={vi.fn()} />);
    expect(await screen.findByText(/This invitation link isn't valid/)).toBeInTheDocument();
  });
});
