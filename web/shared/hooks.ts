import { useCallback, useEffect, useEffectEvent, useState } from 'react';

export type Loadable<T> =
  | { status: 'loading'; data?: T }
  | { status: 'ready'; data: T }
  | { status: 'error'; error: Error; data?: T };

function sameDeps(a: unknown[], b: unknown[]): boolean {
  return a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
}

/**
 * Loads data, keeps the last result while reloading, and exposes reload().
 * Loading is derived (the latest result belongs to an older request), so no state is set
 * synchronously inside the effect.
 */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]): [Loadable<T>, () => void] {
  const [version, setVersion] = useState(0);
  const run = useEffectEvent(load);
  // A new request object whenever the inputs change or reload() is called
  // (React's "adjust state while rendering" pattern).
  const [tracked, setTracked] = useState(() => ({ deps, version, request: {} as object }));
  if (tracked.version !== version || !sameDeps(tracked.deps, deps)) {
    setTracked({ deps, version, request: {} });
  }
  const request = tracked.request;
  const [result, setResult] = useState<{ request: object | null; data?: T; error?: Error }>({ request: null });

  useEffect(() => {
    let cancelled = false;
    run().then(
      (data) => {
        if (!cancelled) setResult({ request, data });
      },
      (error: unknown) => {
        if (!cancelled) setResult((prev) => ({ request, data: prev.data, error: error instanceof Error ? error : new Error(String(error)) }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [request]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  let state: Loadable<T>;
  if (result.request !== request) state = { status: 'loading', data: result.data };
  else if (result.error) state = { status: 'error', error: result.error, data: result.data };
  else state = { status: 'ready', data: result.data as T };
  return [state, reload];
}

/** The value after it has stopped changing for `ms` milliseconds. */
export function useDebounced<T>(value: T, ms = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** The current time, refreshed every `ms` milliseconds; for countdowns without impure renders. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}
