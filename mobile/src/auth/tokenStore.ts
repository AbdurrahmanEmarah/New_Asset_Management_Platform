import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const REFRESH_TOKEN_KEY = 'inventra.field.refreshToken';

export interface TokenStore {
  /** False on the web: the browser has no secure store, so the sign-in lasts until the tab closes. */
  readonly persistent: boolean;
  read(): Promise<string | null>;
  save(refreshToken: string): Promise<void>;
  clear(): Promise<void>;
}

/** Keeps the refresh token in the phone's keychain / keystore. */
export const secureTokenStore: TokenStore = {
  persistent: true,
  read: () => SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  save: (token) => SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token),
  clear: () => SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
};

/** For the web: in memory only, never in localStorage. */
export function memoryTokenStore(): TokenStore {
  let token: string | null = null;
  return {
    persistent: false,
    read: async () => token,
    save: async (t) => {
      token = t;
    },
    clear: async () => {
      token = null;
    },
  };
}

export const defaultTokenStore: TokenStore = Platform.OS === 'web' ? memoryTokenStore() : secureTokenStore;
