import { NavLink, Outlet } from 'react-router';

interface SideItem { label: string; to?: string; comingIn?: string }

export const SETTINGS_NAV: { heading: string; items: SideItem[] }[] = [
  {
    heading: 'Organisation',
    items: [
      { label: 'Company profile', comingIn: 'Company profile and branding arrive in a later release.' },
      { label: 'Users', to: '/settings/users' },
      { label: 'Roles & permissions', to: '/settings/roles' },
      { label: 'Sites', to: '/settings/sites' },
      { label: 'Support access', to: '/settings/support' },
    ],
  },
  {
    heading: 'Configuration',
    items: [
      { label: 'Asset types', comingIn: 'The asset-type builder arrives in phase 2.' },
      { label: 'Modules', comingIn: 'Modules arrive in a later release.' },
      { label: 'Integrations', comingIn: 'Integrations arrive in phase 5.' },
      { label: 'Audit log', comingIn: 'Your company audit log arrives in phase 5.' },
    ],
  },
];

export function SettingsLayout() {
  return (
    <div className="settings">
      <nav aria-label="Settings" className="settings-nav">
        {SETTINGS_NAV.map((group) => (
          <div key={group.heading} className="settings-group">
            <div className="eyebrow settings-heading">{group.heading}</div>
            {group.items.map((item) =>
              item.to ? (
                <NavLink key={item.label} to={item.to} className={({ isActive }) => `sidelink${isActive ? ' sidelink-on' : ''}`}>{item.label}</NavLink>
              ) : (
                <span key={item.label} className="sidelink sidelink-soon" aria-disabled="true" title={item.comingIn}>
                  {item.label}
                  <span className="soon">Soon</span>
                  <span className="visually-hidden">{item.comingIn}</span>
                </span>
              ),
            )}
          </div>
        ))}
      </nav>
      <main className="settings-main">
        <Outlet />
      </main>
    </div>
  );
}
