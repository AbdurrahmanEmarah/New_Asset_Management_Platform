import { useId } from 'react';
import type { Site } from '../api/access';

interface SiteChipsProps {
  sites: Site[];
  /** Empty means all sites. */
  value: string[];
  onChange: (next: string[]) => void;
  label: string;
  disabledReason?: string | null;
}

/** "All sites" plus one chip per site. Picking a site narrows the scope; picking "All sites" clears it. */
export function SiteChips({ sites, value, onChange, label, disabledReason }: SiteChipsProps) {
  const reasonId = useId();
  const chip = (key: string, text: string, on: boolean, next: () => string[]) => (
    <button
      key={key}
      type="button"
      className="chip"
      aria-pressed={on}
      aria-disabled={disabledReason ? true : undefined}
      aria-describedby={disabledReason ? reasonId : undefined}
      title={disabledReason ?? undefined}
      onClick={() => {
        if (!disabledReason) onChange(next());
      }}
    >
      {text}
    </button>
  );

  return (
    <div role="group" aria-label={label} className="chips">
      {chip('all', 'All sites', value.length === 0, () => [])}
      {sites.map((s) => {
        const on = value.includes(s.id);
        return chip(s.id, s.name, on, () => (on ? value.filter((id) => id !== s.id) : [...value, s.id]));
      })}
      {disabledReason ? <span id={reasonId} className="visually-hidden">{disabledReason}</span> : null}
    </div>
  );
}

export function siteNames(sites: Site[], ids: string[], allSites = ids.length === 0): string {
  if (allSites) return 'All sites';
  return ids.map((id) => sites.find((s) => s.id === id)?.name ?? 'Unknown site').join(', ');
}
