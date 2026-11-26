import { useLoad } from '../../../../shared/hooks';
import type { Site } from '../api/access';
import type { FieldDefinition } from '../api/assets';
import { useApi } from '../api/context';

const day = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const numberFmt = (decimals: number | null | undefined) => new Intl.NumberFormat('en-US', { maximumFractionDigits: decimals ?? 2 });

export function formatDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(d.getTime()) ? iso : day.format(d);
}

/** A field value as text. People are looked up by id; links to assets and files show as such. */
export function formatValue(field: Pick<FieldDefinition, 'kind' | 'rules'> | null, value: unknown, people?: Map<string, string>): string {
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) return '–';
  if (!field) return Array.isArray(value) ? value.join(', ') : String(value);
  switch (field.kind) {
    case 'number':
      return typeof value === 'number' ? `${numberFmt(field.rules.decimals).format(value)}${field.rules.unit ? ` ${field.rules.unit}` : ''}` : String(value);
    case 'date':
      return formatDate(String(value));
    case 'choice':
      return Array.isArray(value) ? value.join(', ') : String(value);
    case 'person':
      return people?.get(String(value)) ?? 'Someone in your company';
    case 'asset':
      return 'Linked asset';
    case 'file':
      return 'Attached document';
    default:
      return String(value);
  }
}

export function siteLabel(sites: Site[], siteId: string | null, location: string): string {
  const site = siteId ? sites.find((s) => s.id === siteId)?.name ?? 'Unknown site' : 'No site';
  return location ? `${site} · ${location}` : site;
}

/** Sites and (when the person may list them) colleagues' names, for showing values. */
export function useLookups() {
  const api = useApi();
  const [sites] = useLoad(() => api.sites(), [api]);
  // Listing users needs users.manage; without it, person fields show a generic label.
  const [people] = useLoad(() => api.listUsers('all', '').catch(() => []), [api]);
  return {
    sites: sites.data ?? [],
    people: new Map((people.data ?? []).map((u) => [u.id, u.name])),
    peopleList: people.data ?? [],
  };
}
