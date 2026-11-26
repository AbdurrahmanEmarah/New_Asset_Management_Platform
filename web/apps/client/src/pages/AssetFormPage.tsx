import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ApiError } from '../../../../shared/api/http';
import { errorText } from '../../../../shared/errors';
import { useDebounced, useLoad } from '../../../../shared/hooks';
import { Button, Field, Notice } from '../../../../shared/ui';
import type { Site, User } from '../api/access';
import type { Asset, AssetRef, AssetType, FieldDefinition, FieldValues } from '../api/assets';
import { useAssetApis } from '../api/context';
import { readOnlyReason, sitesWith, useMe } from '../me';
import { useLookups } from './assetFormat';

/** Sites the person may add or change assets at (site scope on their role assignments). */
export function writableSites(all: Site[], scope: 'all' | string[]): Site[] {
  return all.filter((s) => s.isActive && (scope === 'all' || scope.includes(s.id)));
}

export function AssetFormPage() {
  const { id } = useParams();
  const { assets, catalog } = useAssetApis();
  const [existing, reloadExisting] = useLoad(() => (id ? assets.get(id) : Promise.resolve(null)), [assets, id]);
  const [types, reloadTypes] = useLoad(() => catalog.types(false), [catalog]);
  const [usage] = useLoad(() => (id ? Promise.resolve(null) : assets.usage()), [assets, id]);
  const limitReason = usage.data?.state === 'blocked' ? usage.data.blockedReason ?? 'All the assets your plan allows are in use.' : null;

  if (existing.status === 'error') return <div className="page"><Notice kind="error" action={<Button size="sm" onClick={reloadExisting}>Try again</Button>}>The asset didn't load: {existing.error.message}</Notice></div>;
  if (types.status === 'error') return <div className="page"><Notice kind="error" action={<Button size="sm" onClick={reloadTypes}>Try again</Button>}>Asset types didn't load: {types.error.message}</Notice></div>;
  if ((id && !existing.data) || !types.data) return <div className="page"><p className="muted" style={{ margin: 0 }}>Loading…</p></div>;
  return <AssetForm key={id ?? 'new'} asset={existing.data ?? null} types={types.data} limitReason={limitReason} />;
}

interface Form { typeId: string; name: string; statusKey: string; siteId: string; location: string; parent: AssetRef | null; values: FieldValues }

