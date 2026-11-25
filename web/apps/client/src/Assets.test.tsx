import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../shared/api/http';
import { renderWorkspace } from './test-utils';

const row = async (text: string) => (await screen.findByText(text)).closest('tr')!;

describe('Assets register', () => {
  it('lists assets across types with site, status and type', async () => {
    renderWorkspace('/assets');
    const chiller = await row('Chiller CH-2');
    expect(within(chiller).getByText('HVAC-000417')).toHaveAttribute('href', '/assets/a1');
    expect(within(chiller).getByText('HVAC unit')).toBeInTheDocument();
    expect(within(chiller).getByText('Tower B · Roof')).toBeInTheDocument();
    expect(within(chiller).getByText('In service')).toBeInTheDocument();
    expect(screen.getByText('1–7 of 7 assets')).toBeInTheDocument();
  });

  it("shows the type's own columns, filters by status and sorts by a field", async () => {
    const { assets } = renderWorkspace('/assets');
    await row('Chiller CH-2');
    await userEvent.selectOptions(screen.getByLabelText('Type'), 't-hvac');
    expect(await screen.findByRole('columnheader', { name: 'Cooling capacity' })).toBeInTheDocument();
    expect(within(await row('Chiller CH-3')).getByText('350 kW')).toBeInTheDocument();
    expect(screen.queryByText('Fleet van V-112')).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'service_due');
    await waitFor(() => expect(screen.queryByText('Chiller CH-2')).not.toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('Status'), '');
    await userEvent.click(screen.getByRole('button', { name: 'Cooling capacity' }));
    await waitFor(() => expect(assets.list).toHaveBeenLastCalledWith(expect.objectContaining({ typeId: 't-hvac', sort: 'field:capacity', order: 'asc' })));
    expect(screen.getByRole('columnheader', { name: /Cooling capacity/ })).toHaveAttribute('aria-sort', 'ascending');
  });

  it('explains that status needs a type, searches, and includes retired', async () => {
    const { assets } = renderWorkspace('/assets');
    await row('Chiller CH-2');
    expect(screen.getByLabelText('Status')).toBeDisabled();
    expect(screen.getByLabelText('Status')).toHaveAccessibleDescription(/Choose a type to filter by status/);
    await userEvent.type(screen.getByLabelText('Search by tag or name'), 'zzz');
    expect(await screen.findByText('No assets match')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Include retired'));
    await waitFor(() => expect(assets.list).toHaveBeenLastCalledWith(expect.objectContaining({ includeRetired: true, search: 'zzz' })));
  });

  it('pages through the register', async () => {
    const list = vi.fn().mockImplementation(async (q: { page: number }) => ({
      items: [{ id: `x${q.page}`, tag: `PMP-00000${q.page}`, name: `Pump ${q.page}`, typeId: 't', typeName: 'Pump', status: { key: 'ok', label: 'Running', meaning: 'ok' }, siteId: 'hq', location: '', parentId: null, values: null, updatedAt: '2026-11-01T00:00:00Z', retiredAt: null }],
      total: 30, page: q.page, pageSize: 25, columns: [],
    }));
    renderWorkspace('/assets', { assets: { assets: { list } } });
    expect(await screen.findByText('1–25 of 30 assets')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toHaveAccessibleDescription('This is the first page.');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('26–30 of 30 assets')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toHaveAccessibleDescription('This is the last page.');
  });

  it('shows load errors with a retry, and an empty state', async () => {
    const list = vi.fn().mockRejectedValueOnce(new ApiError(500, 'The server had a problem.')).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25, columns: [] });
    renderWorkspace('/assets', { assets: { assets: { list } } });
    expect(await screen.findByText(/Assets didn't load: The server had a problem/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No assets yet')).toBeInTheDocument();
  });

  it('says why New asset is disabled without assets.write anywhere', async () => {
    renderWorkspace('/assets', { withoutPermissions: ['assets.write'], meId: 'u-sara' });
    expect(await screen.findByRole('button', { name: /New asset/ })).toHaveAccessibleDescription(/assets.write permission at one or more sites/);
  });
});

