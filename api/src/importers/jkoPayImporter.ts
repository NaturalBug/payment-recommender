import { createPromotionSourceAdapter, fetchOfficialPage } from './shared';
import type { FetchPage, PromotionSourceAdapter } from './types';

const jkoPayConfig = {
  source: 'jko-pay' as const,
  listUrl: 'https://mkt.jkopay.com/campaign/newevent',
  allowedHostnames: ['mkt.jkopay.com']
};

export function createJkoPayImporter(fetchPage: FetchPage = fetchOfficialPage): PromotionSourceAdapter {
  return createPromotionSourceAdapter(jkoPayConfig, fetchPage);
}
