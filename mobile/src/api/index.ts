/**
 * The one place screens get data from. To switch to the real Work Orders API,
 * replace `api` with an HTTP implementation of WorkOrdersApi (src/api/types.ts).
 */
import { MockWorkOrdersApi } from './mock';

export * from './types';

export const api = new MockWorkOrdersApi();

/** Demo-only switch for the mock: pretend the phone has no signal. */
export const demoNetwork = {
  isOnline: () => api.isOnline(),
  setOnline: (online: boolean) => api.setOnline(online),
};
