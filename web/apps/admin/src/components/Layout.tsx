import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { roleLabel, useMe } from '../me';
import { AuditIcon, BillingIcon, Button, ClientsIcon, LogoMark, MegaphoneIcon, PlansIcon, PulseIcon, ShieldIcon, TemplatesIcon, ThemeSwitch } from '../../../../shared/ui';

interface NavItem {
  label: string;
  icon: ReactNode;
  to?: string;
  /** Shown for parts of the console that aren't built yet, so nothing looks broken. */
  comingIn?: string;
}

export const NAV: { heading: string; items: NavItem[] }[] = [
  {
    heading: 'Business',
    items: [
      { label: 'Clients', icon: <ClientsIcon />, to: '/' },
      { label: 'Plans & limits', icon: <PlansIcon />, to: '/plans' },
      { label: 'Billing', icon: <BillingIcon />, comingIn: 'Billing arrives in a later release.' },
      { label: 'Template library', icon: <TemplatesIcon />, to: '/templates' },
    ],
  },
  {
    heading: 'Operations',
    items: [
      { label: 'Support access', icon: <ShieldIcon />, to: '/support' },
      { label: 'Health & jobs', icon: <PulseIcon />, comingIn: 'Health & jobs arrives in a later release. Use the Aspire dashboard for now.' },
      { label: 'Audit log', icon: <AuditIcon />, to: '/audit' },
      { label: 'Announcements', icon: <MegaphoneIcon />, comingIn: 'Announcements arrive in a later release.' },
    ],
  },
];

export function Layout({ children, onSignOut }: { children: ReactNode; onSignOut: () => void }) {
  const me = useMe();
  const initials = me.name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="shell">
      <nav className="side" aria-label="Platform admin">
        <div className="side-brand">
          <LogoMark fill="var(--side-text)" />
          <span className="side-name">inventra</span>
          <span className="side-badge">ADMIN</span>
        </div>
        {NAV.map((group) => (
          <div key={group.heading} className="side-group">
            <div className="side-heading">{group.heading}</div>
            {group.items.map((item) =>
              item.to ? (
                <NavLink key={item.label} to={item.to} end className={({ isActive }) => `nav${isActive ? ' nav-on' : ''}`}>
                  {item.icon}
                  {item.label}
                </NavLink>
              ) : (
                <span key={item.label} className="nav nav-soon" aria-disabled="true" title={item.comingIn}>
                  {item.icon}
                  {item.label}
                  <span className="soon">Soon</span>
                  <span className="visually-hidden">{item.comingIn}</span>
                </span>
              ),
            )}
          </div>
        ))}
        <div className="side-foot">
          <ThemeSwitch />
          <div className="side-user">
            <div className="avatar">{initials}</div>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span className="side-user-name">{me.name}</span>
              <span className="side-user-role">{roleLabel(me)}</span>
            </div>
          </div>
          <Button size="sm" className="side-signout" onClick={onSignOut}>Sign out</Button>
        </div>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
