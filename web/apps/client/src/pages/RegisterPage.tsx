import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useDebounced, useLoad } from '../../../../shared/hooks';
import { Button, Notice, PlusIcon, StatusPill, UsageMeter } from '../../../../shared/ui';
import type { AssetQuery, FieldDefinition, SortKey } from '../api/assets';
import { useAssetApis } from '../api/context';
import { readOnlyReason, sitesWith, useMe } from '../me';
import { formatDate, formatValue, siteLabel, useLookups } from './assetFormat';

const PAGE_SIZE = 25;

/** Filters live in the address, so Back and shared links keep them. */
function useRegisterQuery() {
  const [params, setParams] = useSearchParams();
  const query: AssetQuery = {
    typeId: params.get('type'),
    siteId: params.get('site'),
    status: params.get('status'),
    search: params.get('q') ?? '',
    includeRetired: params.get('retired') === '1',
    page: Math.max(1, Number(params.get('page') ?? '1') || 1),
    pageSize: PAGE_SIZE,
    sort: (params.get('sort') ?? 'tag') as SortKey,
    order: params.get('order') === 'desc' ? 'desc' : 'asc',
  };
  const update = (patch: Record<string, string | null>, keepPage = false) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    if (!keepPage) next.delete('page');
    setParams(next, { replace: true });
  };
  return { query, update };
}

