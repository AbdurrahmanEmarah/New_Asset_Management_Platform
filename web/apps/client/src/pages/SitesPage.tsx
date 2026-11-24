import { useState, type FormEvent } from 'react';
import { ApiError } from '../../../../shared/api/http';
import { errorText } from '../../../../shared/errors';
import { useLoad } from '../../../../shared/hooks';
import { Button, Dialog, Field, Notice, PlusIcon, StatusPill } from '../../../../shared/ui';
import { PERMISSIONS, type Site, type SiteInput } from '../api/access';
import { useApi } from '../api/context';
import { needs, useMe } from '../me';

export function SitesPage() {
  const api = useApi();
  const me = useMe();
  const [sites, reload] = useLoad(() => api.sites(), [api]);
  const [editing, setEditing] = useState<Site | 'new' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const manageReason = needs(me, PERMISSIONS.manageSettings, 'change sites');
  const rows = sites.data ?? [];

  return (
    <div className="page">
      <div className="page-head">
        <div style={{ flexGrow: 1 }}>
          <div className="eyebrow">Settings · Sites</div>
          <h1>Sites</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>The places your company works. When you give someone a role, you can limit it to some of these sites.</p>
        </div>
        <Button variant="primary" disabledReason={manageReason} onClick={() => { setEditing('new'); setMessage(null); }}><PlusIcon /> New site</Button>
      </div>

      {message ? <Notice kind="ok" action={<Button size="sm" onClick={() => setMessage(null)}>Dismiss</Button>}>{message}</Notice> : null}

      <section className="card" aria-label="Sites">
        {sites.status === 'error' ? (
          <div style={{ padding: 16 }}>
            <Notice kind="error" action={<Button size="sm" onClick={reload}>Try again</Button>}>Sites didn't load: {sites.error.message}</Notice>
          </div>
        ) : null}
        {sites.status === 'loading' && rows.length === 0 ? <p className="muted" style={{ padding: 16, margin: 0 }}>Loading sites…</p> : null}
        {sites.status === 'ready' && rows.length === 0 ? (
          <div className="empty"><strong>No sites yet</strong><span>Add your buildings, depots or yards. Until then, every role applies everywhere.</span></div>
        ) : null}
        {rows.length > 0 ? (
          <div className="table-scroll">
            <table className="data" style={{ minWidth: 560 }}>
              <thead><tr><th>Site</th><th>Code</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td><strong>{s.name}</strong></td>
                    <td className="mono">{s.code}</td>
                    <td><StatusPill kind={s.isActive ? 'ok' : 'none'}>{s.isActive ? 'In use' : 'Not in use'}</StatusPill></td>
                    <td>
                      <div className="row-actions">
                        <Button size="sm" disabledReason={manageReason} aria-label={`Edit ${s.name}`} onClick={() => { setEditing(s); setMessage(null); }}>Edit</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <p className="muted foot-note">A site that's not in use can't be chosen for new role assignments. People who already have it keep it until you change their roles.</p>
      </section>

      {editing ? (
        <SiteDialog site={editing === 'new' ? null : editing} onClose={() => setEditing(null)}
          onSaved={(s, created) => { setEditing(null); setMessage(created ? `${s.name} was added.` : `${s.name} is saved.`); reload(); }} />
      ) : null}
    </div>
  );
}

function SiteDialog({ site, onClose, onSaved }: { site: Site | null; onClose: () => void; onSaved: (s: Site, created: boolean) => void }) {
  const api = useApi();
  const [form, setForm] = useState<SiteInput>(site ? { name: site.name, code: site.code, isActive: site.isActive } : { name: '', code: '', isActive: true });
  const [errors, setErrors] = useState<Partial<Record<'name' | 'code', string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found: typeof errors = {};
    if (!form.name.trim()) found.name = 'Give the site a name, e.g. "HQ Tower".';
    if (!form.code.trim()) found.code = 'Give the site a short code, e.g. HQ. It appears on labels and reports.';
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      const body = { ...form, name: form.name.trim(), code: form.code.trim() };
      onSaved(site ? await api.updateSite(site.id, body) : await api.createSite(body), !site);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) setErrors({ name: err.field('name'), code: err.field('code') });
      else setFormError(errorText(err, 'The site could not be saved.'));
      setBusy(false);
    }
  }

  return (
    <Dialog title={site ? `Edit ${site.name}` : 'New site'} onClose={onClose}>
      <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {formError ? <Notice kind="error">{formError}</Notice> : null}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Field label="Name" required error={errors.name} style={{ flex: '2 1 220px' }}>
            <input className="input" value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors({ ...errors, name: undefined }); }} />
          </Field>
          <Field label="Code" required error={errors.code} style={{ flex: '1 1 120px' }}>
            <input className="input mono" value={form.code} onChange={(e) => { setForm({ ...form, code: e.target.value.toUpperCase() }); setErrors({ ...errors, code: undefined }); }} />
          </Field>
        </div>
        <label className="check-row" style={{ padding: 0 }}>
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 600 }}>In use</span>
            <span className="muted" style={{ fontSize: 12.5 }}>Untick when you stop working at this site. Its history stays.</span>
          </span>
        </label>
        <div className="dialog-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy}>{busy ? 'Saving…' : site ? 'Save site' : 'Add site'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
