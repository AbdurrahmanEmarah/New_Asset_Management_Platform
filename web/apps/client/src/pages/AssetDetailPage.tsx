import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { ApiError } from '../../../../shared/api/http';
import { errorText } from '../../../../shared/errors';
import { useLoad } from '../../../../shared/hooks';
import { Button, Dialog, Field, Notice, StatusPill } from '../../../../shared/ui';
import type { Asset } from '../api/assets';
import { useAssetApis } from '../api/context';
import { readOnlyReason, sitesWith, useMe } from '../me';
import { formatDate, formatValue, siteLabel, useLookups } from './assetFormat';
import { writableSites } from './AssetFormPage';
import { AuditTab } from './AuditTab';
import { DocumentsTab } from './DocumentsTab';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'children', label: 'Children' },
  { key: 'documents', label: 'Documents' },
  { key: 'audit', label: 'Audit' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

/** The reason the signed-in person can't do something at the asset's site, or null. */
function scopeReason(scope: 'all' | string[], siteId: string | null, permission: string, what: string): string | null {
  if (scope === 'all' || (siteId && scope.includes(siteId))) return null;
  return `You need the ${permission} permission at this asset's site to ${what}. Ask an Admin.`;
}

export function AssetDetailPage() {
  const { id = '' } = useParams();
  const { assets } = useAssetApis();
  const [asset, reload] = useLoad(() => assets.get(id), [assets, id]);
  const location = useLocation();
  const [flash, setFlash] = useState<string | null>(() => (location.state as { message?: string } | null)?.message ?? null);

  if (asset.status === 'error') {
    return (
      <div className="page">
        <nav aria-label="Breadcrumb" className="crumbs"><Link to="/assets">Assets</Link></nav>
        <Notice kind="error" action={<Button size="sm" onClick={reload}>Try again</Button>}>This asset didn't load: {asset.error.message}</Notice>
      </div>
    );
  }
  if (!asset.data) return <div className="page"><p className="muted" style={{ margin: 0 }}>Loading the asset…</p></div>;
  return <Detail key={asset.data.id} asset={asset.data} flash={flash} setFlash={setFlash} reload={reload} />;
}

function Detail({ asset, flash, setFlash, reload }: { asset: Asset; flash: string | null; setFlash: (m: string | null) => void; reload: () => void }) {
  const me = useMe();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'overview') as TabKey;
  const [dialog, setDialog] = useState<'move' | 'retire' | null>(null);
  const { sites, people } = useLookups();

  const readOnly = readOnlyReason(me);
  const editReason = readOnly ?? asset.cannotEditReason ?? scopeReason(sitesWith(me, 'assets.write'), asset.siteId, 'assets.write', 'change it');
  const moveReason = readOnly ?? asset.cannotMoveReason ?? scopeReason(sitesWith(me, 'assets.transfer'), asset.siteId, 'assets.transfer', 'move it');
  const retireReason = readOnly ?? asset.cannotRetireReason ?? scopeReason(sitesWith(me, 'assets.dispose'), asset.siteId, 'assets.dispose', 'retire it');
  const site = sites.find((s) => s.id === asset.siteId)?.name;
  const fields = [...asset.fields].sort((x, y) => x.order - y.order);
  const others = Object.entries(asset.otherValues);

  const done = (message: string) => {
    setDialog(null);
    setFlash(message);
    reload();
  };

  return (
    <div className="page">
      <nav aria-label="Breadcrumb" className="crumbs">
        <Link to="/assets">Assets</Link>
        {site ? <><span aria-hidden="true">/</span><span>{site}</span></> : null}
        {asset.location ? <><span aria-hidden="true">/</span><span>{asset.location}</span></> : null}
        <span aria-hidden="true">/</span><span aria-current="page">{asset.name}</span>
      </nav>
      <div className="page-head">
        <div style={{ flexGrow: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="mono asset-tag">{asset.tag}</span>
            {asset.retiredAt ? <StatusPill kind="none">Retired</StatusPill> : <StatusPill kind={asset.status.meaning}>{asset.status.label}</StatusPill>}
            <StatusPill kind="none">{asset.typeName}</StatusPill>
          </div>
          <h1>{asset.name}</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>{siteLabel(sites, asset.siteId, asset.location)}{asset.parent ? ` · part of ${asset.parent.tag}` : ''}</p>
        </div>
        <Button disabledReason={editReason} onClick={() => navigate(`/assets/${asset.id}/edit`)}>Edit</Button>
        <Button disabledReason={moveReason} onClick={() => setDialog('move')}>Move</Button>
        <Button variant="danger" disabledReason={retireReason} onClick={() => setDialog('retire')}>Retire</Button>
      </div>

      {flash ? <Notice kind="ok" action={<Button size="sm" onClick={() => setFlash(null)}>Dismiss</Button>}>{flash}</Notice> : null}
      {asset.retiredAt ? <Notice kind="info">Retired on {formatDate(asset.retiredAt)}{asset.retiredReason ? `: ${asset.retiredReason}` : '.'} Its history and documents are kept.</Notice> : null}

      <div role="tablist" aria-label="Asset sections" className="tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" id={`tab-${t.key}`} aria-selected={tab === t.key} aria-controls={`panel-${t.key}`} className="tab"
            onClick={() => setParams(t.key === 'overview' ? {} : { tab: t.key }, { replace: true })}>
            {t.label}{t.key === 'children' && asset.childCount > 0 ? ` (${asset.childCount})` : ''}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'overview' ? (
          <div className="overview">
            <section className="card" aria-labelledby="details-title">
              <div className="toolbar"><h2 id="details-title" className="card-title">{asset.typeName} details</h2></div>
              {fields.length === 0 ? <p className="muted" style={{ margin: 0, padding: 16 }}>This type has no fields of its own yet.</p> : (
                <dl className="kv-list">
                  {fields.map((f) => (
                    <div key={f.key} className="kv">
                      <dt>{f.label}</dt>
                      <dd className={f.kind === 'number' || f.kind === 'date' ? 'mono' : undefined}>
                        {f.kind === 'asset' && asset.values[f.key] ? <Link to={`/assets/${String(asset.values[f.key])}`}>Open linked asset</Link> : formatValue(f, asset.values[f.key], people)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
            <section className="card" aria-labelledby="general-title">
              <div className="toolbar"><h2 id="general-title" className="card-title">General</h2></div>
              <dl className="kv-list">
                <div className="kv"><dt>Tag</dt><dd className="mono">{asset.tag}</dd></div>
                <div className="kv"><dt>Type</dt><dd>{asset.typeName}</dd></div>
                <div className="kv"><dt>Site and location</dt><dd>{siteLabel(sites, asset.siteId, asset.location)}</dd></div>
                <div className="kv"><dt>Part of</dt><dd>{asset.parent ? <Link to={`/assets/${asset.parent.id}`}><span className="mono">{asset.parent.tag}</span> {asset.parent.name}</Link> : '–'}</dd></div>
                <div className="kv"><dt>Added</dt><dd className="mono">{formatDate(asset.createdAt)}</dd></div>
                <div className="kv"><dt>Last changed</dt><dd className="mono">{formatDate(asset.updatedAt)}</dd></div>
              </dl>
            </section>
            {others.length > 0 ? (
              <section className="card" aria-labelledby="other-title">
                <div className="toolbar"><h2 id="other-title" className="card-title">Other values</h2></div>
                <p className="muted" style={{ margin: 0, padding: '12px 16px 0', fontSize: 13 }}>From fields the type no longer has. They're kept, read-only, so nothing is lost.</p>
                <dl className="kv-list">
                  {others.map(([k, v]) => <div key={k} className="kv"><dt className="mono">{k}</dt><dd>{formatValue(null, v)}</dd></div>)}
                </dl>
              </section>
            ) : null}
          </div>
        ) : null}
        {tab === 'children' ? <ChildrenTab asset={asset} /> : null}
        {tab === 'documents' ? <DocumentsTab asset={asset} uploadReason={editReason} /> : null}
        {tab === 'audit' ? <AuditTab subjectId={asset.id} /> : null}
      </div>

      {dialog === 'move' ? <MoveDialog asset={asset} onClose={() => setDialog(null)} onDone={(a) => done(`${a.tag} moved to ${siteLabel(sites, a.siteId, a.location)}.`)} /> : null}
      {dialog === 'retire' ? <RetireDialog asset={asset} onClose={() => setDialog(null)} onDone={(a) => done(`${a.tag} is retired.`)} /> : null}
    </div>
  );
}

function ChildrenTab({ asset }: { asset: Asset }) {
  const { assets } = useAssetApis();
  const [children, reload] = useLoad(() => assets.children(asset.id), [assets, asset.id]);
  const { sites } = useLookups();
  const rows = children.data ?? [];
  return (
    <section className="card" aria-label="Children">
      {children.status === 'error' ? <div style={{ padding: 16 }}><Notice kind="error" action={<Button size="sm" onClick={reload}>Try again</Button>}>Children didn't load: {children.error.message}</Notice></div> : null}
      {children.status === 'loading' && rows.length === 0 ? <p className="muted" style={{ padding: 16, margin: 0 }}>Loading…</p> : null}
      {children.status === 'ready' && rows.length === 0 ? (
        <div className="empty"><strong>Nothing is part of {asset.name}</strong><span>To add one, edit the other asset and choose {asset.tag} under "Part of".</span></div>
      ) : null}
      {rows.length > 0 ? (
        <div className="table-scroll">
          <table className="data" style={{ minWidth: 640 }}>
            <thead><tr><th>Tag</th><th>Name</th><th>Type</th><th>Site · location</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td><Link className="mono asset-tag" to={`/assets/${c.id}`}>{c.tag}</Link></td>
                  <td><Link className="asset-name" to={`/assets/${c.id}`}>{c.name}</Link></td>
                  <td className="muted">{c.typeName}</td>
                  <td className="muted">{siteLabel(sites, c.siteId, c.location)}</td>
                  <td>{c.retiredAt ? <StatusPill kind="none">Retired</StatusPill> : <StatusPill kind={c.status.meaning}>{c.status.label}</StatusPill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function MoveDialog({ asset, onClose, onDone }: { asset: Asset; onClose: () => void; onDone: (a: Asset) => void }) {
  const { assets } = useAssetApis();
  const me = useMe();
  const { sites } = useLookups();
  const choices = writableSites(sites, sitesWith(me, 'assets.transfer')).filter((s) => s.id !== asset.siteId);
  const [siteId, setSiteId] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!siteId) {
      setError('Choose the site it moves to.');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      onDone(await assets.move(asset.id, siteId, location));
    } catch (err) {
      if (err instanceof ApiError && err.field('siteId')) setError(err.field('siteId'));
      else setFormError(errorText(err, 'The asset could not be moved.'));
      setBusy(false);
    }
  }

  return (
    <Dialog title={`Move ${asset.tag}`} description="Moving changes which site the asset belongs to. It needs Transfer between sites at both sites, and is recorded in the audit log." onClose={onClose}>
      <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {formError ? <Notice kind="error">{formError}</Notice> : null}
        <Field label="New site" required error={error} hint={choices.length === 0 ? 'None of your roles lets you move assets to another site.' : undefined}>
          <select className="input" value={siteId} onChange={(e) => { setSiteId(e.target.value); setError(undefined); }}>
            <option value="">Choose a site</option>
            {choices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Location on that site" hint="Optional, e.g. Bay 3."><input className="input" value={location} onChange={(e) => setLocation(e.target.value)} /></Field>
        <div className="dialog-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy}>{busy ? 'Moving…' : 'Move asset'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function RetireDialog({ asset, onClose, onDone }: { asset: Asset; onClose: () => void; onDone: (a: Asset) => void }) {
  const { assets } = useAssetApis();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 3) {
      setError('Say why it is retired, e.g. "Replaced by CH-4" or "Sold".');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      onDone(await assets.retire(asset.id, reason.trim()));
    } catch (err) {
      if (err instanceof ApiError && err.field('reason')) setError(err.field('reason'));
      else setFormError(errorText(err, 'The asset could not be retired.'));
      setBusy(false);
    }
  }

  return (
    <Dialog title={`Retire ${asset.tag}?`} description="It leaves the register (you can still find it with Include retired) and can't be changed any more. Its history and documents are kept." onClose={onClose}>
      <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {formError ? <Notice kind="error">{formError}</Notice> : null}
        <Field label="Reason" required error={error}>
          <textarea className="input" rows={3} value={reason} onChange={(e) => { setReason(e.target.value); setError(undefined); }} placeholder="e.g. Replaced by CH-4" />
        </Field>
        <div className="dialog-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="danger" busy={busy}>{busy ? 'Retiring…' : 'Retire asset'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
