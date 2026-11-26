import { MockWorkOrdersApi } from '@/api/mock';
import { MockAssetsApi } from '@/api/mockAssets';

/** Tests swap the api module's sample APIs for these zero-latency mocks, fresh for each test. */
export const testApi: { current: MockWorkOrdersApi; assets: MockAssetsApi } = {
  current: new MockWorkOrdersApi({ latency: 0 }),
  assets: new MockAssetsApi({ latency: 0 }),
};

export function resetTestApi(): MockWorkOrdersApi {
  testApi.current = new MockWorkOrdersApi({ latency: 0 });
  testApi.assets = new MockAssetsApi({ latency: 0 });
  return testApi.current;
}
