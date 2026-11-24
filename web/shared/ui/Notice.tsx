import type { ReactNode } from 'react';

export function Notice({ kind, children, action }: { kind: 'error' | 'ok' | 'info' | 'warn'; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <div style={{ flexGrow: 1 }}>{children}</div>
      {action}
    </div>
  );
}
