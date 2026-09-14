import prisma from '../lib/prisma';
import { RepositoryValidationError } from '../repositories/errors';
import { fetchOfficialPage, getPromotionSourceAdapter } from '../importers';
import { createIpassMoneyImporter } from '../importers/ipassMoneyImporter';
import { createJkoPayImporter } from '../importers/jkoPayImporter';
import { createLinePayImporter } from '../importers/linePayImporter';
import { listImportRuns, listPromotionDrafts } from '../repositories/promotionImportRepository';
import type { PromotionSourceAdapter } from '../importers/types';
import { runPromotionImport } from '../services/promotionImportService';

describe('promotion import service', () => {
  beforeEach(async () => {
    await prisma.promotionDraft.deleteMany();
    await prisma.rewardRule.deleteMany();
    await prisma.merchantPaymentAcceptance.deleteMany();
    await prisma.importRun.deleteMany();
    await prisma.merchant.deleteMany();
    await prisma.paymentMethod.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('records a completed run and persists each adapter candidate', async () => {
    const fetchedAt = new Date('2026-09-14T00:00:00.000Z');
    const candidate = {
      sourceFingerprint: 'line-pay:https://pay.line.me/portal/tw/about/promotions/summer',
      sourceUrl: 'https://pay.line.me/portal/tw/about/promotions/summer',
      sourceTitle: '夏日加碼回饋',
      sourceContent: '活動期間 2026/09/01-2026/09/30 單筆滿 NT$300 享 5% 回饋',
      fetchedAt,
      parsedCashbackRate: 0.05,
      parsedAmountThreshold: 300,
      parsedValidityStart: new Date('2026-09-01T00:00:00.000Z'),
      parsedValidityEnd: new Date('2026-09-30T23:59:59.999Z')
    };
    const adapter: PromotionSourceAdapter = {
      source: 'line-pay',
      import: jest.fn().mockResolvedValue([candidate])
    };

    const run = await runPromotionImport(adapter);

    expect(run).toMatchObject({ source: 'line-pay', status: 'completed', draftCount: 1 });
    await expect(listPromotionDrafts()).resolves.toEqual([
      expect.objectContaining({
        importRunId: run.id,
        source: 'line-pay',
        sourceFingerprint: candidate.sourceFingerprint
      })
    ]);
  });

  test('records a failed run and rethrows an adapter failure', async () => {
    const adapter: PromotionSourceAdapter = {
      source: 'jko-pay',
      import: jest.fn().mockRejectedValue(new Error('source unavailable'))
    };

    await expect(runPromotionImport(adapter)).rejects.toThrow('source unavailable');
    await expect(listImportRuns()).resolves.toEqual([
      expect.objectContaining({ source: 'jko-pay', status: 'failed', errorMessage: 'source unavailable' })
    ]);
  });

  test('normalizes LINE Pay fixture content into a deterministic candidate', async () => {
    const fetchPage = jest.fn().mockResolvedValue(`
      <section>
        <a class="activity-card" href="/portal/tw/about/promotions/summer-fest">
          <h2>夏日回饋最高 5%</h2>
          <p>活動期間 2026/09/01 - 2026/09/30，單筆滿 NT$300 享 5% 回饋。</p>
        </a>
      </section>
    `);

    const results = await createLinePayImporter(fetchPage).import();

    expect(fetchPage).toHaveBeenCalledWith('https://pay.line.me/portal/tw/about/promotions');
    expect(results).toEqual([
      expect.objectContaining({
        sourceFingerprint: 'line-pay:https://pay.line.me/portal/tw/about/promotions/summer-fest',
        sourceUrl: 'https://pay.line.me/portal/tw/about/promotions/summer-fest',
        sourceTitle: '夏日回饋最高 5%',
        parsedCashbackRate: 0.05,
        parsedAmountThreshold: 300,
        parsedValidityStart: new Date('2026-09-01T00:00:00.000Z'),
        parsedValidityEnd: new Date('2026-09-30T23:59:59.999Z')
      })
    ]);
    expect(results[0].sourceContent).not.toHaveLength(0);
  });

  test('does not read redirected non-official content when fetching official pages', async () => {
    const originalFetch = global.fetch;
    const text = jest.fn().mockResolvedValue('<html>off-platform content</html>');

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 302,
      statusText: 'Found',
      text
    } as unknown as Response);

    await expect(fetchOfficialPage('https://pay.line.me/portal/tw/about/promotions')).rejects.toThrow(
      'redirects are not allowed'
    );
    expect(global.fetch).toHaveBeenCalledWith('https://pay.line.me/portal/tw/about/promotions', {
      headers: {
        'User-Agent': 'payment-recommender-importer/1.0 (+https://github.com/)'
      },
      redirect: 'manual'
    });
    expect(text).not.toHaveBeenCalled();

    global.fetch = originalFetch;
  });

  test('normalizes JKO Pay fixture content into a deterministic candidate', async () => {
    const fetchPage = jest.fn().mockResolvedValue(`
      <div class="campaign-list">
        <a class="campaign-card" href="/event/autumn-reward">
          <h3>指定通路最高 3.5% 回饋</h3>
          <p>活動時間：2026-10-01 至 2026-10-31，消費滿 500 元享 3.5% 回饋。</p>
        </a>
      </div>
    `);

    const results = await createJkoPayImporter(fetchPage).import();

    expect(fetchPage).toHaveBeenCalledWith('https://mkt.jkopay.com/campaign/newevent');
    expect(results).toEqual([
      expect.objectContaining({
        sourceFingerprint: 'jko-pay:https://mkt.jkopay.com/event/autumn-reward',
        sourceUrl: 'https://mkt.jkopay.com/event/autumn-reward',
        sourceTitle: '指定通路最高 3.5% 回饋',
        parsedCashbackRate: 0.035,
        parsedAmountThreshold: 500,
        parsedValidityStart: new Date('2026-10-01T00:00:00.000Z'),
        parsedValidityEnd: new Date('2026-10-31T23:59:59.999Z')
      })
    ]);
    expect(results[0].sourceContent).not.toHaveLength(0);
  });

  test('does not parse age eligibility text as an amount threshold', async () => {
    const fetchPage = jest.fn().mockResolvedValue(`
      <div class="campaign-list">
        <a class="campaign-card" href="/event/adult-only-bonus">
          <h3>成年會員活動</h3>
          <p>年滿 18 歲以上可參加，活動期間 2026-10-01 至 2026-10-31 享 3% 回饋。</p>
        </a>
      </div>
    `);

    const [result] = await createJkoPayImporter(fetchPage).import();

    expect(result.parsedCashbackRate).toBe(0.03);
    expect(result.parsedAmountThreshold).toBeUndefined();
  });

  test('leaves unparseable iPASS MONEY fields undefined instead of guessing', async () => {
    const fetchPage = jest.fn().mockResolvedValue(`
      <ul class="news-list">
        <li>
          <a class="news-card" href="/Preferential/Detail/9999">
            <h3>秋季活動公告</h3>
            <p>詳見活動頁說明，回饋與期限依各合作通路公告為準。</p>
          </a>
        </li>
      </ul>
    `);

    const results = await createIpassMoneyImporter(fetchPage).import();

    expect(fetchPage).toHaveBeenCalledWith('https://www.i-pass.com.tw/Preferential');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      sourceFingerprint: 'ipass-money:https://www.i-pass.com.tw/Preferential/Detail/9999',
      sourceUrl: 'https://www.i-pass.com.tw/Preferential/Detail/9999',
      sourceTitle: '秋季活動公告'
    });
    expect(results[0].parsedCashbackRate).toBeUndefined();
    expect(results[0].parsedAmountThreshold).toBeUndefined();
    expect(results[0].parsedValidityStart).toBeUndefined();
    expect(results[0].parsedValidityEnd).toBeUndefined();
    expect(results[0].sourceContent).not.toHaveLength(0);
  });

  test('rejects unsupported adapter source keys', () => {
    expect(() => getPromotionSourceAdapter('unknown-source' as never)).toThrow(RepositoryValidationError);
    expect(() => getPromotionSourceAdapter('unknown-source' as never)).toThrow('unsupported source');
  });
});
