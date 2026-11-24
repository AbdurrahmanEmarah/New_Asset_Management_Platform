import { useId, type ButtonHTMLAttributes, type MouseEvent } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger';
  size?: 'md' | 'sm';
  /**
   * When set, the button is disabled and says why. It stays focusable so keyboard and
   * screen-reader users can find out the reason too. A button never silently does nothing.
   */
  disabledReason?: string | null;
  busy?: boolean;
}

export function Button({ variant = 'ghost', size = 'md', disabledReason, busy, className, onClick, children, type = 'button', ...rest }: ButtonProps) {
  const reasonId = useId();
  const disabled = Boolean(disabledReason) || Boolean(busy);
  const classes = ['btn', variant === 'primary' && 'btn-primary', variant === 'danger' && 'btn-danger', size === 'sm' && 'btn-sm', className]
    .filter(Boolean)
    .join(' ');

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (disabled) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  };

  return (
    <>
      <button
        {...rest}
        type={type}
        className={classes}
        aria-disabled={disabled || undefined}
        aria-busy={busy || undefined}
        aria-describedby={disabledReason ? reasonId : rest['aria-describedby']}
        title={disabledReason ?? rest.title}
        onClick={handleClick}
      >
        {children}
      </button>
      {disabledReason ? (
        <span id={reasonId} className="visually-hidden">
          {disabledReason}
        </span>
      ) : null}
    </>
  );
}
