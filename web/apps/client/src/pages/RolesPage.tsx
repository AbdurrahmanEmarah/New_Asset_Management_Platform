import { useState } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../../../../shared/api/http';
import { errorText } from '../../../../shared/errors';
import { useLoad } from '../../../../shared/hooks';
import { Button, Dialog, Field, LockIcon, Notice, PlusIcon } from '../../../../shared/ui';
import { PERMISSIONS, type PermissionArea, type Role, type RoleInput, type Site } from '../api/access';
import { useApi } from '../api/context';
import { siteNames } from '../components/SiteChips';
import { needs, useMe } from '../me';
import { RoleDialog, type RoleDialogMode } from './RoleDialog';

const fromRole = (r: Role): RoleInput => ({ name: r.name, description: r.description, permissions: [...r.permissions] });

function sameSet(a: string[], b: string[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

function isDirty(role: Role, draft: RoleInput) {
  return draft.name !== role.name || draft.description !== role.description || !sameSet(draft.permissions, role.permissions);
}

function kindLabel(r: Role) {
  if (r.kind === 'owner') return 'Built-in · locked';
  return r.kind === 'built_in' ? 'Built-in · editable' : 'Custom';
}

export function RolesPage() {
  const api = useApi();
  const me = useMe();
  const [roles, reloadRoles] = useLoad(() => api.roles(), [api]);
  const [catalog, reloadCatalog] = useLoad(() => Promise.all([api.permissions(), api.sites()]), [api]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ roleId: string; value: RoleInput } | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const [dialog, setDialog] = useState<RoleDialogMode | { kind: 'delete'; role: Role } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<{ text: string; fields: Record<string, string | undefined> } | null>(null);
  const [saving, setSaving] = useState(false);
  // Results of our own saves, shown while the list reloads so the screen doesn't flick back.
  const [overrides, setOverrides] = useState<Record<string, Role>>({});

  const loaded = roles.data ?? [];
  const list = roles.status === 'loading'
    ? [...loaded.map((r) => overrides[r.id] ?? r), ...Object.values(overrides).filter((o) => !loaded.some((r) => r.id === o.id))]
    : loaded;
  const selected = list.find((r) => r.id === selectedId) ?? list[0] ?? null;
  const areas: PermissionArea[] = catalog.data?.[0] ?? [];
  const sites: Site[] = catalog.data?.[1] ?? [];
  const total = areas.reduce((n, a) => n + a.permissions.length, 0);
  const manageReason = needs(me, PERMISSIONS.manageRoles, 'change roles');

  const current = selected ? (draft?.roleId === selected.id ? draft.value : fromRole(selected)) : null;
  const dirty = Boolean(selected && current && draft?.roleId === selected.id && isDirty(selected, current));
  const editReason = selected ? (manageReason ?? selected.cannotEditReason) : null;

  const edit = (change: Partial<RoleInput>) => {
    if (!selected || !current) return;
    setDraft({ roleId: selected.id, value: { ...current, ...change } });
    setMessage(null);
  };

  const pick = (id: string) => {
    if (id === selected?.id) return;
    if (dirty) setPendingSwitch(id);
    else {
      setSelectedId(id);
      setDraft(null);
      setSaveError(null);
    }
  };

  const discard = () => {
    setDraft(null);
    setSaveError(null);
  };

  async function save() {
    if (!selected || !current) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await api.updateRole(selected.id, current);
      setOverrides((o) => ({ ...o, [saved.id]: saved }));
      setDraft(null);
      setMessage(`${saved.name} is saved. Everyone with this role has the new permissions now.`);
      reloadRoles();
    } catch (err) {
      const fields = err instanceof ApiError ? { name: err.field('name'), permissions: err.field('permissions') } : {};
      setSaveError({ text: errorText(err, 'The role could not be saved.'), fields });
    } finally {
      setSaving(false);
    }
  }

  async function remove(role: Role) {
    await api.deleteRole(role.id);
    setDialog(null);
    setSelectedId(null);
    setDraft(null);
    setMessage(`${role.name} was deleted.`);
    reloadRoles();
  }

  const loadError = roles.status === 'error' ? roles.error : catalog.status === 'error' ? catalog.error : null;
  const retry = () => {
    if (roles.status === 'error') reloadRoles();
    if (catalog.status === 'error') reloadCatalog();
  };

  return (
    <div className="page">
      <div className="page-head">
        <div style={{ flexGrow: 1 }}>
          <div className="eyebrow">Settings · Roles &amp; permissions</div>
          <h1>Roles &amp; permissions</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>A role is a set of permissions. Give each person one or more roles, each limited to certain sites for them if needed.</p>
        </div>
        <Button variant="primary" disabledReason={manageReason} onClick={() => setDialog({ kind: 'new' })}><PlusIcon /> New role</Button>
      </div>

      {message ? <Notice kind="ok" action={<Button size="sm" onClick={() => setMessage(null)}>Dismiss</Button>}>{message}</Notice> : null}
      {loadError ? <Notice kind="error" action={<Button size="sm" onClick={retry}>Try again</Button>}>Roles didn't load: {loadError.message}</Notice> : null}

      {(roles.status === 'loading' || catalog.status === 'loading') && !selected ? <p className="muted" style={{ margin: 0 }}>Loading roles…</p> : null}

      {roles.status === 'ready' && list.length === 0 ? (
        <section className="card empty">
          <strong>No roles yet</strong>
          <span>Create a role to decide what people can do. Built-in roles appear here once your workspace is set up.</span>
        </section>
      ) : null}

      {selected && current ? (
        <div className="roles">
          <div className="role-list" role="group" aria-label="Roles">
            {list.map((r) => (
              <button key={r.id} type="button" className="role" aria-pressed={r.id === selected.id} onClick={() => pick(r.id)}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                  <span style={{ fontWeight: 700, fontSize: 14, flexGrow: 1 }}>{r.name}</span>
                  {r.kind === 'owner' ? <LockIcon /> : null}
                  <span className="mono muted" style={{ fontSize: 12 }}>{r.memberCount} {r.memberCount === 1 ? 'person' : 'people'}</span>
                </span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {total > 0 && r.permissions.length >= total ? 'All permissions' : `${r.permissions.length} of ${total || '…'} permissions`}
                </span>
              </button>
            ))}
          </div>

          <section className="card role-editor" aria-labelledby="role-title">
            <div className="role-editor-head">
              <div style={{ flexGrow: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <h2 id="role-title" style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{selected.name}</h2>
                  <span className="tag" style={{ textTransform: 'uppercase' }}>{kindLabel(selected)}</span>
                </div>
                <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>{selected.description}</p>
              </div>
              <Button size="sm" disabledReason={manageReason ?? (dirty ? 'Save or discard your changes first, so the copy matches the saved role.' : null)} onClick={() => setDialog({ kind: 'duplicate', source: selected })}>Duplicate</Button>
              {selected.kind === 'custom' ? (
                <Button size="sm" variant="danger" disabledReason={manageReason ?? selected.cannotDeleteReason} onClick={() => setDialog({ kind: 'delete', role: selected })}>Delete</Button>
              ) : null}
            </div>

            {selected.kind === 'owner' ? (
              <div style={{ margin: '16px 20px 0' }}>
                <Notice kind="warn">The Owner role always has every permission and can't be edited. A company must keep at least one Owner.</Notice>
              </div>
            ) : null}

            {selected.kind === 'custom' ? (
              <div className="role-section" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                <Field label="Role name" required error={saveError?.fields.name} style={{ flex: '1 1 220px' }}>
                  <input className="input" value={current.name} readOnly={Boolean(editReason)} onChange={(e) => edit({ name: e.target.value })} />
                </Field>
                <Field label="Description" style={{ flex: '2 1 300px' }}>
                  <input className="input" value={current.description} readOnly={Boolean(editReason)} onChange={(e) => edit({ description: e.target.value })} />
                </Field>
              </div>
            ) : null}

            <RoleMembers role={selected} sites={sites} />

            <div className="perm-grid">
              {areas.map((area) => (
                <fieldset key={area.key} className="perm-area">
                  <legend className="eyebrow">{area.title}</legend>
                  {area.permissions.map((p) => {
                    const on = selected.kind === 'owner' || current.permissions.includes(p.key);
                    return (
                      <label key={p.key} className="perm" title={editReason ?? undefined}>
                        <input type="checkbox" checked={on} disabled={Boolean(editReason)}
                          onChange={() => edit({ permissions: on ? current.permissions.filter((k) => k !== p.key) : [...current.permissions, p.key] })} />
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                          <span style={{ fontSize: 14, fontWeight: 600 }}>{p.label}</span>
                          <span className="mono muted" style={{ fontSize: 12 }}>{p.key}</span>
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
              ))}
            </div>
            {saveError?.fields.permissions ? <p className="field-error" style={{ margin: '0 20px 12px' }}>{saveError.fields.permissions}</p> : null}

            <div className="savebar" data-dirty={dirty || undefined}>
              <span className="savebar-text muted" style={{ flexGrow: 1, fontSize: 13 }} role="status">
                {editReason
                  ? editReason
                  : dirty
                    ? 'You have unsaved changes. Saving updates everyone with this role and is recorded in the audit log.'
                    : 'All changes saved.'}
              </span>
              {saveError ? <span className="field-error" role="alert" style={{ flexBasis: '100%' }}>{saveError.text}</span> : null}
              <Button onClick={discard} disabledReason={dirty ? null : 'Nothing to discard.'}>Discard</Button>
              <Button variant="primary" busy={saving} onClick={save} disabledReason={editReason ?? (dirty ? null : 'Nothing to save yet. Tick or untick a permission first.')}>
                {saving ? 'Saving…' : 'Save role'}
              </Button>
            </div>
          </section>
        </div>
      ) : null}

      {pendingSwitch && selected ? (
        <Dialog title={`Discard your changes to ${selected.name}?`} description="You changed this role but haven't saved it. Keep editing to save, or discard the changes and open the other role." onClose={() => setPendingSwitch(null)}>
          <div className="dialog-actions">
            <Button onClick={() => setPendingSwitch(null)}>Keep editing</Button>
            <Button variant="danger" onClick={() => { setSelectedId(pendingSwitch); setDraft(null); setSaveError(null); setPendingSwitch(null); }}>Discard changes</Button>
          </div>
        </Dialog>
      ) : null}

      {dialog && dialog.kind !== 'delete' ? (
        <RoleDialog
          mode={dialog}
          onClose={() => setDialog(null)}
          onCreated={(role) => {
            setDialog(null);
            setOverrides((o) => ({ ...o, [role.id]: role }));
            setSelectedId(role.id);
            setDraft(null);
            setMessage(`${role.name} was created. Tick its permissions, then save.`);
            reloadRoles();
          }}
        />
      ) : null}

      {dialog?.kind === 'delete' ? <DeleteRoleDialog role={dialog.role} onClose={() => setDialog(null)} onConfirm={() => remove(dialog.role)} /> : null}
    </div>
  );
}

function DeleteRoleDialog({ role, onClose, onConfirm }: { role: Role; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog title={`Delete ${role.name}?`} description="Nobody has this role, so nobody loses access. This is recorded in the audit log." onClose={onClose}>
      {error ? <Notice kind="error">{error}</Notice> : null}
      <div className="dialog-actions">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="danger" busy={busy} onClick={async () => {
          setBusy(true);
          try {
            await onConfirm();
          } catch (err) {
            setError(errorText(err, 'The role could not be deleted.'));
            setBusy(false);
          }
        }}>{busy ? 'Deleting…' : 'Delete role'}</Button>
      </div>
    </Dialog>
  );
}

/** Who has this role and where it applies for each of them. Sites belong to the person's assignment, not to the role. */
function RoleMembers({ role, sites }: { role: Role; sites: Site[] }) {
  const api = useApi();
  const [members, reload] = useLoad(() => api.listUsers('all', ''), [api]);
  const rows = (members.data ?? []).filter((u) => u.status !== 'deactivated' && u.roles.some((r) => r.id === role.id));
  return (
    <div className="role-section" aria-labelledby="members-title">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h3 id="members-title" style={{ margin: 0, fontSize: 14, fontWeight: 700, flexGrow: 1 }}>Members ({role.memberCount})</h3>
        <Link className="btn btn-sm" to={`/settings/users?role=${encodeURIComponent(role.id)}`}>Manage in Users</Link>
      </div>
      {members.status === 'error' ? <Notice kind="error" action={<Button size="sm" onClick={reload}>Try again</Button>}>Members didn't load: {members.error.message}</Notice> : null}
      {members.status === 'loading' && rows.length === 0 ? <span className="muted" style={{ fontSize: 13 }}>Loading members…</span> : null}
      {members.status === 'ready' && rows.length === 0 ? (
        <span className="muted" style={{ fontSize: 13 }}>Nobody has this role yet. Give it to people from Users, and choose the sites it applies at for each of them.</span>
      ) : null}
      {rows.length > 0 ? (
        <ul className="members">
          {rows.map((u) => {
            const mine = u.roles.find((r) => r.id === role.id);
            return (
              <li key={u.id}>
                <span style={{ fontWeight: 600 }}>{u.name}</span>
                <span className="muted">{siteNames(sites, mine?.siteIds ?? [])}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
      <span className="muted" style={{ fontSize: 13 }}>Sites are chosen per person when the role is given, so the same role can apply at different sites for different people.</span>
    </div>
  );
}
