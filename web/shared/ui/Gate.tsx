import type { ReactNode } from 'react';
import { LogoMark } from './Icons';
import { ThemeSwitch } from './ThemeSwitch';

/** The centred card shown before the app itself: signing in, loading the profile, or a blocking problem. */
export function Gate({ title, badge, children }: { title: string; badge?: string; children: ReactNode }) {
  return (
    <div className="gate">
      <div className="card gate-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LogoMark />
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>inventra</span>
          {badge ? <span className="badge">{badge}</span> : null}
        </div>
        <h1 style={{ margin: 0, fontSize: 24 }}>{title}</h1>
        {children}
        <div style={{ marginTop: 8 }}><ThemeSwitch /></div>
      </div>
    </div>
  );
}
