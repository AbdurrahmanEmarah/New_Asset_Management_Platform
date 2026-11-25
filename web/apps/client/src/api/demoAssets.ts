/**
 * In-memory Catalog, Assets and Documents with the rules the services enforce, shaped like the
 * contracts. Used by the tests and by `npm run dev:client:demo`. Data matches the Register,
 * AssetDetail and TypeBuilder mockups; site ids match demo.ts.
 */
import { ApiError } from '../../../../shared/api/http';
import type {
  Asset, AssetApis, AssetQuery, AssetSummary, AssetType, AssetTypeInput, DocumentFile, FieldDefinition, FieldInput, FieldValues,
  StatusDefinition, Template,
} from './assets';
import { UPLOAD_MAX_BYTES, UPLOAD_TYPES } from './assets';

const invalid = (errors: Record<string, string[]>) => new ApiError(400, 'Fix the highlighted fields and try again.', errors);
const clone = <T,>(v: T): T => structuredClone(v);
const slug = (label: string) => label.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'field';

const f = (key: string, label: string, kind: FieldDefinition['kind'], required: boolean, order: number, rules: FieldDefinition['rules'] = {}): FieldDefinition =>
  ({ key, label, kind, required, order, rules });
const s = (key: string, label: string, meaning: StatusDefinition['meaning'], order: number): StatusDefinition => ({ key, label, meaning, order });

const HVAC_STATUSES = [s('in_service', 'In service', 'ok', 0), s('service_due', 'Service due', 'warn', 1), s('fault', 'Fault reported', 'fault', 2), s('repair', 'Under repair', 'info', 3), s('retired', 'Retired', 'none', 4)];

const TYPE_SEEDS: AssetType[] = [
  { id: 't-hvac', name: 'HVAC unit', tagPrefix: 'HVAC', iconKey: 'hvac', version: 3, templateKey: 'hvac', isArchived: false, updatedAt: '2026-11-20T09:00:00Z', statuses: HVAC_STATUSES,
    fields: [
      f('manufacturer', 'Manufacturer', 'choice', true, 0, { options: ['Carrier', 'Daikin', 'Trane'] }),
      f('model', 'Model', 'text', true, 1, { maxLength: 60 }),
      f('serial_no', 'Serial no.', 'text', true, 2, { maxLength: 40 }),
      f('capacity', 'Cooling capacity', 'number', true, 3, { unit: 'kW', min: 0, decimals: 1 }),
      f('refrigerant', 'Refrigerant', 'choice', false, 4, { options: ['R-134a', 'R-410A', 'R-32'] }),
      f('warranty_ends', 'Warranty ends', 'date', false, 5),
    ] },
  { id: 't-veh', name: 'Vehicle', tagPrefix: 'VEH', iconKey: 'vehicle', version: 1, templateKey: null, isArchived: false, updatedAt: '2026-11-18T09:00:00Z',
    statuses: [s('in_use', 'In use', 'ok', 0), s('service_due', 'Service due', 'warn', 1), s('off_road', 'Off road', 'fault', 2), s('sold', 'Sold', 'none', 3)],
    fields: [
      f('plate', 'Plate', 'text', true, 0, { maxLength: 12, pattern: '^[A-Z]{3} [0-9]{1,5}$', patternHint: 'Use the plate as printed, e.g. DXB 4471.' }),
      f('odometer', 'Odometer', 'number', true, 1, { unit: 'km', min: 0, decimals: 0 }),
      f('fuel', 'Fuel', 'choice', false, 2, { options: ['Diesel', 'Petrol', 'Electric'] }),
      f('driver', 'Driver', 'person', false, 3),
      f('registration_expiry', 'Registration expiry', 'date', true, 4),
    ] },
  { id: 't-it', name: 'IT equipment', tagPrefix: 'IT', iconKey: 'laptop', version: 1, templateKey: null, isArchived: true, updatedAt: '2026-11-01T09:00:00Z',
    statuses: [s('in_stock', 'In stock', 'none', 0), s('assigned', 'Assigned', 'info', 1), s('faulty', 'Faulty', 'fault', 2)],
    fields: [f('serial_no', 'Serial no.', 'text', true, 0), f('purchased', 'Purchased', 'date', false, 1, { notInFuture: true })] },
];

