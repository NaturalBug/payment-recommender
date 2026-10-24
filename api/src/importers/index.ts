import { RepositoryValidationError } from '../repositories/errors';
import type { ImportSource } from '../repositories/types';
import { createIpassMoneyImporter } from './ipassMoneyImporter';
import { createJkoPayImporter } from './jkoPayImporter';
import { createLinePayImporter } from './linePayImporter';
import { fetchOfficialPage } from './shared';
import type { PromotionSourceAdapter } from './types';

export { fetchOfficialPage };
export type { FetchPage, ImportedPromotionCandidate, PromotionSourceAdapter } from './types';

export function getPromotionSourceAdapter(source: string): PromotionSourceAdapter {
  switch (source as ImportSource) {
    case 'line-pay':
      return createLinePayImporter();
    case 'jko-pay':
      return createJkoPayImporter();
    case 'ipass-money':
      return createIpassMoneyImporter();
    default:
      throw new RepositoryValidationError(`unsupported source: ${source}`);
  }
}
