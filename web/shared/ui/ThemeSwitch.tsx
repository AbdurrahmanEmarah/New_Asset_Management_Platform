import { useTheme } from '../theme/ThemeProvider';
import { THEME_MODES, type ThemeMode } from '../theme/theme';

/** System / Light / Dark. Always saved in this browser; `onChange` also saves it elsewhere (e.g. the person's profile). */
export function ThemeSwitch({ label = 'Appearance', onChange }: { label?: string; onChange?: (mode: ThemeMode) => void }) {
  const { mode, setMode } = useTheme();
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {THEME_MODES.map((m) => (
        <button key={m.value} type="button" role="radio" aria-checked={mode === m.value} onClick={() => { setMode(m.value); onChange?.(m.value); }}>
          {m.label}
        </button>
      ))}
    </div>
  );
}
