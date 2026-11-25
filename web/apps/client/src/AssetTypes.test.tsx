import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../shared/api/http';
import { renderWorkspace } from './test-utils';

const fields = () => screen.getByRole('table', { name: 'Fields' });

describe('Settings › Asset types', () => {
  it('shows the first type with its fields, statuses and a live preview', async () => {
    renderWorkspace('/settings/asset-types');
    expect(await screen.findByRole('heading', { name: 'HVAC unit', level: 2 })).toBeInTheDocument();
    expect(within(fields()).getByLabelText('Label of field 4')).toHaveValue('Cooling capacity');
    expect(within(fields()).getByText('Unit: kW · 0 to …')).toBeInTheDocument();
    expect(screen.getByLabelText('Meaning of Service due')).toHaveValue('warn');
    expect(screen.getByText('Live preview · new HVAC unit form')).toBeInTheDocument();
    const list = screen.getByRole('group', { name: 'Asset types' });
    expect(within(list).queryByText('IT equipment')).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Show archived types'));
    expect(within(list).getByText('IT equipment')).toBeInTheDocument();
  });

  it('adds a field with rules, reorders, keeps existing keys and saves with the version', async () => {
    const { catalog } = renderWorkspace('/settings/asset-types');
    await screen.findByRole('heading', { name: 'HVAC unit', level: 2 });
    expect(screen.getByRole('button', { name: 'Add field' })).toHaveAccessibleDescription("Type the new field's name first.");
    await userEvent.type(screen.getByLabelText('New field name'), 'Filter size');
    await userEvent.selectOptions(screen.getByLabelText('Kind'), 'number');
    await userEvent.click(screen.getByRole('button', { name: 'Add field' }));
    await userEvent.click(screen.getByRole('button', { name: 'Rules for Filter size' }));
    const rules = screen.getByRole('group', { name: 'Rules for Filter size' });
    await userEvent.type(within(rules).getByLabelText('Unit'), 'mm');
    await userEvent.click(screen.getByRole('button', { name: 'Move Filter size up' }));
    await userEvent.click(screen.getAllByRole('checkbox', { name: 'Required' })[0]!);
    expect(screen.getByText(/You have unsaved changes/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save type' }));

    const [, body] = vi.mocked(catalog.updateType).mock.calls[0]!;
    expect(body.version).toBe(3);
    expect(body.fields.map((f) => f.key)).toEqual(['manufacturer', 'model', 'serial_no', 'capacity', 'refrigerant', null, 'warranty_ends']);
    expect(body.fields[5]).toMatchObject({ key: null, label: 'Filter size', kind: 'number', rules: { unit: 'mm' } });
    expect(body.fields[0]!.required).toBe(false);
    expect(await screen.findByText(/HVAC unit is saved/)).toBeInTheDocument();
  });

  it('adds a status with a meaning', async () => {
    const { catalog } = renderWorkspace('/settings/asset-types');
    await screen.findByRole('heading', { name: 'HVAC unit', level: 2 });
    await userEvent.click(screen.getByRole('button', { name: '+ Add status' }));
    await userEvent.type(screen.getByLabelText('Name of status 6'), 'Awaiting parts');
    await userEvent.selectOptions(screen.getByLabelText('Meaning of Awaiting parts'), 'warn');
    await userEvent.click(screen.getByRole('button', { name: 'Save type' }));
    expect(vi.mocked(catalog.updateType).mock.calls[0]![1].statuses.at(-1)).toEqual({ key: null, label: 'Awaiting parts', meaning: 'warn' });
  });

  it('shows a stale version with a Reload button', async () => {
    const updateType = vi.fn().mockRejectedValue(new ApiError(409, 'Someone else changed HVAC unit while you were editing (it is now at version 4). Reload it and make your changes again.'));
    const { catalog } = renderWorkspace('/settings/asset-types', { assets: { catalog: { updateType } } });
    await screen.findByRole('heading', { name: 'HVAC unit', level: 2 });
    await userEvent.click(screen.getAllByRole('checkbox', { name: 'Required' })[0]!);
    await userEvent.click(screen.getByRole('button', { name: 'Save type' }));
    expect(await screen.findByText(/Someone else changed HVAC unit/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(catalog.types).toHaveBeenCalledTimes(2));
    expect(screen.getByText('All changes saved.')).toBeInTheDocument();
  });

  it("explains why a field's kind can't change", async () => {
    renderWorkspace('/settings/asset-types');
    await screen.findByRole('heading', { name: 'HVAC unit', level: 2 });
    await userEvent.selectOptions(screen.getByLabelText('Kind of Model'), 'number');
    await userEvent.click(screen.getByRole('button', { name: 'Save type' }));
    expect(await screen.findByText(/"Model" is a text field and can't become a number field/)).toBeInTheDocument();
  });

  it('creates a new type and shows field errors from the server', async () => {
    renderWorkspace('/settings/asset-types');
    await userEvent.click(await screen.findByRole('button', { name: /New asset type/ }));
    await userEvent.type(within(screen.getByRole('region', { name: 'Type details' })).getByRole('textbox', { name: /^Name/ }), 'Pump');
    await userEvent.type(screen.getByLabelText(/Tag prefix/), 'hvac');
    await userEvent.click(screen.getByRole('button', { name: 'Create type' }));
    expect(await screen.findByText('Another type already uses the prefix HVAC.')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText(/Tag prefix/));
    await userEvent.type(screen.getByLabelText(/Tag prefix/), 'pmp');
    await userEvent.click(screen.getByRole('button', { name: 'Create type' }));
    expect(await screen.findByText('Pump was created. You can add assets of this type now.')).toBeInTheDocument();
  });

  it('adds a type from the template library', async () => {
    const { catalog } = renderWorkspace('/settings/asset-types');
    await userEvent.click(await screen.findByRole('button', { name: 'Add from template library' }));
    const dialog = screen.getByRole('dialog', { name: 'Add from template library' });
    expect(within(dialog).getByRole('button', { name: 'Add type' })).toHaveAccessibleDescription('Choose a template first.');
    await userEvent.click(await within(dialog).findByRole('radio', { name: /Generator/ }));
    await userEvent.clear(within(dialog).getByLabelText('Name'));
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Standby generator');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add type' }));
    expect(catalog.fromTemplate).toHaveBeenCalledWith('generator', 'Standby generator', 'GEN');
    expect(await screen.findByRole('heading', { name: 'Standby generator', level: 2 })).toBeInTheDocument();
  });

  it('archives and restores, and archived types are read-only', async () => {
    renderWorkspace('/settings/asset-types');
    await screen.findByRole('heading', { name: 'HVAC unit', level: 2 });
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(await screen.findByText(/HVAC unit is archived. No new assets/, { selector: '.notice-ok div' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save type' })).toHaveAccessibleDescription('HVAC unit is archived. Restore it before changing it.');
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(await screen.findByText('HVAC unit is restored.')).toBeInTheDocument();
  });

  it('says why changes are blocked without settings.manage', async () => {
    renderWorkspace('/settings/asset-types', { withoutPermissions: ['settings.manage'] });
    expect(await screen.findByRole('button', { name: /New asset type/ })).toHaveAccessibleDescription('You need the settings.manage permission to change asset types. Ask an Admin.');
  });

  it('shows load errors with a retry, and an empty state', async () => {
    const types = vi.fn().mockRejectedValueOnce(new ApiError(0, "Can't reach the server.")).mockResolvedValue([]);
    renderWorkspace('/settings/asset-types', { assets: { catalog: { types } } });
    expect(await screen.findByText(/Asset types didn't load/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No asset types yet')).toBeInTheDocument();
  });
});
