import { createPromotionSourceAdapter, fetchOfficialPage } from './shared';
import type { FetchPage, PromotionSourceAdapter } from './types';

const linePayConfig = {
  source: 'line-pay' as const,
  listUrl: 'https://pay.line.me/portal/tw/about/promotions',
  allowedHostnames: ['pay.line.me']
};

export function createLinePayImporter(fetchPage: FetchPage = fetchOfficialPage): PromotionSourceAdapter {
  return createPromotionSourceAdapter(linePayConfig, fetchPage);
}