const TEMPLATE_SEEDS: Template[] = [
  { key: 'fire', name: 'Fire safety equipment', description: 'Extinguishers, pumps and valves with inspection dates and certificates.', category: 'Safety', tagPrefix: 'FS', iconKey: 'fire', updatedAt: '2026-10-01T09:00:00Z',
    statuses: [s('compliant', 'Compliant', 'ok', 0), s('inspection_due', 'Inspection due', 'warn', 1), s('failed', 'Failed inspection', 'fault', 2), s('removed', 'Removed', 'none', 3)],
    fields: [f('zone', 'Zone', 'choice', true, 0, { options: ['Zone A', 'Zone B'] }), f('last_inspection', 'Last inspection', 'date', true, 1, { notInFuture: true }), f('certificate', 'Certificate', 'file', false, 2)] },
  { key: 'generator', name: 'Generator', description: 'Standby generators with running hours and fuel.', category: 'Power', tagPrefix: 'GEN', iconKey: 'power', updatedAt: '2026-10-01T09:00:00Z',
    statuses: [s('standby', 'Standby', 'ok', 0), s('running', 'Running', 'info', 1), s('fault', 'Fault', 'fault', 2)],
    fields: [f('rating', 'Rating', 'number', true, 0, { unit: 'kVA', min: 1 }), f('hours', 'Running hours', 'number', false, 1, { unit: 'h', min: 0 })] },
];

interface StoredAsset {
  id: string; tag: string; name: string; typeId: string; statusKey: string; siteId: string | null; location: string; parentId: string | null;
  values: FieldValues; createdAt: string; updatedAt: string; retiredAt: string | null; retiredReason: string | null;
}

const a = (id: string, tag: string, name: string, typeId: string, statusKey: string, siteId: string, location: string, values: FieldValues, parentId: string | null = null): StoredAsset =>
  ({ id, tag, name, typeId, statusKey, siteId, location, parentId, values, createdAt: '2026-10-10T09:00:00Z', updatedAt: '2026-11-20T09:00:00Z', retiredAt: null, retiredReason: null });

const ASSET_SEEDS: StoredAsset[] = [
  a('a1', 'HVAC-000417', 'Chiller CH-2', 't-hvac', 'in_service', 'tower-b', 'Roof', { manufacturer: 'Carrier', model: '30XA-350', serial_no: 'C350-2291', capacity: 350, refrigerant: 'R-134a', warranty_ends: '2027-06-30', legacy_code: 'CH2-OLD' }),
  a('a2', 'HVAC-000418', 'Chiller CH-3', 't-hvac', 'service_due', 'tower-b', 'Roof', { manufacturer: 'Carrier', model: '30XA-350', serial_no: 'C350-2292', capacity: 350, refrigerant: 'R-134a' }),
  a('a3', 'HVAC-000502', 'AHU-04 Lobby', 't-hvac', 'in_service', 'hq', 'Level 1 plant room', { manufacturer: 'Daikin', model: 'AHU-45', serial_no: 'D45-0004', capacity: 45 }),
  a('a4', 'HVAC-000419', 'Compressor A', 't-hvac', 'in_service', 'tower-b', 'Roof', { manufacturer: 'Carrier', model: 'Comp-A', serial_no: 'CA-1', capacity: 175 }, 'a1'),
  a('a5', 'VEH-000112', 'Fleet van V-112', 't-veh', 'service_due', 'north', 'Bay 3', { plate: 'DXB 4471', odometer: 84210, fuel: 'Diesel', registration_expiry: '2027-02-01' }),
  a('a6', 'VEH-000007', 'Pickup P-07', 't-veh', 'in_use', 'north', 'Bay 1', { plate: 'DXB 1903', odometer: 31550, fuel: 'Petrol', registration_expiry: '2027-05-01' }),
  a('a7', 'IT-000341', 'Laptop LT-3341', 't-it', 'assigned', 'hq', 'Floor 3', { serial_no: '5CG3341XQ' }),
];

