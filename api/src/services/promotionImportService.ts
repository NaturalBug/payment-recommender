import {
  completeImportRun,
  createImportRun,
  failImportRun,
  upsertPendingDraft
} from '../repositories/promotionImportRepository';
import type { ImportRunRecord } from '../repositories/types';
import type { PromotionSourceAdapter } from '../importers/types';

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'promotion import failed';
}

export async function runPromotionImport(adapter: PromotionSourceAdapter): Promise<ImportRunRecord> {
  const run = await createImportRun(adapter.source);

  try {
    const candidates = await adapter.import();

    for (const candidate of candidates) {
      await upsertPendingDraft({
        importRunId: run.id,
        source: adapter.source,
        ...candidate
      });
    }

    const completedAt = new Date();
    await completeImportRun(run.id, candidates.length);

    return {
      ...run,
      status: 'completed',
      completedAt,
      errorMessage: null,
      draftCount: candidates.length
    };
  } catch (error) {
    const errorMessage = toErrorMessage(error);
    await failImportRun(run.id, errorMessage);
    throw error;
  }
}
