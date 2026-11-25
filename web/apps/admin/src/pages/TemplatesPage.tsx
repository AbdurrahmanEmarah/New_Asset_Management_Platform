import { useState, type FormEvent } from 'react';
import { ApiError } from '../../../../shared/api/http';
import { FieldRulesEditor } from '../../../../shared/catalog/FieldRulesEditor';
import { KIND_LABELS, MEANINGS, type FieldInput, type FieldKind, type StatusInput, type Template } from '../../../../shared/catalog/types';
import { errorText } from '../../../../shared/errors';
import { useLoad } from '../../../../shared/hooks';
import { Button, Dialog, Field, Notice, PlusIcon, StatusPill } from '../../../../shared/ui';
import { useCatalogApi } from '../api/context';
import type { TemplateInput } from '../api/catalog';
import { OWNER_ONLY, useMe } from '../me';

const when = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const KINDS = Object.entries(KIND_LABELS) as [FieldKind, string][];

export function TemplatesPage() {
  const catalog = useCatalogApi();
  const me = useMe();
  const [templates, reload] = useLoad(() => catalog.templates(), [catalog]);
  const [editing, setEditing] = useState<Template | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Template | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const manageReason = me.canManageClients ? null : OWNER_ONLY;
  const rows = templates.data ?? [];

  return (
    <div className="page">
      <div className="page-head">
        <div style={{ flexGrow: 1 }}>
          <div className="eyebrow">Business · Template library</div>
          <h1>Template library</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>Ready-made asset types clients can copy. Changing a template doesn't change types clients already copied.</p>
        </div>
        <Button variant="primary" disabledReason={manageReason} onClick={() => { setEditing('new'); setMessage(null); }}><PlusIcon /> New template</Button>
      </div>
      {message ? <Notice kind="ok" action={<Button size="sm" onClick={() => setMessage(null)}>Dismiss</Button>}>{message}</Notice> : null}
      <section className="card" aria-label="Templates">
        {templates.status === 'error' ? <div style={{ padding: 16 }}><Notice kind="error" action={<Button size="sm" onClick={reload}>Try again</Button>}>Templates didn't load: {templates.error.message}</Notice></div> : null}
        {templates.status === 'loading' && rows.length === 0 ? <p className="muted" style={{ padding: 16, margin: 0 }}>Loading templates…</p> : null}
        {templates.status === 'ready' && rows.length === 0 ? <div className="empty"><strong>The library is empty</strong><span>Add a template so clients can start from it in Settings › Asset types.</span></div> : null}
        {rows.length > 0 ? (
          <div className="table-scroll">
            <table className="data" style={{ minWidth: 860 }}>
              <thead><tr><th>Template</th><th>Category</th><th>Tag prefix</th><th>Fields</th><th>Statuses</th><th>Updated</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.key}>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 320 }}>
                        <strong>{t.name}</strong>
                        <span className="muted" style={{ fontSize: 13 }}>{t.description}</span>
                        <span className="mono muted" style={{ fontSize: 12 }}>{t.key}</span>
                      </div>
                    </td>
                    <td>{t.category}</td>
                    <td className="mono">{t.tagPrefix}</td>
                    <td className="muted" style={{ maxWidth: 240 }}>{t.fields.map((f) => f.label).join(', ') || '–'}</td>
                    <td><div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{t.statuses.map((s) => <StatusPill key={s.key} kind={s.meaning}>{s.label}</StatusPill>)}</div></td>
                    <td className="mono muted">{when.format(new Date(t.updatedAt))}</td>
                    <td>
                      <div className="row-actions">
                        <Button size="sm" aria-label={`Edit ${t.name}`} disabledReason={manageReason} onClick={() => { setEditing(t); setMessage(null); }}>Edit</Button>
                        <Button size="sm" variant="danger" aria-label={`Delete ${t.name}`} disabledReason={manageReason} onClick={() => setDeleting(t)}>Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {editing ? (
        <TemplateEditor template={editing === 'new' ? null : editing} taken={rows.map((t) => t.key)} onClose={() => setEditing(null)}
          onSaved={(t, created) => { setEditing(null); setMessage(created ? `${t.name} was added to the library.` : `${t.name} is saved. Clients who already copied it keep their version.`); reload(); }} />
      ) : null}
      {deleting ? (
        <DeleteTemplate template={deleting} onClose={() => setDeleting(null)} onDone={() => { setMessage(`${deleting.name} was removed from the library. Clients' copies stay.`); setDeleting(null); reload(); }} />
      ) : null}
    </div>
  );
}

