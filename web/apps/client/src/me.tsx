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
export function needs(me: AccessMe, permission: string, what: string): string | null {
  return can(me, permission) ? null : `You need the ${permission} permission to ${what}. Ask an Admin.`;
}

export function isOwner(me: AccessMe): boolean {
  return me.roles.some((r) => r.id === 'owner' || r.name === 'Owner');
}
