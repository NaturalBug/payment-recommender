import { createPromotionSourceAdapter, fetchOfficialPage } from './shared';
import type { FetchPage, PromotionSourceAdapter } from './types';

const ipassMoneyConfig = {
  source: 'ipass-money' as const,
  listUrl: 'https://www.i-pass.com.tw/Preferential',
  allowedHostnames: ['www.i-pass.com.tw']
};

export function createIpassMoneyImporter(fetchPage: FetchPage = fetchOfficialPage): PromotionSourceAdapter {
  return createPromotionSourceAdapter(ipassMoneyConfig, fetchPage);
}
