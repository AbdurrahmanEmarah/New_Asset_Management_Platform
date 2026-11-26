import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { OfflineProvider } from '@/offline/OfflineProvider';
import { OfflineQueue, type KeyValueStore } from '@/offline/queue';
import { createSender } from '@/offline/send';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { testApi } from './test-api';

export function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
  };
}

export async function renderScreen(ui: ReactElement) {
  const queue = new OfflineQueue(memoryStore());
  const result = await render(
    <ThemeProvider initialMode="dark">
      <OfflineProvider queue={queue} send={(c) => createSender({ jobs: testApi.current, assets: testApi.assets })(c)}>
        {ui}
      </OfflineProvider>
    </ThemeProvider>,
  );
  return { ...result, queue };
}
