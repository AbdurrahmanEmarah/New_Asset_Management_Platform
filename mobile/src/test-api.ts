import { MockWorkOrdersApi } from '@/api/mock';

/** Tests swap the api module's `api` for this zero-latency mock, fresh for each test. */
export const testApi: { current: MockWorkOrdersApi } = { current: new MockWorkOrdersApi({ latency: 0 }) };

export function resetTestApi(): MockWorkOrdersApi {
  testApi.current = new MockWorkOrdersApi({ latency: 0 });
  return testApi.current;
}
