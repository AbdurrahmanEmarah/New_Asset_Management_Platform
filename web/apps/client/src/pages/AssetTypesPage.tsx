import { useState } from 'react';
import { ApiError } from '../../../../shared/api/http';
import { errorText } from '../../../../shared/errors';
import { useLoad } from '../../../../shared/hooks';
import { Button, Field, Notice, PlusIcon, StatusPill } from '../../../../shared/ui';
import { PERMISSIONS } from '../api/access';
import { KIND_LABELS, MEANINGS, type AssetType, type AssetTypeInput, type FieldInput, type FieldKind, type StatusInput } from '../api/assets';
import { useAssetApis } from '../api/context';
import { needs, useMe } from '../me';
import { FieldRulesEditor, rulesSummary } from '../../../../shared/catalog/FieldRulesEditor';
import { TemplateDialog } from './TemplateDialog';

const KINDS = Object.entries(KIND_LABELS) as [FieldKind, string][];
const NEW = 'new';

const toInput = (t: AssetType): AssetTypeInput => ({
  name: t.name, tagPrefix: t.tagPrefix, iconKey: t.iconKey, version: t.version,
  fields: [...t.fields].sort((x, y) => x.order - y.order).map((f) => ({ key: f.key, label: f.label, kind: f.kind, required: f.required, rules: structuredClone(f.rules) })),
  statuses: [...t.statuses].sort((x, y) => x.order - y.order).map((s) => ({ key: s.key, label: s.label, meaning: s.meaning })),
});

const BLANK: AssetTypeInput = {
  name: '', tagPrefix: '', iconKey: 'asset', version: null, fields: [],
  statuses: [{ key: null, label: 'In service', meaning: 'ok' }, { key: null, label: 'Needs attention', meaning: 'warn' }, { key: null, label: 'Out of service', meaning: 'fault' }],
};

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