function DeleteTemplate({ template, onClose, onDone }: { template: Template; onClose: () => void; onDone: () => void }) {
  const catalog = useCatalogApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog title={`Delete ${template.name}?`} description="Clients can't add it any more. Types they already copied from it stay as they are." onClose={onClose}>
      {error ? <Notice kind="error">{error}</Notice> : null}
      <div className="dialog-actions">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="danger" busy={busy} onClick={async () => {
          setBusy(true);
          try {
            await catalog.deleteTemplate(template.key);
            onDone();
          } catch (err) {
            setError(errorText(err, 'The template could not be deleted.'));
            setBusy(false);
          }
        }}>{busy ? 'Deleting…' : 'Delete template'}</Button>
      </div>
    </Dialog>
  );
}

const keyFrom = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

function TemplateEditor({ template, taken, onClose, onSaved }: { template: Template | null; taken: string[]; onClose: () => void; onSaved: (t: Template, created: boolean) => void }) {
  const catalog = useCatalogApi();
  const [key, setKey] = useState(template?.key ?? '');
  const [form, setForm] = useState<TemplateInput>(() => template ? {
    name: template.name, description: template.description, category: template.category, tagPrefix: template.tagPrefix, iconKey: template.iconKey,
    fields: [...template.fields].sort((a, b) => a.order - b.order).map((f) => ({ key: f.key, label: f.label, kind: f.kind, required: f.required, rules: f.rules })),
    statuses: [...template.statuses].sort((a, b) => a.order - b.order).map((s) => ({ key: s.key, label: s.label, meaning: s.meaning })),
  } : { name: '', description: '', category: '', tagPrefix: '', iconKey: 'asset', fields: [], statuses: [{ key: null, label: 'In service', meaning: 'ok' }] });
  const [rulesFor, setRulesFor] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<TemplateInput>) => setForm((f) => ({ ...f, ...patch }));
  const setField = (i: number, patch: Partial<FieldInput>) => set({ fields: form.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const setStatus = (i: number, patch: Partial<StatusInput>) => set({ statuses: form.statuses.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const effectiveKey = template ? template.key : key || keyFrom(form.name);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (!form.name.trim()) found.name = 'Name is required.';
    if (!template && !/^[a-z0-9][a-z0-9-]{1,39}$/.test(effectiveKey)) found.key = 'Use 2 to 40 lowercase letters, numbers and dashes, e.g. fire-safety.';
    else if (!template && taken.includes(effectiveKey)) found.key = `"${effectiveKey}" is already used. Choose another key, or edit that template.`;
    if (!form.tagPrefix.trim()) found.tagPrefix = 'Tag prefix is required, e.g. PMP for pumps.';
    if (form.statuses.length === 0) found.statuses = 'Add at least one status.';
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      onSaved(await catalog.saveTemplate(effectiveKey, form), !template);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        setErrors(Object.fromEntries(Object.entries(err.fieldErrors).map(([k, v]) => [k, v[0]])));
        setFormError(err.message);
      } else setFormError(errorText(err, 'The template could not be saved.'));
      setBusy(false);
    }
  }

  return (
    <Dialog title={template ? `Edit ${template.name}` : 'New template'} description="Clients get their own copy when they add it. Leave field keys to the server for new fields." onClose={onClose}>
      <form onSubmit={submit} noValidate className="template-form">
        {formError ? <Notice kind="error">{formError}</Notice> : null}
        <div className="form-grid">
          <Field label="Name" required error={errors.name}><input className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Key" required error={errors.key} hint={template ? "Can't change: clients' copies refer to it." : 'Used in links; made from the name if left empty.'}>
            <input className="input mono" value={template ? template.key : key} readOnly={Boolean(template)} placeholder={keyFrom(form.name)} onChange={(e) => setKey(e.target.value.toLowerCase())} />
          </Field>
          <Field label="Category" hint="e.g. Safety, Power, Fleet"><input className="input" value={form.category} onChange={(e) => set({ category: e.target.value })} /></Field>
          <Field label="Tag prefix" required error={errors.tagPrefix}><input className="input mono" value={form.tagPrefix} onChange={(e) => set({ tagPrefix: e.target.value.toUpperCase() })} /></Field>
        </div>
        <Field label="Description"><textarea className="input" rows={2} value={form.description} onChange={(e) => set({ description: e.target.value })} /></Field>

        <fieldset className="editor-group">
          <legend>Fields</legend>
          {form.fields.length === 0 ? <p className="muted" style={{ margin: 0 }}>No fields yet.</p> : null}
          {form.fields.map((f, i) => (
            <div key={i} className="editor-row-wrap">
              <div className="editor-row">
                <input className="input" aria-label={`Label of field ${i + 1}`} value={f.label} onChange={(e) => setField(i, { label: e.target.value })} />
                <select className="input" aria-label={`Kind of field ${i + 1}`} value={f.kind} onChange={(e) => setField(i, { kind: e.target.value as FieldKind, rules: {} })}>
                  {KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
                <label className="check-row" style={{ padding: 0 }}><input type="checkbox" checked={f.required} onChange={() => setField(i, { required: !f.required })} />Required</label>
                <Button size="sm" aria-expanded={rulesFor === i} onClick={() => setRulesFor(rulesFor === i ? null : i)}>Rules</Button>
                <Button size="sm" variant="danger" aria-label={`Remove field ${i + 1}`} onClick={() => { set({ fields: form.fields.filter((_, j) => j !== i) }); setRulesFor(null); }}>×</Button>
              </div>
              {rulesFor === i ? <FieldRulesEditor field={f} readOnly={false} onChange={(rules) => setField(i, { rules })} /> : null}
            </div>
          ))}
          <div><Button size="sm" onClick={() => set({ fields: [...form.fields, { key: null, label: '', kind: 'text', required: false, rules: {} }] })}>+ Add field</Button></div>
        </fieldset>

        <fieldset className="editor-group">
          <legend>Statuses</legend>
          {errors.statuses ? <span className="field-error">{errors.statuses}</span> : null}
          {form.statuses.map((s, i) => (
            <div key={i} className="editor-row">
              <input className="input" aria-label={`Name of status ${i + 1}`} value={s.label} onChange={(e) => setStatus(i, { label: e.target.value })} />
              <select className="input" aria-label={`Meaning of status ${i + 1}`} value={s.meaning} onChange={(e) => setStatus(i, { meaning: e.target.value as StatusInput['meaning'] })}>
                {MEANINGS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <StatusPill kind={s.meaning}>{s.label || 'Preview'}</StatusPill>
              <span />
              <Button size="sm" variant="danger" aria-label={`Remove status ${i + 1}`} disabledReason={form.statuses.length === 1 ? 'A template needs at least one status.' : null}
                onClick={() => set({ statuses: form.statuses.filter((_, j) => j !== i) })}>×</Button>
            </div>
          ))}
          <div><Button size="sm" onClick={() => set({ statuses: [...form.statuses, { key: null, label: '', meaning: 'info' }] })}>+ Add status</Button></div>
        </fieldset>

        <div className="dialog-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy}>{busy ? 'Saving…' : template ? 'Save template' : 'Add template'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
