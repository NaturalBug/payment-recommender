import prisma from '../lib/prisma';
import { RepositoryValidationError } from '../repositories/errors';
import { fetchOfficialPage, getPromotionSourceAdapter } from '../importers';
import { createIpassMoneyImporter } from '../importers/ipassMoneyImporter';
import { createJkoPayImporter } from '../importers/jkoPayImporter';
import { createLinePayImporter } from '../importers/linePayImporter';
import { listImportRuns, listPromotionDrafts } from '../repositories/promotionImportRepository';
import type { PromotionSourceAdapter } from '../importers/types';
import { runPromotionImport } from '../services/promotionImportService';

function createJkoListingPage(items: Array<Record<string, unknown>>): string {
  const flightPayload = `8:${JSON.stringify([
    [
      '$',
      '$L16',
      null,
      {
        data: {
          dataType: 'event',
          schema: [],
          values: {
            'zh-TW': {
              campaignList: {
                items
              }
            }
          }
        }
      }
    ]
  ])}\n`;

  return `<script>self.__next_f.push([1,${JSON.stringify(flightPayload)}])</script>`;
}

describe('promotion import service', () => {
  beforeEach(async () => {
    await prisma.promotion.deleteMany();
    await prisma.promotionDraft.deleteMany();
    await prisma.rewardRule.deleteMany();
    await prisma.merchantBranch.deleteMany();
    await prisma.outlet.deleteMany();
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

  test('does not import LINE Pay footer links as promotion drafts', async () => {
    const fetchPage = jest.fn().mockResolvedValue(`
      <section>
        <a class="activity-card" href="/portal/tw/about/promotions/summer-fest">
          <h2>夏日回饋最高 5%</h2>
          <p>活動期間 2026/09/01 - 2026/09/30，單筆滿 NT$300 享 5% 回饋。</p>
        </a>
      </section>
      <footer>
        <a href="/portal/tw-lpm"><span>LINE Pay Money</span></a>
      </footer>
    `);

    const results = await createLinePayImporter(fetchPage).import();

    expect(results.map(({ sourceUrl }) => sourceUrl)).toEqual([
      'https://pay.line.me/portal/tw/about/promotions/summer-fest'
    ]);
  });

  test('decodes HTML entities only once in captured promotion text', async () => {
    const fetchPage = jest.fn().mockResolvedValue(`
      <section>
        <a class="activity-card" href="/portal/tw/about/promotions/literal-markup">
          <h2>Literal &amp;lt;b&amp;gt; text in promotion title</h2>
          <p>活動期間 2026/09/01 - 2026/09/30，享 5% 回饋。</p>
        </a>
      </section>
    `);

    const [result] = await createLinePayImporter(fetchPage).import();

    expect(result.sourceTitle).toBe('Literal &lt;b&gt; text in promotion title');
  });

  test('removes script content when closing tags contain whitespace', async () => {
    const fetchPage = jest.fn().mockResolvedValue(`
      <section>
        <a class="activity-card" href="/portal/tw/about/promotions/no-script-text">
          <h2>Promotion title with enough ordinary visible text</h2>
          <p>活動期間 2026/09/01 - 2026/09/30，享 5% 回饋。</p>
          <script>secretScriptMarker()</script >
        </a>
      </section>
    `);

    const [result] = await createLinePayImporter(fetchPage).import();

    expect(result.sourceContent).not.toContain('secretScriptMarker');
  });

  test('removes script content when closing tags contain ignored end-tag text', async () => {
    const fetchPage = jest.fn().mockResolvedValue(`
      <section>
        <a class="activity-card" href="/portal/tw/about/promotions/no-script-end-tag-text">
          <h2>Promotion title with enough ordinary visible text</h2>
          <p>活動期間 2026/09/01 - 2026/09/30，享 5% 回饋。</p>
          <script>secretScriptMarker()</script
            bar>
        </a>
      </section>
    `);

    const [result] = await createLinePayImporter(fetchPage).import();

    expect(result.sourceContent).not.toContain('secretScriptMarker');
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

  test('normalizes JKO Pay server-rendered campaign data into a deterministic candidate', async () => {
    const fetchPage = jest.fn().mockResolvedValue(
      createJkoListingPage([
        {
          mainTitle: { text: '指定通路最高 3.5% 回饋' },
          subtitle: { text: '消費滿 500 元享回饋' },
          urlOpenType: { value: 'https://mkt.jkopay.com/zh-TW/event/autumn-reward' },
          showTime: ['2026-10-01T00:00', '2026-10-31T23:59'],
          head: { text: '2026/10/01 - 10/31' }
        }
      ])
    );

    const results = await createJkoPayImporter(fetchPage).import();

    expect(fetchPage).toHaveBeenCalledWith('https://mkt.jkopay.com/zh-TW/campaign/newevent');
    expect(results).toEqual([
      expect.objectContaining({
        sourceFingerprint: 'jko-pay:https://mkt.jkopay.com/zh-TW/event/autumn-reward',
        sourceUrl: 'https://mkt.jkopay.com/zh-TW/event/autumn-reward',
        sourceTitle: '指定通路最高 3.5% 回饋',
        parsedCashbackRate: 0.035,
        parsedAmountThreshold: 500,
        parsedValidityStart: new Date('2026-10-01T00:00:00.000Z'),
        parsedValidityEnd: new Date('2026-10-31T23:59:59.999Z')
      })
    ]);
    expect(results[0].sourceContent).not.toHaveLength(0);
  });

  test('ignores JKO Pay campaign records pointing outside official event paths', async () => {
    const fetchPage = jest.fn().mockResolvedValue(
      createJkoListingPage([
        {
          mainTitle: { text: '外部活動連結不應匯入' },
          subtitle: { text: '最高 5% 回饋' },
          urlOpenType: { value: 'https://example.com/promotion' }
        },
        {
          mainTitle: { text: 'JKO Pay 導覽項目不應匯入' },
          subtitle: { text: '官方其他頁面' },
          urlOpenType: { value: 'https://mkt.jkopay.com/zh-TW/about' }
        },
        {
          mainTitle: { text: '指定通路回饋活動' },
          subtitle: { text: '最高 5% 回饋' },
          urlOpenType: { value: 'https://mkt.jkopay.com/zh-TW/event/official-promotion' }
        }
      ])
    );

    const results = await createJkoPayImporter(fetchPage).import();

    expect(results.map(({ sourceUrl }) => sourceUrl)).toEqual([
      'https://mkt.jkopay.com/zh-TW/event/official-promotion'
    ]);
  });

  test('expands JKO Pay abbreviated date ranges when the end year is omitted', async () => {
    const fetchPage = jest.fn().mockResolvedValue(
      createJkoListingPage([
        {
          mainTitle: { text: '牌照稅繳費回饋' },
          subtitle: { text: '繳費滿千現領 2%' },
          urlOpenType: { value: 'https://mkt.jkopay.com/zh-TW/campaign/jkopayebill' },
          head: { text: '2026/10/1 - 11/2' }
        }
      ])
    );

    const [result] = await createJkoPayImporter(fetchPage).import();

    expect(result.parsedValidityStart).toEqual(new Date('2026-10-01T00:00:00.000Z'));
    expect(result.parsedValidityEnd).toEqual(new Date('2026-11-02T23:59:59.999Z'));
  });

  test('does not parse age eligibility text as an amount threshold', async () => {
    const fetchPage = jest.fn().mockResolvedValue(
      createJkoListingPage([
        {
          mainTitle: { text: '成年會員活動' },
          subtitle: { text: '年滿 18 歲以上可參加，活動期間 3% 回饋。' },
          urlOpenType: { value: 'https://mkt.jkopay.com/zh-TW/event/adult-only-bonus' },
          showTime: ['2026-10-01T00:00', '2026-10-31T23:59']
        }
      ])
    );

    const [result] = await createJkoPayImporter(fetchPage).import();

    expect(result.parsedCashbackRate).toBe(0.03);
    expect(result.parsedAmountThreshold).toBeUndefined();
  });

  test('normalizes iPASS MONEY portfolio cards with text-only title links', async () => {
    const fetchPage = jest.fn().mockResolvedValue(`
      <div class="portfolio-item pf-ip pf-lpip isotope-item single-featured-property wow fadeInUp">
        <div class="portfolio-image">
          <a href="/Preferential/Detail/9999" target="_blank">
            <img src="/promotion.png" alt="用 iPASS MONEY 消費，最高享 10% 回饋！">
          </a>
        </div>
        <div class="portfolio-title">
          <h3 title="Minimal Chalkboard">
            <a href="/Preferential/Detail/9999" target="_blank">用 iPASS MONEY 消費，最高享 10% 回饋！</a>
          </h3>
          <span class="labeldate">2026/6/1 (一)</span> ~
          <span class="labeldate">2026/12/31 (四)</span>
          <span class="label3 label-sp2">iPASS MONEY</span>
        </div>
      </div>
    `);

    const results = await createIpassMoneyImporter(fetchPage).import();

    expect(fetchPage).toHaveBeenCalledWith('https://www.i-pass.com.tw/Preferential');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      sourceFingerprint: 'ipass-money:https://www.i-pass.com.tw/Preferential/Detail/9999',
      sourceUrl: 'https://www.i-pass.com.tw/Preferential/Detail/9999',
      sourceTitle: '用 iPASS MONEY 消費，最高享 10% 回饋！',
      parsedCashbackRate: 0.1,
      parsedValidityStart: new Date('2026-06-01T00:00:00.000Z'),
      parsedValidityEnd: new Date('2026-12-31T23:59:59.999Z')
    });
    expect(results[0].parsedAmountThreshold).toBeUndefined();
    expect(results[0].sourceContent).not.toHaveLength(0);
  });

  test('leaves unparseable iPASS MONEY fields undefined instead of guessing', async () => {
    const fetchPage = jest.fn().mockResolvedValue(`
      <div class="portfolio-item">
        <div class="portfolio-title">
          <h3><a href="/Preferential/Detail/9999">秋季活動公告</a></h3>
          <span class="labeldate">活動內容依各合作通路公告為準</span>
          <span class="label3">iPASS MONEY</span>
        </div>
      </div>
    `);

    const results = await createIpassMoneyImporter(fetchPage).import();

    expect(results).toHaveLength(1);
    expect(results[0].sourceTitle).toBe('秋季活動公告');
    expect(results[0].parsedCashbackRate).toBeUndefined();
    expect(results[0].parsedAmountThreshold).toBeUndefined();
    expect(results[0].parsedValidityStart).toBeUndefined();
    expect(results[0].parsedValidityEnd).toBeUndefined();
  });

  test('does not import iPASS MONEY portfolio cards with non-detail links', async () => {
    const fetchPage = jest.fn().mockResolvedValue(`
      <div class="portfolio-item">
        <div class="portfolio-title">
          <h3><a href="https://example.com/promotion">外部優惠活動連結</a></h3>
          <span class="labeldate">2026/6/1 - 2026/6/30</span>
        </div>
      </div>
      <div class="portfolio-item">
        <div class="portfolio-title">
          <h3><a href="/Preferential/Detail/1234">官方優惠活動公告</a></h3>
          <span class="labeldate">2026/6/1 - 2026/6/30</span>
        </div>
      </div>
    `);

    const results = await createIpassMoneyImporter(fetchPage).import();

    expect(results.map(({ sourceUrl }) => sourceUrl)).toEqual([
      'https://www.i-pass.com.tw/Preferential/Detail/1234'
    ]);
  });

  test('rejects unsupported adapter source keys', () => {
    expect(() => getPromotionSourceAdapter('unknown-source' as never)).toThrow(RepositoryValidationError);
    expect(() => getPromotionSourceAdapter('unknown-source' as never)).toThrow('unsupported source');
  });
});