function AssetForm({ asset, types, limitReason }: { asset: Asset | null; types: AssetType[]; limitReason: string | null }) {
  const { assets } = useAssetApis();
  const me = useMe();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { sites, peopleList } = useLookups();
  const sites_ = writableSites(sites, sitesWith(me, 'assets.write'));
  const initialType = asset?.typeId ?? (types.some((t) => t.id === params.get('type')) ? params.get('type')! : types[0]?.id ?? '');
  const [form, setForm] = useState<Form>(() => ({
    typeId: initialType,
    name: asset?.name ?? '',
    statusKey: asset?.status.key ?? '',
    siteId: asset?.siteId ?? '',
    location: asset?.location ?? '',
    parent: asset?.parent ?? null,
    values: asset ? structuredClone(asset.values) : {},
  }));
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const type = types.find((t) => t.id === form.typeId);
  const fields: FieldDefinition[] = [...(asset?.fields ?? type?.fields ?? [])].sort((x, y) => x.order - y.order);
  const statuses = asset?.statuses ?? type?.statuses ?? [];
  const statusKey = form.statusKey || statuses[0]?.key || '';
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const setValue = (key: string, value: unknown) => {
    setForm((f) => ({ ...f, values: { ...f.values, [key]: value } }));
    setErrors((e) => ({ ...e, [`values.${key}`]: undefined }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (!form.typeId) found.typeId = 'Choose an asset type.';
    if (!form.name.trim()) found.name = 'Give the asset a name people recognise, e.g. "Chiller CH-4".';
    if (!asset && !form.siteId) found.siteId = 'Choose the site where it is.';
    for (const f of fields) {
      const v = form.values[f.key];
      if (f.required && (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0))) found[`values.${f.key}`] = `${f.label} is required.`;
    }
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    setBusy(true);
    const values = Object.fromEntries(Object.entries(form.values).filter(([, v]) => v !== '' && v !== undefined));
    try {
      const saved = asset
        ? await assets.update(asset.id, { name: form.name.trim(), statusKey, location: form.location.trim(), parentId: form.parent?.id ?? null, values })
        : await assets.create({ typeId: form.typeId, name: form.name.trim(), statusKey, siteId: form.siteId || null, location: form.location.trim(), parentId: form.parent?.id ?? null, values });
      navigate(`/assets/${saved.id}`, { state: { message: asset ? `${saved.tag} is saved.` : `${saved.tag} ${saved.name} was added.` } });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        setErrors(Object.fromEntries(Object.entries(err.fieldErrors).map(([k, v]) => [k, v[0]])));
        const unplaced = Object.keys(err.fieldErrors).filter((k) => !['name', 'typeId', 'siteId', 'location', 'statusKey', 'parentId'].includes(k) && !k.startsWith('values.'));
        setFormError(unplaced.length ? unplaced.map((k) => err.fieldErrors[k]![0]).join(' ') : 'Fix the highlighted fields and try again.');
      } else {
        setFormError(errorText(err, 'The asset could not be saved.'));
      }
      setBusy(false);
    }
  }

  const title = asset ? `Edit ${asset.tag}` : `New ${type?.name ?? 'asset'}`;

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <nav aria-label="Breadcrumb" className="crumbs"><Link to="/assets">Assets</Link><span aria-hidden="true">/</span>{asset ? <><Link to={`/assets/${asset.id}`}>{asset.tag}</Link><span aria-hidden="true">/</span></> : null}<span>{asset ? 'Edit' : 'New'}</span></nav>
      <div className="page-head"><h1>{title}</h1></div>
      {asset?.cannotEditReason ? <Notice kind="warn">{asset.cannotEditReason}</Notice> : null}
      {limitReason ? <Notice kind="warn">{limitReason}</Notice> : null}
      <form className="card asset-form" onSubmit={submit} noValidate>
        {formError ? <Notice kind="error">{formError}</Notice> : null}
        {asset ? null : (
          <Field label="Asset type" required error={errors.typeId}>
            <select className="input" value={form.typeId} onChange={(e) => set({ typeId: e.target.value, statusKey: '', values: {} })}>
              {types.length === 0 ? <option value="">No asset types yet</option> : null}
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        )}
        <div className="form-row">
          <Field label="Name" required error={errors.name} style={{ flex: '2 1 240px' }}>
            <input className="input" value={form.name} placeholder="e.g. Chiller CH-4" onChange={(e) => { set({ name: e.target.value }); setErrors({ ...errors, name: undefined }); }} />
          </Field>
          <Field label="Status" error={errors.statusKey} style={{ flex: '1 1 180px' }}>
            <select className="input" value={statusKey} onChange={(e) => set({ statusKey: e.target.value })}>
              {statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </Field>
        </div>
        <div className="form-row">
          {asset ? (
            <Field label="Site" hint="Use Move on the asset to change its site." style={{ flex: '1 1 200px' }}>
              <input className="input" readOnly value={sites.find((s) => s.id === asset.siteId)?.name ?? 'No site'} />
            </Field>
          ) : (
            <Field label="Site" required error={errors.siteId} style={{ flex: '1 1 200px' }}
              hint={sites_.length === 0 && sites.length > 0 ? 'None of your roles lets you add assets at a site. Ask an Admin.' : 'Only sites where you may add assets are listed.'}>
              <select className="input" value={form.siteId} onChange={(e) => { set({ siteId: e.target.value }); setErrors({ ...errors, siteId: undefined }); }}>
                <option value="">Choose a site</option>
                {sites_.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Location" error={errors.location} hint="Where on the site, e.g. Roof or Bay 3." style={{ flex: '2 1 240px' }}>
            <input className="input" value={form.location} onChange={(e) => set({ location: e.target.value })} />
          </Field>
        </div>
        <AssetPicker label="Part of" hint="Optional. The asset this one belongs to, e.g. the chiller a compressor is in." value={form.parent} excludeId={asset?.id}
          error={errors.parentId} onChange={(parent) => set({ parent })} />

        {fields.length > 0 ? <h2 className="form-section">{asset?.typeName ?? type?.name} details</h2> : null}
        {fields.map((f) => (
          <ValueInput key={f.key} field={f} value={form.values[f.key]} error={errors[`values.${f.key}`]} people={peopleList} onChange={(v) => setValue(f.key, v)} />
        ))}

        <div className="dialog-actions">
          <Button onClick={() => navigate(asset ? `/assets/${asset.id}` : '/assets')}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy} disabledReason={readOnlyReason(me) ?? asset?.cannotEditReason ?? limitReason ?? (types.length === 0 && !asset ? 'Create an asset type first, in Settings › Asset types.' : null)}>
            {busy ? 'Saving…' : asset ? 'Save asset' : 'Create asset'}
          </Button>
        </div>
      </form>
    </div>
  );
}

function ValueInput({ field, value, error, people, onChange }: { field: FieldDefinition; value: unknown; error?: string | undefined; people: User[]; onChange: (v: unknown) => void }) {
  const r = field.rules;
  const today = new Date().toISOString().slice(0, 10);
  const common = { label: field.label, required: field.required, error };
  switch (field.kind) {
    case 'number':
      return (
        <Field {...common} hint={[r.unit && `In ${r.unit}`, r.min != null && `at least ${r.min}`, r.max != null && `at most ${r.max}`].filter(Boolean).join(', ') || undefined}>
          <input className="input" inputMode="decimal" value={value === undefined || value === null ? '' : String(value)}
            onChange={(e) => onChange(e.target.value.trim() === '' ? '' : Number.isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value))} />
        </Field>
      );
    case 'date':
      return (
        <Field {...common} hint={r.notInFuture ? "Can't be in the future." : undefined}>
          <input className="input" type="date" max={r.notInFuture ? today : undefined} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
    case 'choice':
      if (r.multiple) {
        const picked = Array.isArray(value) ? (value as string[]) : [];
        return (
          <fieldset className="field" style={{ border: 'none', margin: 0, padding: 0 }}>
            <legend style={{ padding: 0, marginBottom: 6 }}>{field.label}{field.required ? <span aria-hidden="true" style={{ color: 'var(--fault)' }}> *</span> : null}</legend>
            {(r.options ?? []).map((o) => (
              <label key={o} className="check-row" style={{ padding: '4px 0' }}>
                <input type="checkbox" checked={picked.includes(o)} onChange={() => onChange(picked.includes(o) ? picked.filter((x) => x !== o) : [...picked, o])} />{o}
              </label>
            ))}
            {error ? <span className="field-error">{error}</span> : null}
          </fieldset>
        );
      }
      return (
        <Field {...common}>
          <select className="input" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)}>
            <option value="">Choose…</option>
            {(r.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
      );
    case 'person':
      return (
        <Field {...common} hint={people.length === 0 ? "The list of people isn't available to you; ask an Admin to set this field." : undefined}>
          <select className="input" value={typeof value === 'string' ? value : ''} disabled={people.length === 0 && !value} onChange={(e) => onChange(e.target.value)}>
            <option value="">Nobody</option>
            {people.filter((p) => p.status !== 'deactivated' || p.id === value).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      );
    case 'asset':
      return <AssetPicker label={field.label} required={field.required} error={error} value={typeof value === 'string' && value ? { id: value, tag: 'Linked asset', name: '' } : null} onChange={(a) => onChange(a?.id ?? '')} />;
    case 'file':
      return (
        <Field {...common} hint="Upload files on the asset's Documents tab. Linking a document to this field arrives with the next release.">
          <input className="input" readOnly value={value ? 'A document is attached' : 'No document'} />
        </Field>
      );
    default:
      return (
        <Field {...common} hint={r.pattern ? r.patternHint ?? undefined : r.maxLength ? `Up to ${r.maxLength} characters.` : undefined}>
          <input className="input" maxLength={r.maxLength ?? undefined} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
  }
}

/** Search the register for one asset, e.g. the parent, or an asset-link field. */
export function AssetPicker({ label, hint, required, value, error, excludeId, onChange }: {
  label: string; hint?: string; required?: boolean; value: AssetRef | null; error?: string | undefined; excludeId?: string | undefined; onChange: (a: AssetRef | null) => void;
}) {
  const { assets } = useAssetApis();
  const [term, setTerm] = useState('');
  const debounced = useDebounced(term);
  const [results] = useLoad(
    () => (debounced.trim().length < 2 ? Promise.resolve(null) : assets.list({ typeId: null, siteId: null, status: null, search: debounced, includeRetired: false, page: 1, pageSize: 8, sort: 'tag', order: 'asc' })),
    [assets, debounced],
  );
  const options = (results.data?.items ?? []).filter((a) => a.id !== excludeId);

  if (value) {
    return (
      <div className="field">
        <span>{label}{required ? <span aria-hidden="true" style={{ color: 'var(--fault)' }}> *</span> : null}</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="input preview-input" style={{ color: 'var(--text)' }}><span className="mono">{value.tag}</span>{value.name ? ` ${value.name}` : ''}</span>
          <Button size="sm" onClick={() => onChange(null)} aria-label={`Clear ${label}`}>Clear</Button>
        </div>
        {error ? <span className="field-error">{error}</span> : null}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Field label={label} required={required} hint={hint} error={error}>
        <input className="input" value={term} placeholder="Type a tag or name" onChange={(e) => setTerm(e.target.value)} />
      </Field>
      {debounced.trim().length >= 2 ? (
        <ul className="picker" aria-label={`${label}: matching assets`}>
          {results.status === 'loading' ? <li className="muted">Searching…</li> : null}
          {results.status === 'error' ? <li className="field-error">{results.error.message}</li> : null}
          {results.status === 'ready' && options.length === 0 ? <li className="muted">No asset matches "{debounced}".</li> : null}
          {options.map((a) => (
            <li key={a.id}><button type="button" onClick={() => { onChange({ id: a.id, tag: a.tag, name: a.name }); setTerm(''); }}><span className="mono">{a.tag}</span> {a.name}</button></li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
