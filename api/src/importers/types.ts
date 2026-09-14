import type { ImportSource } from '../repositories/types';

export type ImportedPromotionCandidate = {
  sourceFingerprint: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceContent: string;
  fetchedAt: Date;
  parsedCashbackRate?: number;
  parsedAmountThreshold?: number;
  parsedValidityStart?: Date;
  parsedValidityEnd?: Date;
};

export type FetchPage = (url: string) => Promise<string>;

export type PromotionSourceAdapter = {
  source: ImportSource;
  import(): Promise<ImportedPromotionCandidate[]>;
};