export function AssetTypesPage() {
  const { catalog } = useAssetApis();
  const me = useMe();
  const [types, reload] = useLoad(() => catalog.types(true), [catalog]);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ id: string; value: AssetTypeInput } | null>(null);
  const [templates, setTemplates] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<{ text: string; fields: Record<string, string[]>; stale: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [newField, setNewField] = useState<{ label: string; kind: FieldKind }>({ label: '', kind: 'text' });
  const [openRules, setOpenRules] = useState<number | null>(null);

  const all = types.data ?? [];
  const visible = all.filter((t) => showArchived || !t.isArchived);
  const selected = selectedId === NEW ? null : all.find((t) => t.id === selectedId) ?? visible[0] ?? null;
  const editingId = selectedId === NEW ? NEW : selected?.id ?? null;
  const base = selectedId === NEW ? BLANK : selected ? toInput(selected) : null;
  const current = draft && draft.id === editingId ? draft.value : base;
  const dirty = Boolean(draft && draft.id === editingId && base && JSON.stringify(draft.value) !== JSON.stringify(base));
  const manageReason = needs(me, PERMISSIONS.manageSettings, 'change asset types');
  const editReason = manageReason ?? (selected?.isArchived ? `${selected.name} is archived. Restore it before changing it.` : null);

  const edit = (change: Partial<AssetTypeInput>) => {
    if (!current || !editingId) return;
    setDraft({ id: editingId, value: { ...current, ...change } });
    setMessage(null);
  };
  const setFields = (fields: FieldInput[]) => edit({ fields });
  const setStatuses = (statuses: StatusInput[]) => edit({ statuses });

  const pick = (id: string) => {
    setSelectedId(id);
    setDraft(null);
    setError(null);
    setOpenRules(null);
  };

  async function save() {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const saved = selectedId === NEW ? await catalog.createType(current) : await catalog.updateType(selected!.id, current);
      setDraft(null);
      setSelectedId(saved.id);
      setMessage(selectedId === NEW ? `${saved.name} was created. You can add assets of this type now.` : `${saved.name} is saved. Existing assets use the new fields straight away.`);
      reload();
    } catch (err) {
      const stale = err instanceof ApiError && err.status === 409 && /Reload/i.test(err.message);
      setError({ text: errorText(err, 'The asset type could not be saved.'), fields: err instanceof ApiError ? err.fieldErrors : {}, stale });
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive(t: AssetType) {
    setBusy(true);
    setError(null);
    try {
      const saved = t.isArchived ? await catalog.restore(t.id) : await catalog.archive(t.id);
      setDraft(null);
      setMessage(saved.isArchived ? `${saved.name} is archived. No new assets of this type can be added; existing ones keep it.` : `${saved.name} is restored.`);
      if (saved.isArchived) setShowArchived(true);
      reload();
    } catch (err) {
      setError({ text: errorText(err, 'That didn\'t work.'), fields: {}, stale: false });
    } finally {
      setBusy(false);
    }
  }

  const fieldError = (key: string) => error?.fields[key]?.[0];
  const addField = () => {
    if (!current || !newField.label.trim()) return;
    setFields([...current.fields, { key: null, label: newField.label.trim(), kind: newField.kind, required: false, rules: newField.kind === 'choice' ? { options: [] } : {} }]);
    setNewField({ label: '', kind: newField.kind });
  };

  return (
    <div className="page">
      <div className="page-head">
        <div style={{ flexGrow: 1 }}>
          <div className="eyebrow">Settings · Configuration</div>
          <h1>Asset types</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>Decide what you track for each kind of asset. Changes apply to new and existing assets of that type.</p>
        </div>
        <Button disabledReason={manageReason} onClick={() => setTemplates(true)}>Add from template library</Button>
        <Button variant="primary" disabledReason={manageReason} onClick={() => pick(NEW)}><PlusIcon /> New asset type</Button>
      </div>

      {message ? <Notice kind="ok" action={<Button size="sm" onClick={() => setMessage(null)}>Dismiss</Button>}>{message}</Notice> : null}
      {types.status === 'error' ? <Notice kind="error" action={<Button size="sm" onClick={reload}>Try again</Button>}>Asset types didn't load: {types.error.message}</Notice> : null}
      {types.status === 'loading' && all.length === 0 ? <p className="muted" style={{ margin: 0 }}>Loading asset types…</p> : null}
      {types.status === 'ready' && all.length === 0 && selectedId !== NEW ? (
        <section className="card empty">
          <strong>No asset types yet</strong>
          <span>Start from the template library, or build your own type with the fields you track.</span>
        </section>
      ) : null}

      {current ? (
        <div className="types">
          <div className="type-list">
            <div role="group" aria-label="Asset types" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {visible.map((t) => (
                <button key={t.id} type="button" className="role" aria-pressed={t.id === editingId} onClick={() => pick(t.id)}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                    <span style={{ fontWeight: 700, fontSize: 14, flexGrow: 1 }}>{t.name}</span>
                    <span className="mono muted" style={{ fontSize: 12 }}>{t.tagPrefix}</span>
                  </span>
                  <span className="muted" style={{ fontSize: 12 }}>{t.isArchived ? 'Archived' : `${t.fields.length} fields · ${t.statuses.length} statuses`}</span>
                </button>
              ))}
              {selectedId === NEW ? <button type="button" className="role" aria-pressed="true"><strong>New asset type</strong></button> : null}
            </div>
            <label className="check-row" style={{ fontSize: 13 }}>
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Show archived types
            </label>
          </div>

          <div style={{ flex: '999 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <section className="card" aria-label="Type details">
              <div className="role-editor-head">
                <div style={{ flexGrow: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{selectedId === NEW ? 'New asset type' : selected?.name}</h2>
                  {selected?.isArchived ? <StatusPill kind="none">Archived</StatusPill> : null}
                  {selected?.templateKey ? <span className="tag">FROM TEMPLATE</span> : null}
                  {selected ? <span className="eyebrow" style={{ marginLeft: 'auto' }}>Version {selected.version}</span> : null}
                </div>
                {selected ? (
                  <Button size="sm" variant={selected.isArchived ? 'ghost' : 'danger'} busy={busy} disabledReason={manageReason ?? (dirty ? 'Save or discard your changes first.' : null)} onClick={() => toggleArchive(selected)}>
                    {selected.isArchived ? 'Restore' : 'Archive'}
                  </Button>
                ) : null}
              </div>
              {selected?.isArchived ? <div style={{ margin: '16px 20px 0' }}><Notice kind="warn">{selected.name} is archived. No new assets of this type can be added; existing assets keep it. Restore it to change it.</Notice></div> : null}
              <div className="role-section" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                <Field label="Name" required error={fieldError('name')} style={{ flex: '2 1 220px' }}>
                  <input className="input" value={current.name} readOnly={Boolean(editReason)} placeholder="e.g. Pump" onChange={(e) => edit({ name: e.target.value })} />
                </Field>
                <Field label="Tag prefix" required error={fieldError('tagPrefix')} hint="Starts every tag, e.g. PMP in PMP-000042." style={{ flex: '1 1 160px' }}>
                  <input className="input mono" value={current.tagPrefix} readOnly={Boolean(editReason)} onChange={(e) => edit({ tagPrefix: e.target.value.toUpperCase() })} />
                </Field>
              </div>

              <div className="field-table" role="table" aria-label="Fields">
                <div className="frow frow-head" role="row">
                  <span role="columnheader" className="eyebrow">Order</span>
                  <span role="columnheader" className="eyebrow">Field</span>
                  <span role="columnheader" className="eyebrow">Kind</span>
                  <span role="columnheader" className="eyebrow">Required</span>
                  <span role="columnheader"><span className="visually-hidden">Actions</span></span>
                </div>
                {current.fields.length === 0 ? <p className="muted" style={{ margin: 0, padding: '12px 20px' }}>No fields yet. Add the first one below; name and status are always there.</p> : null}
                {current.fields.map((f, i) => {
                  const change = (patch: Partial<FieldInput>) => setFields(current.fields.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  const name = f.label || `field ${i + 1}`;
                  return (
                    <div key={f.key ?? `new-${i}`} role="row">
                      <div className="frow">
                        <span role="cell" className="order-buttons">
                          <Button size="sm" aria-label={`Move ${name} up`} disabledReason={editReason ?? (i === 0 ? 'It is already first.' : null)} onClick={() => setFields(move(current.fields, i, i - 1))}>↑</Button>
                          <Button size="sm" aria-label={`Move ${name} down`} disabledReason={editReason ?? (i === current.fields.length - 1 ? 'It is already last.' : null)} onClick={() => setFields(move(current.fields, i, i + 1))}>↓</Button>
                        </span>
                        <span role="cell" style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                          <input className="input" aria-label={`Label of field ${i + 1}`} value={f.label} readOnly={Boolean(editReason)} onChange={(e) => change({ label: e.target.value })} />
                          <span className="muted" style={{ fontSize: 12 }}>{rulesSummary(f) || (f.key ? <span className="mono">{f.key}</span> : 'New field')}</span>
                        </span>
                        <span role="cell">
                          <select className="input" aria-label={`Kind of ${name}`} value={f.kind} disabled={Boolean(editReason)} onChange={(e) => change({ kind: e.target.value as FieldKind, rules: {} })}>
                            {KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                          </select>
                        </span>
                        <label role="cell" className="check-row" style={{ padding: 0 }}>
                          <input type="checkbox" checked={f.required} disabled={Boolean(editReason)} onChange={() => change({ required: !f.required })} />
                          {f.required ? 'Required' : 'Optional'}
                        </label>
                        <span role="cell" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <Button size="sm" aria-expanded={openRules === i} aria-label={`Rules for ${name}`} onClick={() => setOpenRules(openRules === i ? null : i)}>Rules</Button>
                          <Button size="sm" variant="danger" aria-label={`Remove ${name}`} disabledReason={editReason} onClick={() => { setFields(current.fields.filter((_, j) => j !== i)); setOpenRules(null); }}>×</Button>
                        </span>
                      </div>
                      {openRules === i ? <FieldRulesEditor field={f} readOnly={Boolean(editReason)} onChange={(rules) => change({ rules })} /> : null}
                    </div>
                  );
                })}
                <div className="add-field">
                  <Field label="New field name" style={{ flex: '2 1 200px' }}>
                    <input className="input" value={newField.label} placeholder="e.g. Filter size" disabled={Boolean(editReason)}
                      onChange={(e) => setNewField({ ...newField, label: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addField(); } }} />
                  </Field>
                  <Field label="Kind" style={{ flex: '1 1 170px' }}>
                    <select className="input" value={newField.kind} disabled={Boolean(editReason)} onChange={(e) => setNewField({ ...newField, kind: e.target.value as FieldKind })}>
                      {KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                    </select>
                  </Field>
                  <Button variant="primary" disabledReason={editReason ?? (newField.label.trim() ? null : 'Type the new field\'s name first.')} onClick={addField}>Add field</Button>
                </div>
              </div>
            </section>

            <section className="card" aria-label="Statuses">
              <div className="toolbar"><h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, flexGrow: 1 }}>Statuses</h2><span className="eyebrow">Order = life cycle</span></div>
              {fieldError('statuses') ? <p className="field-error" style={{ margin: '12px 16px 0' }}>{fieldError('statuses')}</p> : null}
              <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {current.statuses.map((st, i) => {
                  const change = (patch: Partial<StatusInput>) => setStatuses(current.statuses.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  const name = st.label || `status ${i + 1}`;
                  return (
                    <div key={st.key ?? `new-${i}`} className="status-row">
                      <span className="order-buttons">
                        <Button size="sm" aria-label={`Move ${name} up`} disabledReason={editReason ?? (i === 0 ? 'It is already first.' : null)} onClick={() => setStatuses(move(current.statuses, i, i - 1))}>↑</Button>
                        <Button size="sm" aria-label={`Move ${name} down`} disabledReason={editReason ?? (i === current.statuses.length - 1 ? 'It is already last.' : null)} onClick={() => setStatuses(move(current.statuses, i, i + 1))}>↓</Button>
                      </span>
                      <input className="input" aria-label={`Name of status ${i + 1}`} value={st.label} readOnly={Boolean(editReason)} onChange={(e) => change({ label: e.target.value })} />
                      <select className="input" aria-label={`Meaning of ${name}`} value={st.meaning} disabled={Boolean(editReason)} onChange={(e) => change({ meaning: e.target.value as StatusInput['meaning'] })}>
                        {MEANINGS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                      <StatusPill kind={st.meaning}>{st.label || 'Preview'}</StatusPill>
                      <Button size="sm" variant="danger" aria-label={`Remove ${name}`} disabledReason={editReason ?? (current.statuses.length === 1 ? 'A type needs at least one status.' : null)}
                        onClick={() => setStatuses(current.statuses.filter((_, j) => j !== i))}>×</Button>
                    </div>
                  );
                })}
                <div>
                  <Button size="sm" disabledReason={editReason} onClick={() => setStatuses([...current.statuses, { key: null, label: '', meaning: 'info' }])}>+ Add status</Button>
                </div>
              </div>
              <p className="muted foot-note">Each status maps to one of five meanings (working, needs attention, fault, informational, inactive). That keeps colours and reports the same across every asset type.</p>
            </section>

            <div className="card savebar" data-dirty={dirty || selectedId === NEW || undefined} style={{ borderRadius: 'var(--radius-lg)' }}>
              <span className="savebar-text muted" role="status" style={{ flexGrow: 1, fontSize: 13 }}>
                {editReason ?? (selectedId === NEW ? 'Not created yet. Name it, give it a tag prefix, then create it.' : dirty ? 'You have unsaved changes. Saving updates the form for every asset of this type.' : 'All changes saved.')}
              </span>
              {error ? (
                <Notice kind="error" action={error.stale ? <Button size="sm" onClick={() => { setDraft(null); setError(null); reload(); }}>Reload</Button> : undefined}>
                  {error.text}
                  {Object.entries(error.fields).filter(([k]) => k !== 'name' && k !== 'tagPrefix' && k !== 'statuses').map(([k, v]) => <div key={k}>{v[0]}</div>)}
                </Notice>
              ) : null}
              <Button onClick={() => { setDraft(null); setError(null); if (selectedId === NEW) setSelectedId(null); }} disabledReason={dirty || selectedId === NEW ? null : 'Nothing to discard.'}>
                {selectedId === NEW ? 'Cancel' : 'Discard'}
              </Button>
              <Button variant="primary" busy={busy} onClick={save} disabledReason={editReason ?? (dirty || selectedId === NEW ? null : 'Nothing to save yet.')}>
                {busy ? 'Saving…' : selectedId === NEW ? 'Create type' : 'Save type'}
              </Button>
            </div>
          </div>

          <aside className="preview" aria-labelledby="preview-title">
            <div className="eyebrow" id="preview-title">Live preview · new {current.name || 'asset'} form</div>
            <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>New {current.name || 'asset'}</div>
              <PreviewField label="Name" required placeholder="e.g. Chiller CH-4" />
              <PreviewField label="Site and location" required placeholder="Choose a site" />
              {current.fields.map((f, i) => (
                <PreviewField key={f.key ?? `p-${i}`} label={f.label || 'Untitled field'} required={f.required}
                  placeholder={f.kind === 'number' ? `0${f.rules.unit ? ` ${f.rules.unit}` : ''}` : f.kind === 'choice' ? (f.rules.options?.join(', ') || 'Pick one') : KIND_LABELS[f.kind]} />
              ))}
            </div>
          </aside>
        </div>
      ) : null}

      {templates ? (
        <TemplateDialog onClose={() => setTemplates(false)} onAdded={(t) => { setTemplates(false); setSelectedId(t.id); setDraft(null); setMessage(`${t.name} was added from the template library. Adjust its fields, or start adding assets.`); reload(); }} />
      ) : null}
    </div>
  );
}

function PreviewField({ label, required, placeholder }: { label: string; required: boolean; placeholder: string }) {
  return (
    <div className="field" aria-hidden="true">
      <span>{label}{required ? <span style={{ color: 'var(--fault)' }}> *</span> : null}</span>
      <div className="input preview-input">{placeholder}</div>
    </div>
  );
}
