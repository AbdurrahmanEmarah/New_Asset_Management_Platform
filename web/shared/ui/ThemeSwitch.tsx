import { useTheme } from '../theme/ThemeProvider';
import { THEME_MODES } from '../theme/theme';

/** System / Light / Dark. Saved in this browser now; saved on the user's profile once Access is built. */
export function ThemeSwitch({ label = 'Appearance' }: { label?: string }) {
  const { mode, setMode } = useTheme();
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {THEME_MODES.map((m) => (
        <button key={m.value} type="button" role="radio" aria-checked={mode === m.value} onClick={() => setMode(m.value)}>
          {m.label}
        </button>
      ))}
    </div>
  );
}