describe('New and edit asset', () => {
  it('generates the form from the type and shows errors on the fields', async () => {
    const { assets } = renderWorkspace('/assets/new?type=t-veh');
    expect(await screen.findByRole('heading', { name: 'New Vehicle' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Create asset' }));
    expect(screen.getByText(/Give the asset a name/)).toBeInTheDocument();
    expect(screen.getByText('Plate is required.')).toBeInTheDocument();
    expect(assets.create).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/^Name/), 'Van V-120');
    await userEvent.selectOptions(screen.getByLabelText(/^Site/), 'north');
    await userEvent.type(screen.getByLabelText(/^Plate/), 'bad plate');
    await userEvent.type(screen.getByLabelText(/^Odometer/), '-5');
    await userEvent.type(screen.getByLabelText(/^Registration expiry/), '2027-03-01');
    await userEvent.click(screen.getByRole('button', { name: 'Create asset' }));
    expect(await screen.findByText('Use the plate as printed, e.g. DXB 4471.', { selector: '.field-error' })).toBeInTheDocument();
    expect(screen.getByText('Odometer must be at least 0 km.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Plate/)).toHaveAttribute('aria-invalid', 'true');

    await userEvent.clear(screen.getByLabelText(/^Plate/));
    await userEvent.type(screen.getByLabelText(/^Plate/), 'DXB 7788');
    await userEvent.clear(screen.getByLabelText(/^Odometer/));
    await userEvent.type(screen.getByLabelText(/^Odometer/), '120');
    await userEvent.selectOptions(screen.getByLabelText(/^Fuel/), 'Electric');
    await userEvent.click(screen.getByRole('button', { name: 'Create asset' }));
    expect(assets.create).toHaveBeenLastCalledWith(expect.objectContaining({
      typeId: 't-veh', name: 'Van V-120', siteId: 'north', statusKey: 'in_use',
      values: { plate: 'DXB 7788', odometer: 120, fuel: 'Electric', registration_expiry: '2027-03-01' },
    }));
    expect(await screen.findByText('VEH-000113 Van V-120 was added.')).toBeInTheDocument();
  });

  it('offers only the sites where the person may add assets', async () => {
    renderWorkspace('/assets/new?type=t-hvac', { meId: 'u-sara', withoutPermissions: [] });
    const site = await screen.findByLabelText(/^Site/);
    const options = within(site).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Choose a site']);
  });

  it("shows the plan limit sentence when the register is full", async () => {
    renderWorkspace('/assets/new?type=t-hvac', { assets: { maxAssets: 7 } });
    await userEvent.type(await screen.findByLabelText(/^Name/), 'Chiller CH-9');
    await userEvent.selectOptions(screen.getByLabelText(/^Site/), 'hq');
    await userEvent.selectOptions(screen.getByLabelText(/^Manufacturer/), 'Trane');
    await userEvent.type(screen.getByLabelText(/^Model/), 'X');
    await userEvent.type(screen.getByLabelText(/^Serial no/), 'S1');
    await userEvent.type(screen.getByLabelText(/^Cooling capacity/), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Create asset' }));
    expect(await screen.findByText(/Your plan allows 7 assets and all 7 are in use/)).toBeInTheDocument();
  });

  it('edits an asset, keeping the site for Move', async () => {
    const { assets } = renderWorkspace('/assets/a2/edit');
    expect(await screen.findByRole('heading', { name: 'Edit HVAC-000418' })).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Tower B')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Site/)).toHaveAccessibleDescription(/Use Move/);
    await userEvent.selectOptions(screen.getByLabelText(/^Status/), 'in_service');
    await userEvent.click(screen.getByRole('button', { name: 'Save asset' }));
    expect(assets.update).toHaveBeenCalledWith('a2', expect.objectContaining({ statusKey: 'in_service', name: 'Chiller CH-3' }));
    expect(await screen.findByText('HVAC-000418 is saved.')).toBeInTheDocument();
  });
});

describe('Asset detail', () => {
  it('shows fields, other values kept from removed fields, and its parent', async () => {
    renderWorkspace('/assets/a1');
    expect(await screen.findByRole('heading', { name: 'Chiller CH-2', level: 1 })).toBeInTheDocument();
    const details = screen.getByRole('region', { name: 'HVAC unit details' });
    expect(within(details).getByText('350 kW')).toBeInTheDocument();
    expect(within(details).getByText('30 Jun 2027')).toBeInTheDocument();
    const other = screen.getByRole('region', { name: 'Other values' });
    expect(within(other).getByText('legacy_code')).toBeInTheDocument();
    expect(within(other).getByText('CH2-OLD')).toBeInTheDocument();
  });

  it('disables Retire with the server reason, and lists children', async () => {
    renderWorkspace('/assets/a1');
    const retire = await screen.findByRole('button', { name: 'Retire' });
    expect(retire).toHaveAccessibleDescription('HVAC-000417 has 1 asset(s) under it. Move or retire them first.');
    await userEvent.click(screen.getByRole('tab', { name: 'Children (1)' }));
    expect(await screen.findByText('Compressor A')).toBeInTheDocument();
  });

  it('retires with a reason, after which edits are refused', async () => {
    const { assets } = renderWorkspace('/assets/a2');
    await userEvent.click(await screen.findByRole('button', { name: 'Retire' }));
    const dialog = screen.getByRole('dialog', { name: 'Retire HVAC-000418?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Retire asset' }));
    expect(within(dialog).getByText(/Say why it is retired/)).toBeInTheDocument();
    expect(assets.retire).not.toHaveBeenCalled();
    await userEvent.type(within(dialog).getByLabelText(/Reason/), 'Replaced by CH-4');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Retire asset' }));
    expect(assets.retire).toHaveBeenCalledWith('a2', 'Replaced by CH-4');
    expect(await screen.findByText('HVAC-000418 is retired.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Edit' })).toHaveAccessibleDescription("HVAC-000418 is retired, so it can't be changed.");
  });

  it('moves to another site the person may move assets to', async () => {
    const { assets } = renderWorkspace('/assets/a2');
    await userEvent.click(await screen.findByRole('button', { name: 'Move' }));
    const dialog = screen.getByRole('dialog', { name: 'Move HVAC-000418' });
    const options = within(within(dialog).getByLabelText(/New site/)).getAllByRole('option').map((o) => o.textContent);
    expect(options).not.toContain('Tower B');
    expect(options).not.toContain('Plant yard');
    await userEvent.selectOptions(within(dialog).getByLabelText(/New site/), 'hq');
    await userEvent.type(within(dialog).getByLabelText(/Location/), 'Roof');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move asset' }));
    expect(assets.move).toHaveBeenCalledWith('a2', 'hq', 'Roof');
    expect(await screen.findByText('HVAC-000418 moved to HQ Tower · Roof.')).toBeInTheDocument();
  });

  it('explains missing site scope on actions', async () => {
    renderWorkspace('/assets/a5', { meId: 'u-sara' });
    expect(await screen.findByRole('button', { name: 'Edit' })).toHaveAccessibleDescription(/assets.write permission at this asset's site/);
  });

  it("shows the asset's history from the audit log", async () => {
    renderWorkspace('/assets/a1?tab=audit');
    expect(await screen.findByText('Status: Service due → In service')).toBeInTheDocument();
    expect(screen.getByText('Inventra support')).toBeInTheDocument();
  });

  it('shows a load error with a retry', async () => {
    const get = vi.fn().mockRejectedValueOnce(new ApiError(404, 'No asset has this id.'));
    renderWorkspace('/assets/zz', { assets: { assets: { get } } });
    expect(await screen.findByText(/This asset didn't load: No asset has this id./)).toBeInTheDocument();
  });
});

describe('Documents', () => {
  const file = (name: string, type: string, size: number) => {
    const f = new File(['x'], name, { type });
    Object.defineProperty(f, 'size', { value: size });
    return f;
  };

  it('lists documents with the storage meter, and downloads through a short-lived link', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { documents } = renderWorkspace('/assets/a1?tab=documents');
    expect(await screen.findByText('Commissioning report.pdf')).toBeInTheDocument();
    expect(await screen.findByRole('meter', { name: /Storage/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Download Commissioning report.pdf' }));
    expect(documents.link).toHaveBeenCalledWith('d1');
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://files.example/d1?sig=demo', '_blank', 'noopener'));
    open.mockRestore();
  });

  it('uploads PDFs and images, and explains files it refuses', async () => {
    const { documents } = renderWorkspace('/assets/a1?tab=documents');
    const input = await screen.findByLabelText('Choose files to upload');
    await userEvent.upload(input, [file('manual.pdf', 'application/pdf', 1000), file('notes.docx', 'application/msword', 1000), file('huge.png', 'image/png', 30 * 1024 * 1024)], { applyAccept: false });
    expect(await screen.findByText('The file was uploaded.')).toBeInTheDocument();
    expect(screen.getByText(/notes.docx isn't a PDF or an image/)).toBeInTheDocument();
    expect(screen.getByText(/huge.png is 30 MB; files can be up to 25 MB/)).toBeInTheDocument();
    expect(documents.upload).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('manual.pdf')).toBeInTheDocument();
  });

  it("shows the server's sentence when storage is full", async () => {
    renderWorkspace('/assets/a2?tab=documents', { assets: { storageLimitBytes: 3_500_000 } });
    const input = await screen.findByLabelText('Choose files to upload');
    await userEvent.upload(input, file('photo.jpg', 'image/jpeg', 1_000_000));
    expect(await screen.findByText(/Your plan's storage is full/)).toBeInTheDocument();
  });

  it('deletes a document after confirming', async () => {
    const { documents } = renderWorkspace('/assets/a1?tab=documents');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Nameplate.jpg' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete file' }));
    expect(documents.remove).toHaveBeenCalledWith('d2');
    expect(await screen.findByText('Nameplate.jpg was deleted.')).toBeInTheDocument();
  });
});
