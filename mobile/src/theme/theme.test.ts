import AsyncStorage from '@react-native-async-storage/async-storage';
import { readStoredMode, resolveTheme, storeMode, THEME_STORAGE_KEY } from './theme';

describe('theme', () => {
  beforeEach(() => AsyncStorage.clear());

  it('defaults to dark (Control Room) in the field', async () => {
    expect(await readStoredMode()).toBe('dark');
  });

  it('remembers the choice on the device', async () => {
    await storeMode('light');
    expect(await AsyncStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(await readStoredMode()).toBe('light');
  });

  it('ignores a stored value it does not know', async () => {
    await AsyncStorage.setItem(THEME_STORAGE_KEY, 'purple');
    expect(await readStoredMode()).toBe('dark');
  });

  it('follows the system when asked', () => {
    expect(resolveTheme('system', 'light')).toBe('light');
    expect(resolveTheme('system', 'dark')).toBe('dark');
    expect(resolveTheme('system', null)).toBe('dark');
    expect(resolveTheme('light', 'dark')).toBe('light');
  });
});
