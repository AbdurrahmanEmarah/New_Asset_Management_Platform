import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react';

interface DialogProps {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  icon?: ReactNode;
}

/** A modal dialog. Escape and the scrim close it; focus moves into it and returns afterwards. */
export function Dialog({ title, description, onClose, children, icon }: DialogProps) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  // Callers pass inline arrows, so onClose changes on every render. Keep the latest in a ref and run
  // the focus and Escape setup once; re-running it moved focus back to the first field while typing.
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && close.current()}>
      <div ref={ref} className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {icon}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h2 id={titleId}>{title}</h2>
            {description ? <div className="muted" style={{ fontSize: 14 }}>{description}</div> : null}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