export function RegisterPage() {
  const { assets, catalog } = useAssetApis();
  const me = useMe();
  const navigate = useNavigate();
  const { query, update } = useRegisterQuery();
  const [search, setSearch] = useState(query.search);
  const debounced = useDebounced(search);
  const effective = { ...query, search: debounced };
  const [page, reload] = useLoad(() => assets.list(effective), [assets, JSON.stringify(effective)]);
  const [types] = useLoad(() => catalog.types(true), [catalog]);
  // Loaded on every visit, so it is fresh after a create or retire elsewhere.
  const [usage] = useLoad(() => assets.usage(), [assets]);
  const limit = usage.data?.limit != null ? usage.data : null;
  const { sites, people } = useLookups();

  const typeList = types.data ?? [];
  const type = typeList.find((t) => t.id === query.typeId) ?? null;
  const writable = sitesWith(me, 'assets.write');
  const canAdd = writable === 'all' || writable.length > 0;
  const activeTypes = typeList.filter((t) => !t.isArchived);
  const newReason = readOnlyReason(me) ?? (usage.data?.state === 'blocked' ? usage.data.blockedReason ?? 'All the assets your plan allows are in use. Retire assets you no longer need, or ask your Owner about a bigger plan.' : null) ?? (!canAdd ? 'You need the assets.write permission at one or more sites to add assets. Ask an Admin.'
    : types.status === 'ready' && activeTypes.length === 0 ? 'Create an asset type first, in Settings › Asset types.' : null);

  const rows = page.data?.items ?? [];
  const columns: FieldDefinition[] = query.typeId ? [...(page.data?.columns ?? [])].sort((x, y) => x.order - y.order).slice(0, 4) : [];
  const total = page.data?.total ?? 0;
  const first = total === 0 ? 0 : (query.page - 1) * PAGE_SIZE + 1;
  const last = Math.min(total, query.page * PAGE_SIZE);
  const filtering = Boolean(query.typeId || query.siteId || query.status || debounced.trim() || query.includeRetired);

  const sortBy = (key: SortKey) => update({ sort: key, order: query.sort === key && query.order === 'asc' ? 'desc' : 'asc' }, true);
  const header = (label: string, key: SortKey) => {
    const on = query.sort === key;
    return (
      <th aria-sort={on ? (query.order === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className="sort" onClick={() => sortBy(key)}>
          {label}<span aria-hidden="true">{on ? (query.order === 'asc' ? ' ↑' : ' ↓') : ''}</span>
        </button>
      </th>
    );
  };

  return (
    <div className="page">
      <div className="page-head">
        <div style={{ flexGrow: 1 }}>
          <h1>Assets</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {type ? `${type.name}: showing the fields defined for this type.` : 'Every asset your roles let you see, across all types and sites.'}
          </p>
        </div>
        {limit && limit.limit !== null ? (
          <div style={{ minWidth: 180 }}>
            <span className="tile-label">Assets on your plan</span>
            <UsageMeter label="Assets" used={limit.used} limit={limit.limit} state={limit.state} />
          </div>
        ) : null}
        <Button variant="primary" disabledReason={newReason} onClick={() => navigate(`/assets/new${query.typeId ? `?type=${query.typeId}` : ''}`)}>
          <PlusIcon /> New asset
        </Button>
      </div>

      <section className="card" aria-label="Asset list">
        <div className="toolbar register-filters">
          <label className="visually-hidden" htmlFor="asset-search">Search by tag or name</label>
          <input id="asset-search" className="input" style={{ maxWidth: 260 }} placeholder="Search by tag or name" value={search}
            onChange={(e) => { setSearch(e.target.value); update({ q: e.target.value }); }} />
          <label className="inline-field">Type
            <select className="input" value={query.typeId ?? ''} onChange={(e) => update({ type: e.target.value, status: null, sort: query.sort.startsWith('field:') ? null : query.sort })}>
              <option value="">All types</option>
              {typeList.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isArchived ? ' (archived)' : ''}</option>)}
            </select>
          </label>
          <label className="inline-field">Site
            <select className="input" value={query.siteId ?? ''} onChange={(e) => update({ site: e.target.value })}>
              <option value="">All sites</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="inline-field" title={type ? undefined : 'Choose a type to filter by its statuses.'}>Status
            <select className="input" value={query.status ?? ''} disabled={!type} aria-describedby={type ? undefined : 'status-why'} onChange={(e) => update({ status: e.target.value })}>
              <option value="">{type ? 'All statuses' : 'Choose a type first'}</option>
              {(type?.statuses ?? []).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          {type ? null : <span id="status-why" className="visually-hidden">Statuses belong to an asset type. Choose a type to filter by status.</span>}
          <label className="check-row" style={{ padding: 0, fontSize: 14 }}>
            <input type="checkbox" checked={query.includeRetired} onChange={(e) => update({ retired: e.target.checked ? '1' : null })} />
            Include retired
          </label>
        </div>

        {page.status === 'error' ? (
          <div style={{ padding: 16 }}>
            <Notice kind="error" action={<Button size="sm" onClick={reload}>Try again</Button>}>Assets didn't load: {page.error.message}</Notice>
          </div>
        ) : null}
        {page.status === 'loading' && rows.length === 0 ? <p className="muted" style={{ padding: 16, margin: 0 }}>Loading assets…</p> : null}
        {page.status === 'ready' && rows.length === 0 ? (
          <div className="empty">
            <strong>{filtering ? 'No assets match' : 'No assets yet'}</strong>
            <span>{filtering ? 'Try another search or filter.' : activeTypes.length === 0 ? 'Create an asset type first, then add your assets.' : 'Add your first asset. Its type decides which fields you fill in.'}</span>
          </div>
        ) : null}

        {rows.length > 0 ? (
          <div className="table-scroll">
            <table className="data" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  {header('Tag', 'tag')}
                  {header('Name', 'name')}
                  {type ? null : <th>Type</th>}
                  {columns.map((c) => <th key={c.key} aria-sort={query.sort === `field:${c.key}` ? (query.order === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className="sort" onClick={() => sortBy(`field:${c.key}`)}>{c.label}<span aria-hidden="true">{query.sort === `field:${c.key}` ? (query.order === 'asc' ? ' ↑' : ' ↓') : ''}</span></button>
                  </th>)}
                  <th>Site · location</th>
                  {header('Status', 'status')}
                  {header('Updated', 'updated')}
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => (
                  <tr key={x.id}>
                    <td><Link className="mono asset-tag" to={`/assets/${x.id}`}>{x.tag}</Link></td>
                    <td><Link className="asset-name" to={`/assets/${x.id}`}>{x.name}</Link></td>
                    {type ? null : <td className="muted">{x.typeName}</td>}
                    {columns.map((c) => <td key={c.key} className={c.kind === 'number' || c.kind === 'date' ? 'mono' : undefined}>{formatValue(c, x.values?.[c.key], people)}</td>)}
                    <td className="muted">{siteLabel(sites, x.siteId, x.location)}</td>
                    <td>
                      {x.retiredAt ? <StatusPill kind="none">Retired</StatusPill> : <StatusPill kind={x.status.meaning}>{x.status.label}</StatusPill>}
                    </td>
                    <td className="mono muted" style={{ whiteSpace: 'nowrap' }}>{formatDate(x.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {total > 0 ? (
          <div className="pager">
            <span className="muted" role="status">{first}–{last} of {total.toLocaleString('en-US')} assets</span>
            <Button size="sm" disabledReason={query.page <= 1 ? 'This is the first page.' : null} onClick={() => update({ page: String(query.page - 1) }, true)}>Previous</Button>
            <Button size="sm" disabledReason={last >= total ? 'This is the last page.' : null} onClick={() => update({ page: String(query.page + 1) }, true)}>Next</Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
