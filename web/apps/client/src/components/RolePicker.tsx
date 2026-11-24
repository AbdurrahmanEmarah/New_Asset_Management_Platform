import type { Role, Site } from '../api/access';
import { useMe } from '../me';
import { SiteChips } from './SiteChips';

export interface RoleChoice { roleIds: string[]; siteIds: string[] }

/** One assignment per chosen role, each with the site choice; the Owner role always gets every site. */
export function toAssignments(choice: RoleChoice, roles: Role[]): { roleId: string; siteIds: string[] }[] {
  return choice.roleIds.map((roleId) => ({ roleId, siteIds: roles.find((r) => r.id === roleId)?.kind === 'owner' ? [] : choice.siteIds }));
}

export const OWNER_ONLY = 'Only an Owner can make someone else an Owner.';

/** Roles (one or more) plus one site choice that applies to each chosen role. */
export function RolePicker({ roles, sites, value, onChange, error }: {
  roles: Role[];
  sites: Site[];
  value: RoleChoice;
  onChange: (next: RoleChoice) => void;
  error?: string | undefined;
}) {
  const me = useMe();
  const toggle = (id: string) =>
    onChange({ ...value, roleIds: value.roleIds.includes(id) ? value.roleIds.filter((r) => r !== id) : [...value.roleIds, id] });

  return (
    <>
      <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}
        aria-describedby={error ? 'role-picker-error' : undefined}>
        <legend style={{ fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 6 }}>Roles<span aria-hidden="true" style={{ color: 'var(--fault)' }}> *</span></legend>
        <div className="check-list">
          {roles.map((r) => {
            const reason = r.kind === 'owner' && !me.isOwner ? OWNER_ONLY : null;
            return (
              <label key={r.id} className="check-row" title={reason ?? undefined}>
                <input type="checkbox" checked={value.roleIds.includes(r.id)} disabled={Boolean(reason)} onChange={() => toggle(r.id)}
                  aria-describedby={reason ? `why-${r.id}` : undefined} />
                <span style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 600 }}>{r.name}</span>
                  <span className="muted" style={{ fontSize: 12.5 }}>{reason ? <span id={`why-${r.id}`}>{reason}</span> : r.description}</span>
                </span>
              </label>
            );
          })}
          {roles.length === 0 ? <span className="muted" style={{ padding: '8px 0' }}>Loading roles…</span> : null}
        </div>
        {error ? <span id="role-picker-error" className="field-error">{error}</span> : null}
      </fieldset>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Sites</span>
        <SiteChips label="Sites these roles apply at" sites={sites.filter((s) => s.isActive || value.siteIds.includes(s.id))} value={value.siteIds}
          onChange={(siteIds) => onChange({ ...value, siteIds })} />
        <span className="field-hint">
          {value.siteIds.length === 0 ? 'Their roles apply at every site.' : 'Their roles apply only at these sites. Assets and work orders elsewhere are hidden from them.'}
          {value.siteIds.length > 0 && roles.some((r) => r.kind === 'owner' && value.roleIds.includes(r.id)) ? ' The Owner role always applies at every site.' : ''}
        </span>
      </div>
    </>
  );
}
