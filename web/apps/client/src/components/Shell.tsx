import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router';
import { initials } from '../../../../shared/errors';
import { Button, LogoMark, Notice, ThemeSwitch } from '../../../../shared/ui';
import type { ThemeMode } from '../../../../shared/theme/theme';
import { ACCESS_LABELS } from '../api/access';
import { useApi } from '../api/context';
import { useMe } from '../me';

interface TopItem {
  label: string;
  to?: string;
  /** Shown for parts not built yet, so nothing looks broken. */
  comingIn?: string;
}

export const MAIN_NAV: TopItem[] = [
  { label: 'Dashboard', comingIn: 'The dashboard arrives with assets and work orders.' },
  { label: 'Assets', comingIn: 'The asset register arrives in phase 2.' },
  { label: 'Work orders', comingIn: 'Work orders arrive in phase 3.' },
  { label: 'Inventory', comingIn: 'Inventory arrives in phase 3.' },
  { label: 'Reports', comingIn: 'Reports arrive in phase 5.' },
  { label: 'Settings', to: '/settings' },
];

const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

export function Shell({ children, onSignOut }: { children: ReactNode; onSignOut: () => void }) {
  const me = useMe();
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-brand">
          <LogoMark size={26} fill="var(--text)" />
          <span className="topbar-company">{me.company.name}</span>
        </div>
        <nav aria-label="Main" className="topnav">
          {MAIN_NAV.map((item) =>
            item.to ? (
              <NavLink key={item.label} to={item.to} className={({ isActive }) => `top${isActive ? ' top-on' : ''}`}>{item.label}</NavLink>
            ) : (
              <span key={item.label} className="top top-soon" aria-disabled="true" title={item.comingIn}>
                {item.label}
                <span className="soon">Soon</span>
                <span className="visually-hidden">{item.comingIn}</span>
              </span>
            ),
          )}
        </nav>
        <UserMenu onSignOut={onSignOut} />
      </header>
      {me.supportSession ? (
        <div className="support-banner">
          <Notice kind="warn">
            Support session: you're in {me.company.name} as platform support ({ACCESS_LABELS[me.supportSession.access].toLowerCase()}) until {clock.format(new Date(me.supportSession.expiresAt))}.
            Everything you do is recorded in their audit log.
          </Notice>
        </div>
      ) : null}
      <div className="app-body">{children}</div>
    </div>
  );
}

function UserMenu({ onSignOut }: { onSignOut: () => void }) {
  const me = useMe();
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [themeError, setThemeError] = useState<string | null>(null);

  const saveTheme = (mode: ThemeMode) => {
    setThemeError(null);
    api.savePreferences(mode).catch((err: unknown) => {
      setThemeError(`Saved in this browser only: ${err instanceof Error ? err.message : 'your profile could not be updated.'}`);
    });
  };
  const menuId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const roles = me.supportSession ? 'Platform support' : me.grants.map((g) => g.roleName).join(', ') || 'No role yet';

  return (
    <div className="usermenu" ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        className="usermenu-button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Account: ${me.name}, ${roles}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="avatar avatar-action" aria-hidden="true">{initials(me.name)}</span>
      </button>
      {open ? (
        <div id={menuId} className="usermenu-panel card" role="group" aria-label="Account">
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <strong>{me.name}</strong>
            <span className="muted" style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{me.email}</span>
            <span className="muted" style={{ fontSize: 13 }}>{roles} · {me.company.name}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="eyebrow">Appearance</span>
            <ThemeSwitch onChange={saveTheme} />
            {themeError ? <span className="field-error">{themeError}</span> : null}
          </div>
          <Button onClick={onSignOut}>Sign out</Button>
        </div>
      ) : null}
    </div>
  );
}
