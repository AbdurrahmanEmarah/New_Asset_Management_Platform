import { useState, type FormEvent } from 'react';
import { ApiError } from '../../../../shared/api/http';
import { errorText } from '../../../../shared/errors';
import { useLoad } from '../../../../shared/hooks';
import { Button, Dialog, Field, Notice } from '../../../../shared/ui';
import type { AssetType } from '../api/assets';
import { useAssetApis } from '../api/context';

/** "Add from template library": copies a platform template into the company as an editable type. */
export function TemplateDialog({ onClose, onAdded }: { onClose: () => void; onAdded: (t: AssetType) => void }) {
  const { catalog } = useAssetApis();
  const [templates, reload] = useLoad(() => catalog.templates(), [catalog]);
  const [key, setKey] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rows = templates.data ?? [];
  const chosen = rows.find((t) => t.key === key) ?? null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!chosen) {
      setFormError('Choose a template first.');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      onAdded(await catalog.fromTemplate(chosen.key, name.trim() || null, prefix.trim() || null));
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) setErrors({ name: err.field('name'), tagPrefix: err.field('tagPrefix') });
      else setFormError(errorText(err, 'The template could not be added.'));
      setBusy(false);
    }
  }

  return (
    <Dialog title="Add from template library" description="Templates are ready-made types from Inventra. You get your own copy to change; later template updates don't change it." onClose={onClose}>
      <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {formError ? <Notice kind="error">{formError}</Notice> : null}
        {templates.status === 'error' ? <Notice kind="error" action={<Button size="sm" onClick={reload}>Try again</Button>}>Templates didn't load: {templates.error.message}</Notice> : null}
        {templates.status === 'loading' && rows.length === 0 ? <p className="muted" style={{ margin: 0 }}>Loading templates…</p> : null}
        {templates.status === 'ready' && rows.length === 0 ? <p className="muted" style={{ margin: 0 }}>The template library is empty. Build your own type instead.</p> : null}
        {rows.length > 0 ? (
          <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <legend className="visually-hidden">Templates</legend>
            {rows.map((t) => (
              <label key={t.key} className="plan-option">
                <input type="radio" name="template" checked={key === t.key} onChange={() => { setKey(t.key); setName(t.name); setPrefix(t.tagPrefix); setErrors({}); }} />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span><strong>{t.name}</strong> <span className="muted" style={{ fontSize: 13 }}>· {t.category}</span></span>
                  <span className="muted" style={{ fontSize: 13 }}>{t.description}</span>
                  <span className="muted" style={{ fontSize: 12 }}>{t.fields.map((f) => f.label).join(', ') || 'No fields'} · {t.statuses.length} statuses</span>
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}
        {chosen ? (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Field label="Name" error={errors.name} style={{ flex: '2 1 200px' }}><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Tag prefix" error={errors.tagPrefix} style={{ flex: '1 1 120px' }}><input className="input mono" value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} /></Field>
          </div>
        ) : null}
        <div className="dialog-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy} disabledReason={chosen ? null : 'Choose a template first.'}>{busy ? 'Adding…' : 'Add type'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
