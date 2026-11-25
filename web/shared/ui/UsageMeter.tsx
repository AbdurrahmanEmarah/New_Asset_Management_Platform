export type UsageState = 'ok' | 'warn' | 'blocked';

const fmt = new Intl.NumberFormat('en-US');

/** `text` replaces the "used / limit" numbers, e.g. "3.1 MB of 20 GB". */
export function UsageMeter({ label, used, limit, state, text }: { label: string; used: number; limit: number; state: UsageState; text?: string }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  const stateText = state === 'blocked' ? ', limit reached' : state === 'warn' ? ', near the limit' : '';
  return (
    <div className="meter">
      <span className="mono" style={{ fontSize: 13 }}>
        {text ?? `${fmt.format(used)} / ${fmt.format(limit)}`}
      </span>
      <div
        className="meter-bar"
        role="meter"
        aria-label={`${label}: ${text ?? `${fmt.format(used)} of ${fmt.format(limit)}`}${stateText}`}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
      >
        <div className={`meter-fill ${state === 'ok' ? '' : state}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
