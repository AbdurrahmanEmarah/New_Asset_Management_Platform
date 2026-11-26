import type { FieldDefinition } from '@/api/assets';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** How a field's value reads on the phone. Empty values show as a dash. */
export function formatValue(field: FieldDefinition, value: unknown): string {
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) return '—';
  if (Array.isArray(value)) return value.map((v) => formatValue({ ...field, rules: { ...field.rules, unit: null } }, v)).join(', ');
  if (typeof value === 'object') {
    const o = value as { name?: string; tag?: string; fileName?: string };
    return [o.tag, o.name ?? o.fileName].filter(Boolean).join(' · ') || '—';
  }
  switch (field.kind) {
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value);
      if (Number.isNaN(n)) return String(value);
      const text = field.rules.decimals != null ? n.toFixed(field.rules.decimals) : String(n);
      return field.rules.unit ? `${text} ${field.rules.unit}` : text;
    }
    case 'date': {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
      return m ? `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}` : String(value);
    }
    default:
      return String(value);
  }
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
