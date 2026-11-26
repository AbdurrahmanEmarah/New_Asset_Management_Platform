import type { AssetsApi } from '@/api/assets';
import { AccessDeniedError, NotFoundError, RefusedError } from '@/api/http';
import { ApiError, type Change, type SendResult, type WorkOrdersApi } from '@/api/types';
import type { Sender } from './queue';

/**
 * Sends one queued change to the right service.
 * A refusal the person must see (400/403/404/409/413) becomes a conflict with the server's sentence;
 * anything else is thrown, so the change stays first in line and is retried.
 */
export function createSender(apis: { jobs: WorkOrdersApi; assets: AssetsApi | null }): Sender {
  return async (change: Change): Promise<SendResult> => {
    if (change.kind !== 'asset.photo') return apis.jobs.send(change);
    if (!apis.assets) throw new ApiError('Sign in to send this photo.');
    try {
      await apis.assets.uploadDocument(change.assetId, {
        uri: change.uri,
        name: change.fileName,
        type: change.contentType,
        sizeBytes: change.sizeBytes,
      });
      return { status: 'sent' };
    } catch (error) {
      if (error instanceof RefusedError || error instanceof AccessDeniedError || error instanceof NotFoundError) {
        return { status: 'conflict', message: error.message };
      }
      throw error;
    }
  };
}
