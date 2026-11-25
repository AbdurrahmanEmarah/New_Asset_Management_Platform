import { createContext, useContext, type ReactNode } from 'react';
import type { AccessMe } from './api/access';

const MeContext = createContext<AccessMe | null>(null);

export function MeProvider({ me, children }: { me: AccessMe; children: ReactNode }) {
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}

export function useMe(): AccessMe {
  const me = useContext(MeContext);
  if (!me) throw new Error('useMe must be used inside <MeProvider>.');
  return me;
}

export function can(me: AccessMe, permission: string): boolean {
  return me.permissions.includes(permission);
}

/** The reason shown on a button the signed-in person isn't allowed to use, or null. */
export const READ_ONLY_PASS = 'Read-only support pass';

/** Set while platform support uses this workspace on a read-only pass: every change is refused. */
export function readOnlyReason(me: AccessMe): string | null {
  return me.supportSession?.access === 'read' ? READ_ONLY_PASS : null;
}

export function needs(me: AccessMe, permission: string, what: string): string | null {
  return readOnlyReason(me) ?? (can(me, permission) ? null : `You need the ${permission} permission to ${what}. Ask an Admin.`);
}

/**
 * The sites where the signed-in person holds a permission: 'all', or a list of site ids.
 * Site scope lives on each role assignment; the server checks again.
 */
export function sitesWith(me: AccessMe, permission: string): 'all' | string[] {
  const roles = me.roles.filter((r) => r.kind === 'owner' || r.permissions.includes(permission));
  if (roles.some((r) => r.allSites)) return 'all';
  return [...new Set(roles.flatMap((r) => r.siteIds))];
}
