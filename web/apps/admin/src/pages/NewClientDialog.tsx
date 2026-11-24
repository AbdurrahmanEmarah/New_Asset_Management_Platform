import { useState, type FormEvent } from 'react';
import { ApiError } from '../../../../shared/api/http';
import { useLoad } from '../../../../shared/hooks';
import { Button, Dialog, Field, Notice } from '../../../../shared/ui';
import { useApi } from '../api/context';
import type { Client, NewClient } from '../api/tenancy';
import { emailProblem, slugFromName, slugProblem } from '../slug';

type Errors = Partial<Record<keyof NewClient, string>>;

export function validate(form: NewClient): Errors {
  const errors: Errors = {};
  if (!form.name.trim()) errors.name = 'Company name is required.';
  const slug = slugProblem(form.slug);
  if (slug) errors.slug = slug;
  if (!form.region) errors.region = "Choose where this client's data is stored.";
  if (!form.planKey) errors.planKey = 'Choose a plan.';
  if (!form.ownerName.trim()) errors.ownerName = "Owner's name is required.";
  const email = emailProblem(form.ownerEmail);
  if (email) errors.ownerEmail = email;
  return errors;
}

export function NewClientDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (client: Client) => void }) {
  const api = useApi();
  const [options] = useLoad(() => Promise.all([api.plans(), api.regions()]), [api]);
  const [form, setForm] = useState<NewClient>({ name: '', slug: '', region: '', planKey: 'trial', ownerName: '', ownerEmail: '' });
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const plans = options.data?.[0] ?? [];
  const regions = options.data?.[1] ?? [];

  const set = <K extends keyof NewClient>(key: K, value: NewClient[K]) => {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === 'name' && !slugTouched) next.slug = slugFromName(String(value));
      return next;
    });
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      onCreated(await api.createClient({ ...form, name: form.name.trim(), ownerName: form.ownerName.trim(), ownerEmail: form.ownerEmail.trim() }));
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length > 0) {
        setErrors(Object.fromEntries(Object.entries(err.fieldErrors).map(([k, v]) => [k, v[0]])) as Errors);
      } else {
        setFormError(err instanceof Error ? err.message : 'The client could not be created.');
      }
    } finally {
      setBusy(false);
    }
  }

  const selectedPlan = plans.find((p) => p.key === form.planKey);

  return (
    <Dialog title="New client" description="Creates the company's workspace and records its first Owner." onClose={onClose}>
      <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {options.status === 'error' ? <Notice kind="error">Plans and regions didn't load: {options.error.message}</Notice> : null}
        {formError ? <Notice kind="error">{formError}</Notice> : null}

        <Field label="Company name" required error={errors.name}>
          <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Gulf Facilities Co." autoComplete="organization" />
        </Field>

        <Field label="Sub-domain" required error={errors.slug} hint={form.slug ? `Their address: ${form.slug}.inventra.app. It can't be changed later.` : "Their web address. It can't be changed later."}>
          <input
            className="input mono"
            value={form.slug}
            onChange={(e) => {
              setSlugTouched(true);
              set('slug', e.target.value.toLowerCase());
            }}
            placeholder="gulf-fm"
            spellCheck={false}
            autoCapitalize="off"
          />
        </Field>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Field label="Data region" required error={errors.region} style={{ flex: '1 1 180px' }}>
            <select className="input" value={form.region} onChange={(e) => set('region', e.target.value)}>
              <option value="">Choose…</option>
              {regions.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
            </select>
          </Field>
          <Field label="Plan" required error={errors.planKey} style={{ flex: '1 1 180px' }}
            hint={selectedPlan ? `${selectedPlan.maxUsers} users · ${selectedPlan.maxAssets.toLocaleString('en-US')} assets${selectedPlan.isTrial ? ' · 14 days' : ''}` : undefined}>
            <select className="input" value={form.planKey} onChange={(e) => set('planKey', e.target.value)}>
              {plans.length === 0 ? <option value={form.planKey}>Loading plans…</option> : null}
              {plans.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select>
          </Field>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Field label="Owner's name" required error={errors.ownerName} style={{ flex: '1 1 180px' }}>
            <input className="input" value={form.ownerName} onChange={(e) => set('ownerName', e.target.value)} autoComplete="name" />
          </Field>
          <Field label="Owner's email" required error={errors.ownerEmail} style={{ flex: '1 1 220px' }}>
            <input className="input" type="email" value={form.ownerEmail} onChange={(e) => set('ownerEmail', e.target.value)} autoComplete="email" />
          </Field>
        </div>

        <Notice kind="info">The owner invitation email is sent once the Access service is added in the next release. Until then the owner is recorded here.</Notice>

        <div className="dialog-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy}>{busy ? 'Creating…' : 'Create client'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
