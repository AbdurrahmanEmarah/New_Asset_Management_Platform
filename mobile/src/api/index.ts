/**
 * The one place screens get data from. To switch to the real Work Orders API,
 * replace `api` with an HTTP implementation of WorkOrdersApi (src/api/types.ts).
 */
import { MockWorkOrdersApi } from './mock';
import { MockAssetsApi } from './mockAssets';

export * from './types';

export const api = new MockWorkOrdersApi();

/** Sample Assets and Documents, used in demo mode (development only). */
export const demoAssets = new MockAssetsApi();

/** Demo-only switch for the mock: pretend the phone has no signal. */
export const demoNetwork = {
  isOnline: () => api.isOnline(),
  setOnline: (online: boolean) => {
    api.setOnline(online);
    demoAssets.online = online;
  },
};
