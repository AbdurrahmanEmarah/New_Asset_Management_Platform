export type StatusKind = 'ok' | 'warn' | 'fault' | 'info' | 'none';

export function StatusPill({ kind, children }: { kind: StatusKind; children: React.ReactNode }) {
  return (
    <span className={`pill pill-${kind}`}>
      <span className={`shape shape-${kind}`} aria-hidden="true" />
      {children}
    </span>
  );
}
