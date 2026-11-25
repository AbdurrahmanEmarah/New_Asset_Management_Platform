import { render } from '@testing-library/react';
import { ThemeProvider } from '../../../shared/theme/ThemeProvider';
import type { AccessApi } from './api/access';
import { createDemoAccessApi, type DemoOptions } from './api/demo';
import { Workspace } from './App';

/** Renders the signed-in workspace at a path, on the in-memory API (spied on, so calls can be checked). */
export function renderWorkspace(path: string, options: DemoOptions & { api?: Partial<AccessApi> } = {}) {
  const { api: overrides, ...demo } = options;
  const base = createDemoAccessApi({ now: () => new Date('2026-11-24T12:00:00Z'), ...demo });
  const api = { ...base, ...overrides } as AccessApi;
  for (const key of Object.keys(api) as (keyof AccessApi)[]) {
    if (!vi.isMockFunction(api[key])) api[key] = vi.fn(api[key]) as never;
  }
  window.history.pushState(null, '', path);
  const onSignOut = vi.fn();
  render(<ThemeProvider><Workspace api={api} onSignOut={onSignOut} /></ThemeProvider>);
  return { api, onSignOut };
}
