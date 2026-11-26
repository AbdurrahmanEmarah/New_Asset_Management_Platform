import { Field } from '../ui';
import type { FieldInput, FieldRules } from './types';

const num = (v: string): number | null => (v.trim() === '' || Number.isNaN(Number(v)) ? null : Number(v));
const str = (v: number | null | undefined) => (v == null ? '' : String(v));

/** One line under the field label, e.g. "Unit: kW · 0 to 500". */
export function rulesSummary(f: FieldInput): string {
  const r = f.rules;
  const parts: string[] = [];
  if (f.kind === 'number') {
    if (r.unit) parts.push(`Unit: ${r.unit}`);
    if (r.min != null || r.max != null) parts.push(`${r.min ?? '…'} to ${r.max ?? '…'}`);
  }
  if (f.kind === 'choice' && r.options?.length) parts.push(`${r.options.join(', ')}${r.multiple ? ' (several)' : ''}`);
  if (f.kind === 'text' && r.maxLength) parts.push(`Up to ${r.maxLength} characters`);
  if (f.kind === 'text' && r.pattern) parts.push('Format checked');
  if (f.kind === 'date' && r.notInFuture) parts.push('Not in the future');
  return parts.join(' · ');
}

/** The rules that fit the field's kind. Person, asset and file fields have none. */
export function FieldRulesEditor({ field, readOnly, onChange }: { field: FieldInput; readOnly: boolean; onChange: (rules: FieldRules) => void }) {
  const r = field.rules;
  const set = (patch: Partial<FieldRules>) => onChange({ ...r, ...patch });
  const box = (content: React.ReactNode) => <div className="rules" role="group" aria-label={`Rules for ${field.label || 'this field'}`}>{content}</div>;

  switch (field.kind) {
    case 'text':
      return box(
        <>
          <Field label="Shortest" style={{ flex: '1 1 110px' }}><input className="input" inputMode="numeric" readOnly={readOnly} value={str(r.minLength)} onChange={(e) => set({ minLength: num(e.target.value) })} /></Field>
          <Field label="Longest" style={{ flex: '1 1 110px' }}><input className="input" inputMode="numeric" readOnly={readOnly} value={str(r.maxLength)} onChange={(e) => set({ maxLength: num(e.target.value) })} /></Field>
          <Field label="Format (regular expression)" hint="Optional, e.g. ^[A-Z]{3} [0-9]+$" style={{ flex: '2 1 220px' }}>
            <input className="input mono" readOnly={readOnly} value={r.pattern ?? ''} onChange={(e) => set({ pattern: e.target.value || null })} />
          </Field>
          <Field label="Message when the format is wrong" style={{ flex: '2 1 220px' }}>
            <input className="input" readOnly={readOnly} value={r.patternHint ?? ''} placeholder="e.g. Use the plate as printed, e.g. DXB 4471." onChange={(e) => set({ patternHint: e.target.value || null })} />
          </Field>
        </>,
      );
    case 'number':
      return box(
        <>
          <Field label="Unit" style={{ flex: '1 1 110px' }}><input className="input" readOnly={readOnly} value={r.unit ?? ''} placeholder="e.g. kW" onChange={(e) => set({ unit: e.target.value || null })} /></Field>
          <Field label="Lowest" style={{ flex: '1 1 110px' }}><input className="input" inputMode="decimal" readOnly={readOnly} value={str(r.min)} onChange={(e) => set({ min: num(e.target.value) })} /></Field>
          <Field label="Highest" style={{ flex: '1 1 110px' }}><input className="input" inputMode="decimal" readOnly={readOnly} value={str(r.max)} onChange={(e) => set({ max: num(e.target.value) })} /></Field>
          <Field label="Decimal places" style={{ flex: '1 1 110px' }}><input className="input" inputMode="numeric" readOnly={readOnly} value={str(r.decimals)} onChange={(e) => set({ decimals: num(e.target.value) })} /></Field>
        </>,
      );
    case 'choice':
      return box(
        <>
          <Field label="Options, one per line" hint="People pick from these." style={{ flex: '2 1 260px' }}>
            <textarea className="input" rows={4} readOnly={readOnly} value={(r.options ?? []).join('\n')}
              onChange={(e) => set({ options: e.target.value.split('\n').map((o) => o.trimStart()) })}
              onBlur={() => set({ options: (r.options ?? []).map((o) => o.trim()).filter(Boolean) })} />
          </Field>
          <label className="check-row" style={{ flex: '1 1 200px' }}>
            <input type="checkbox" disabled={readOnly} checked={Boolean(r.multiple)} onChange={(e) => set({ multiple: e.target.checked })} />
            Allow several choices
          </label>
        </>,
      );
    case 'date':
      return box(
        <label className="check-row">
          <input type="checkbox" disabled={readOnly} checked={Boolean(r.notInFuture)} onChange={(e) => set({ notInFuture: e.target.checked })} />
          Can't be in the future (e.g. a purchase or inspection date)
        </label>,
      );
    default:
      return box(<p className="muted" style={{ margin: 0, fontSize: 13 }}>{field.kind === 'person' ? 'People pick someone from your company.' : field.kind === 'asset' ? 'People pick another asset.' : 'People attach a document from the asset\'s Documents.'} There are no other rules.</p>);
  }
}
