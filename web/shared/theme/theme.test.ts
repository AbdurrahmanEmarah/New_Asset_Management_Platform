import { describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY, readStoredMode, resolveTheme, storeMode } from './theme';

describe('theme', () => {
  it('follows the device when the mode is system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('keeps an explicit choice whatever the device says', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('remembers the choice and ignores junk in storage', () => {
    expect(readStoredMode()).toBe('system');
    storeMode('dark');
    expect(readStoredMode()).toBe('dark');
    window.localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    expect(readStoredMode()).toBe('system');
  });
});
