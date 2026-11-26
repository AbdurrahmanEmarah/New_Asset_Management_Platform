/** Asset-type building blocks shared by the client app (asset types) and the admin console (template library). */

export type FieldKind = 'text' | 'number' | 'date' | 'choice' | 'person' | 'asset' | 'file';
/** Each status maps to one meaning, which sets its colour and shape everywhere. */
export type StatusMeaning = 'ok' | 'warn' | 'fault' | 'info' | 'none';

export interface FieldRules {
  minLength?: number | null;
  maxLength?: number | null;
  pattern?: string | null;
  patternHint?: string | null;
  min?: number | null;
  max?: number | null;
  decimals?: number | null;
  unit?: string | null;
  options?: string[];
  multiple?: boolean;
  notInFuture?: boolean;
}

export interface FieldDefinition { key: string; label: string; kind: FieldKind; required: boolean; order: number; rules: FieldRules }
export interface StatusDefinition { key: string; label: string; meaning: StatusMeaning; order: number }

/** Leave key null for a new field or status: the server makes it from the label. Keep existing keys. */
export interface FieldInput { key: string | null; label: string; kind: FieldKind; required: boolean; rules: FieldRules }
export interface StatusInput { key: string | null; label: string; meaning: StatusMeaning }

export interface Template {
  key: string;
  name: string;
  description: string;
  category: string;
  tagPrefix: string;
  iconKey: string;
  fields: FieldDefinition[];
  statuses: StatusDefinition[];
  updatedAt: string;
}

export const KIND_LABELS: Record<FieldKind, string> = {
  text: 'Text',
  number: 'Number with unit',
  date: 'Date',
  choice: 'Choice list',
  person: 'Person',
  asset: 'Link to another asset',
  file: 'File or photo',
};

export const MEANINGS: { value: StatusMeaning; label: string; hint: string }[] = [
  { value: 'ok', label: 'Working', hint: 'In service, in use' },
  { value: 'warn', label: 'Needs attention', hint: 'Service due, inspection due' },
  { value: 'fault', label: 'Fault', hint: 'Broken, failed inspection' },
  { value: 'info', label: 'Informational', hint: 'Assigned, under repair' },
  { value: 'none', label: 'Inactive', hint: 'In stock, retired, sold' },
];

