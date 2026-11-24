import { cloneElement, useId, type ReactElement } from 'react';

interface FieldProps {
  label: string;
  hint?: string;
  error?: string | undefined;
  required?: boolean;
  children: ReactElement<Record<string, unknown>>;
  style?: React.CSSProperties;
}

/** Label, control, hint and error wired together for screen readers. */
export function Field({ label, hint, error, required, children, style }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="field" style={style}>
      <label htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true" style={{ color: 'var(--fault)' }}> *</span> : null}
      </label>
      {cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
        'aria-required': required || undefined,
      })}
      {hint ? <span id={hintId} className="field-hint">{hint}</span> : null}
      {error ? <span id={errorId} className="field-error">{error}</span> : null}
    </div>
  );
}
