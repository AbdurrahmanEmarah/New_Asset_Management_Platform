import { createContext, useContext, type ReactNode } from 'react';
import type { Me } from './api/tenancy';

const MeContext = createContext<Me | null>(null);

export function MeProvider({ me, children }: { me: Me; children: ReactNode }) {
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}

export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error('useMe must be used inside <MeProvider>.');
  return me;
}

export const OWNER_ONLY = 'Only the Platform Owner can do this.';
export const BILLING_ONLY = 'Only the Platform Owner or Billing can change plans.';

export function roleLabel(me: Me): string {
  if (me.roles.includes('platform-owner')) return 'Platform Owner';
  if (me.roles.includes('platform-billing')) return 'Billing';
  if (me.roles.includes('platform-support')) return 'Support';
  return 'No platform role';
}

export const SUPPORT_ONLY = 'Only Support staff and the Platform Owner can request support access.';

export const CHANGE_ACCESS_OWNER_ONLY = 'Only the Platform Owner can open a pass with change access. Request a read-only pass instead.';

export function isPlatformOwner(me: Me): boolean {
  return me.roles.includes('platform-owner');
}

export function canRequestSupport(me: Me): boolean {
  return me.roles.includes('platform-owner') || me.roles.includes('platform-support');
}