const DOC_SEEDS: DocumentFile[] = [
  { id: 'd1', assetId: 'a1', fileName: 'Commissioning report.pdf', contentType: 'application/pdf', sizeBytes: 2_400_000, uploadedByName: 'Omar Fathi', uploadedAt: '2026-10-12T09:00:00Z' },
  { id: 'd2', assetId: 'a1', fileName: 'Nameplate.jpg', contentType: 'image/jpeg', sizeBytes: 840_000, uploadedByName: 'Yusuf Rahman', uploadedAt: '2026-11-02T09:00:00Z' },
];

export interface DemoAssetOptions {
  maxAssets?: number;
  storageLimitBytes?: number;
  now?: () => Date;
}

export function createDemoAssetApis(options: DemoAssetOptions = {}): AssetApis {
  const now = options.now ?? (() => new Date());
  const maxAssets = options.maxAssets ?? 2000;
  const storageLimit = options.storageLimitBytes ?? 20 * 1024 ** 3;
  let types: AssetType[] = clone(TYPE_SEEDS);
  let assets: StoredAsset[] = clone(ASSET_SEEDS);
  let docs: DocumentFile[] = clone(DOC_SEEDS);
  const counters = new Map<string, number>([['t-hvac', 503], ['t-veh', 113], ['t-it', 342]]);
  let nextId = 1;

  const findType = (id: string) => {
    const t = types.find((x) => x.id === id);
    if (!t) throw new ApiError(404, 'No asset type has this id.');
    return t;
  };
  const findAsset = (id: string) => {
    const x = assets.find((y) => y.id === id);
    if (!x) throw new ApiError(404, 'No asset has this id.');
    return x;
  };
  const statusOf = (t: AssetType, key: string) => {
    const st = t.statuses.find((x) => x.key === key) ?? t.statuses[0]!;
    return { key: st.key, label: st.label, meaning: st.meaning };
  };
  const activeChildren = (id: string) => assets.filter((x) => x.parentId === id && !x.retiredAt).length;

  const toSummary = (x: StoredAsset, withValues: boolean): AssetSummary => {
    const t = findType(x.typeId);
    return {
      id: x.id, tag: x.tag, name: x.name, typeId: x.typeId, typeName: t.name, status: statusOf(t, x.statusKey), siteId: x.siteId, location: x.location,
      parentId: x.parentId, values: withValues ? clone(x.values) : null, updatedAt: x.updatedAt, retiredAt: x.retiredAt,
    };
  };

  const toAsset = (x: StoredAsset): Asset => {
    const t = findType(x.typeId);
    const keys = new Set(t.fields.map((fd) => fd.key));
    const values: FieldValues = {};
    const otherValues: FieldValues = {};
    for (const [k, v] of Object.entries(x.values)) (keys.has(k) ? values : otherValues)[k] = v;
    const parent = x.parentId ? assets.find((p) => p.id === x.parentId) : undefined;
    const retired = x.retiredAt ? `${x.tag} is retired, so it can't be changed.` : null;
    const kids = activeChildren(x.id);
    return {
      id: x.id, tag: x.tag, name: x.name, typeId: t.id, typeName: t.name, typeVersion: t.version, fields: clone(t.fields), statuses: clone(t.statuses),
      status: statusOf(t, x.statusKey), siteId: x.siteId, location: x.location, parent: parent ? { id: parent.id, tag: parent.tag, name: parent.name } : null,
      childCount: assets.filter((c) => c.parentId === x.id).length, values, otherValues, createdAt: x.createdAt, updatedAt: x.updatedAt,
      retiredAt: x.retiredAt, retiredReason: x.retiredReason, cannotEditReason: retired, cannotMoveReason: retired,
      cannotRetireReason: x.retiredAt ? `${x.tag} is already retired.` : kids > 0 ? `${x.tag} has ${kids} asset(s) under it. Move or retire them first.` : null,
    };
  };

  function checkValues(t: AssetType, values: FieldValues): Record<string, string[]> {
    const errors: Record<string, string[]> = {};
    for (const fd of t.fields) {
      const v = values[fd.key];
      const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
      const bad = (msg: string) => { errors[`values.${fd.key}`] = [msg]; };
      if (empty) {
        if (fd.required) bad(`${fd.label} is required.`);
        continue;
      }
      const r = fd.rules;
      if (fd.kind === 'number') {
        if (typeof v !== 'number' || Number.isNaN(v)) bad(`${fd.label} must be a number.`);
        else if (r.min != null && v < r.min) bad(`${fd.label} must be at least ${r.min}${r.unit ? ` ${r.unit}` : ''}.`);
        else if (r.max != null && v > r.max) bad(`${fd.label} must be at most ${r.max}${r.unit ? ` ${r.unit}` : ''}.`);
      } else if (fd.kind === 'text') {
        const text = String(v);
        if (r.maxLength != null && text.length > r.maxLength) bad(`Use ${r.maxLength} characters or fewer.`);
        else if (r.pattern && !new RegExp(r.pattern).test(text)) bad(r.patternHint ?? `${fd.label} isn't in the expected format.`);
      } else if (fd.kind === 'choice') {
        const picked = Array.isArray(v) ? v : [v];
        if (picked.some((p) => !(r.options ?? []).includes(String(p)))) bad(`Choose one of: ${(r.options ?? []).join(', ')}.`);
      } else if (fd.kind === 'date') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) bad('Enter a date.');
        else if (r.notInFuture && String(v) > now().toISOString().slice(0, 10)) bad(`${fd.label} can't be in the future.`);
      }
    }
    return errors;
  }

  function buildType(body: AssetTypeInput, existing?: AssetType): AssetType {
    const errors: Record<string, string[]> = {};
    if (!body.name.trim()) errors.name = ['Name is required.'];
    const prefix = body.tagPrefix.trim().toUpperCase();
    if (!prefix) errors.tagPrefix = ['Tag prefix is required, e.g. PMP for pumps.'];
    else if (!/^[A-Z][A-Z0-9]{1,7}$/.test(prefix)) errors.tagPrefix = ['Use 2 to 8 letters or numbers, starting with a letter, e.g. PMP.'];
    else if (types.some((t) => t.id !== existing?.id && t.tagPrefix === prefix)) errors.tagPrefix = [`Another type already uses the prefix ${prefix}.`];
    body.fields.forEach((fd, i) => { if (!fd.label.trim()) errors[`fields[${i}].label`] = ['Give the field a name.']; });
    if (body.statuses.length === 0) errors.statuses = ['Add at least one status.'];
    body.statuses.forEach((st, i) => { if (!st.label.trim()) errors[`statuses[${i}].label`] = ['Give the status a name.']; });
    if (Object.keys(errors).length) throw invalid(errors);
    const used = new Set<string>();
    const keyFor = (given: string | null, label: string) => {
      let k = given ?? slug(label);
      for (let n = 2; !given && used.has(k); n++) k = `${slug(label)}_${n}`;
      used.add(k);
      return k;
    };
    const fields = body.fields.map((fd: FieldInput, i) => ({ key: keyFor(fd.key, fd.label), label: fd.label.trim(), kind: fd.kind, required: fd.required, order: i, rules: clone(fd.rules) }));
    used.clear();
    const statuses = body.statuses.map((st, i) => ({ key: keyFor(st.key, st.label), label: st.label.trim(), meaning: st.meaning, order: i }));
    return {
      id: existing?.id ?? `t-${nextId++}`, name: body.name.trim(), tagPrefix: prefix, iconKey: body.iconKey, fields, statuses,
      version: (existing?.version ?? 0) + 1, templateKey: existing?.templateKey ?? null, isArchived: existing?.isArchived ?? false, updatedAt: now().toISOString(),
    };
  }

  function sortValue(x: StoredAsset, sort: AssetQuery['sort']): string | number {
    if (sort === 'name') return x.name.toLowerCase();
    if (sort === 'status') return findType(x.typeId).statuses.findIndex((st) => st.key === x.statusKey);
    if (sort === 'updated') return x.updatedAt;
    if (sort.startsWith('field:')) {
      const v = x.values[sort.slice(6)];
      return typeof v === 'number' ? v : String(v ?? '').toLowerCase();
    }
    return x.tag;
  }

  const usedBytes = () => docs.reduce((n, d) => n + d.sizeBytes, 0);

  return {
    catalog: {
      types: async (includeArchived) => clone(types.filter((t) => includeArchived || !t.isArchived)),
      type: async (id) => clone(findType(id)),
      createType: async (body) => {
        const t = buildType(body);
        types = [...types, t];
        counters.set(t.id, 1);
        return clone(t);
      },
      updateType: async (id, body) => {
        const old = findType(id);
        if (old.isArchived) throw new ApiError(409, `${old.name} is archived. Restore it before changing it.`);
        if (body.version !== old.version) throw new ApiError(409, `Someone else changed ${old.name} while you were editing (it is now at version ${old.version}). Reload it and make your changes again.`);
        for (const fd of body.fields) {
          const was = old.fields.find((x) => x.key === fd.key);
          if (was && was.kind !== fd.kind) {
            throw new ApiError(409, `"${was.label}" is a ${was.kind} field and can't become a ${fd.kind} field, because existing values wouldn't fit. Add a new field instead.`);
          }
        }
        const t = buildType(body, old);
        types = types.map((x) => (x.id === id ? t : x));
        return clone(t);
      },
      fromTemplate: async (key, name, tagPrefix) => {
        const tpl = TEMPLATE_SEEDS.find((x) => x.key === key);
        if (!tpl) throw new ApiError(404, 'No template has this key.');
        const t = buildType({
          name: name ?? tpl.name, tagPrefix: tagPrefix ?? tpl.tagPrefix, iconKey: tpl.iconKey, version: null,
          fields: tpl.fields.map((x) => ({ key: x.key, label: x.label, kind: x.kind, required: x.required, rules: x.rules })),
          statuses: tpl.statuses.map((x) => ({ key: x.key, label: x.label, meaning: x.meaning })),
        });
        t.templateKey = key;
        types = [...types, t];
        counters.set(t.id, 1);
        return clone(t);
      },
      archive: async (id) => {
        const t = findType(id);
        if (t.isArchived) throw new ApiError(409, `${t.name} is already archived.`);
        Object.assign(t, { isArchived: true, version: t.version + 1 });
        return clone(t);
      },
      restore: async (id) => {
        const t = findType(id);
        if (!t.isArchived) throw new ApiError(409, `${t.name} isn't archived.`);
        Object.assign(t, { isArchived: false, version: t.version + 1 });
        return clone(t);
      },
      templates: async () => clone(TEMPLATE_SEEDS),
    },
    assets: {
      list: async (q) => {
        const term = q.search.trim().toLowerCase();
        const rows = assets
          .filter((x) => q.includeRetired || !x.retiredAt)
          .filter((x) => !q.typeId || x.typeId === q.typeId)
          .filter((x) => !q.siteId || x.siteId === q.siteId)
          .filter((x) => !q.status || x.statusKey === q.status)
          .filter((x) => !q.parentId || x.parentId === q.parentId)
          .filter((x) => !term || x.tag.toLowerCase().includes(term) || x.name.toLowerCase().includes(term));
        if (q.sort.startsWith('field:') && !q.typeId) throw new ApiError(400, 'Choose an asset type before sorting by one of its fields.');
        rows.sort((x, y) => {
          const p = sortValue(x, q.sort);
          const r = sortValue(y, q.sort);
          const c = p < r ? -1 : p > r ? 1 : 0;
          return q.order === 'desc' ? -c : c;
        });
        const start = (q.page - 1) * q.pageSize;
        return {
          items: rows.slice(start, start + q.pageSize).map((x) => toSummary(x, Boolean(q.typeId))),
          total: rows.length, page: q.page, pageSize: q.pageSize, columns: q.typeId ? clone(findType(q.typeId).fields) : [],
        };
      },
      get: async (id) => toAsset(findAsset(id)),
      create: async (body) => {
        const errors: Record<string, string[]> = {};
        if (!body.typeId) errors.typeId = ['Choose an asset type.'];
        if (!body.name.trim()) errors.name = ['Name is required.'];
        if (Object.keys(errors).length) throw invalid(errors);
        const t = findType(body.typeId);
        if (t.isArchived) throw new ApiError(409, `${t.name} is archived, so no new assets of this type can be added. Restore it in Settings › Asset types.`);
        const valueErrors = checkValues(t, body.values);
        if (Object.keys(valueErrors).length) throw invalid(valueErrors);
        const live = assets.filter((x) => !x.retiredAt).length;
        if (live >= maxAssets) throw new ApiError(409, `Your plan allows ${maxAssets.toLocaleString('en-US')} assets and all ${maxAssets.toLocaleString('en-US')} are in use. Retire assets you no longer need, or ask your Owner about a bigger plan.`);
        const n = counters.get(t.id) ?? 1;
        counters.set(t.id, n + 1);
        const at = now().toISOString();
        const x: StoredAsset = {
          id: `a-new-${nextId++}`, tag: `${t.tagPrefix}-${String(n).padStart(6, '0')}`, name: body.name.trim(), typeId: t.id,
          statusKey: body.statusKey || t.statuses[0]!.key, siteId: body.siteId, location: body.location.trim(), parentId: body.parentId,
          values: clone(body.values), createdAt: at, updatedAt: at, retiredAt: null, retiredReason: null,
        };
        assets = [...assets, x];
        return toAsset(x);
      },
      update: async (id, body) => {
        const x = findAsset(id);
        if (x.retiredAt) throw new ApiError(409, `${x.tag} is retired, so it can't be changed.`);
        if (!body.name.trim()) throw invalid({ name: ['Name is required.'] });
        const t = findType(x.typeId);
        const valueErrors = checkValues(t, body.values);
        if (Object.keys(valueErrors).length) throw invalid(valueErrors);
        const keep = Object.fromEntries(Object.entries(x.values).filter(([k]) => !t.fields.some((fd) => fd.key === k)));
        Object.assign(x, { name: body.name.trim(), statusKey: body.statusKey, location: body.location.trim(), parentId: body.parentId, values: { ...keep, ...clone(body.values) }, updatedAt: now().toISOString() });
        return toAsset(x);
      },
      children: async (id) => assets.filter((x) => x.parentId === id).map((x) => toSummary(x, false)),
      move: async (id, siteId, location) => {
        const x = findAsset(id);
        if (x.retiredAt) throw new ApiError(409, `${x.tag} is retired, so it can't be changed.`);
        if (!siteId) throw invalid({ siteId: ['Choose the site it moves to.'] });
        Object.assign(x, { siteId, location: location.trim(), updatedAt: now().toISOString() });
        return toAsset(x);
      },
      retire: async (id, reason) => {
        const x = findAsset(id);
        const why = toAsset(x).cannotRetireReason;
        if (why) throw new ApiError(409, why);
        if (reason.trim().length < 3) throw invalid({ reason: ['Say why it is retired, e.g. "Replaced by CH-4".'] });
        Object.assign(x, { retiredAt: now().toISOString(), retiredReason: reason.trim() });
        return toAsset(x);
      },
    },
    documents: {
      list: async (assetId) => clone(docs.filter((d) => d.assetId === assetId)),
      upload: async (assetId, file) => {
        findAsset(assetId);
        if (!UPLOAD_TYPES.includes(file.type)) throw invalid({ file: [`${file.name} isn't a PDF or an image (PNG, JPEG or WebP). Save it as one of those and try again.`] });
        if (file.size > UPLOAD_MAX_BYTES) throw invalid({ file: [`${file.name} is larger than 25 MB. Make it smaller and try again.`] });
        if (usedBytes() + file.size > storageLimit) throw new ApiError(409, 'Your plan\'s storage is full. Delete files you no longer need, or ask your Owner about a bigger plan.');
        const d: DocumentFile = { id: `d-${nextId++}`, assetId, fileName: file.name, contentType: file.type, sizeBytes: file.size, uploadedByName: 'Mona Haddad', uploadedAt: now().toISOString() };
        docs = [...docs, d];
        return clone(d);
      },
      remove: async (id) => {
        if (!docs.some((d) => d.id === id)) throw new ApiError(404, 'No document has this id.');
        docs = docs.filter((d) => d.id !== id);
      },
      link: async (id) => ({ url: `https://files.example/${id}?sig=demo`, expiresAt: new Date(now().getTime() + 300_000).toISOString() }),
      usage: async () => {
        const used = usedBytes();
        return { usedBytes: used, limitBytes: storageLimit, state: used >= storageLimit ? 'blocked' : used / storageLimit >= 0.8 ? 'warn' : 'ok' };
      },
    },
  };
}
