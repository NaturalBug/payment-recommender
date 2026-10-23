import {
  createPromotionSourceAdapter,
  fetchOfficialPage,
  normalizeHtmlText,
  type ExtractedPromotionCard,
  type PromotionCardExtractor
} from './shared';
import type { FetchPage, PromotionSourceAdapter } from './types';

const jkoPayConfig = {
  source: 'jko-pay' as const,
  listUrl: 'https://mkt.jkopay.com/zh-TW/campaign/newevent',
  allowedHostnames: ['mkt.jkopay.com'],
  allowedPathPrefixes: ['/zh-TW/campaign/', '/campaign/', '/zh-TW/event/', '/event/']
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getText(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.text !== 'string') {
    return undefined;
  }

  return value.text.trim() || undefined;
}

function getEventPageValues(value: unknown): JsonRecord | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const values = getEventPageValues(item);

      if (values) {
        return values;
      }
    }

    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  if (value.dataType === 'event' && Array.isArray(value.schema) && isRecord(value.values)) {
    return value.values;
  }

  for (const item of Object.values(value)) {
    const values = getEventPageValues(item);

    if (values) {
      return values;
    }
  }

  return undefined;
}

function getDateRange(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length < 2 || typeof value[0] !== 'string' || typeof value[1] !== 'string') {
    return undefined;
  }

  const start = value[0].match(/^(\d{4})-(\d{2})-(\d{2})/);
  const end = value[1].match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (!start || !end) {
    return undefined;
  }

  return `${start[1]}/${start[2]}/${start[3]} - ${end[1]}/${end[2]}/${end[3]}`;
}

function normalizeHeadDateRange(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(
    /(\d{4})\/(\d{1,2})\/(\d{1,2})\s*[-~－—]\s*(?:(\d{4})\/)?(\d{1,2})\/(\d{1,2})/
  );

  if (!match) {
    return undefined;
  }

  const [, startYear, startMonth, startDay, explicitEndYear, endMonth, endDay] = match;
  const endYear = explicitEndYear ?? String(Number(startYear) + (Number(endMonth) < Number(startMonth) ? 1 : 0));

  return `${startYear}/${startMonth}/${startDay} - ${endYear}/${endMonth}/${endDay}`;
}

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function addCampaignCards(value: unknown, cards: Map<string, ExtractedPromotionCard>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      addCampaignCards(item, cards);
    }

    return;
  }

  if (!isRecord(value)) {
    return;
  }

  const title = getText(value.mainTitle);
  const subtitle = getText(value.subtitle);
  const headDate = getText(value.head);
  const link = isRecord(value.urlOpenType) ? value.urlOpenType.value : undefined;

  if (title && typeof link === 'string' && link.trim()) {
    const details = [subtitle, getDateRange(value.showTime) ?? normalizeHeadDateRange(headDate) ?? headDate]
      .filter(Boolean)
      .join(' ');
    const innerHtml = `<h3>${escapeHtmlText(title)}</h3><p>${escapeHtmlText(details)}</p>`;
    const text = normalizeHtmlText(innerHtml);

    if (!cards.has(link)) {
      cards.set(link, { href: link, innerHtml, text });
    }
  }

  for (const item of Object.values(value)) {
    addCampaignCards(item, cards);
  }
}

const nextFlightScriptPattern =
  /self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)/g;

const jkoPayCardExtractor: PromotionCardExtractor = (html) => {
  const cards = new Map<string, ExtractedPromotionCard>();
  let foundEventPage = false;

  for (const scriptMatch of html.matchAll(nextFlightScriptPattern)) {
    const payload: unknown = JSON.parse(scriptMatch[1]);

    if (typeof payload !== 'string') {
      continue;
    }

    for (const line of payload.split('\n')) {
      const rowMatch = line.match(/^\d+:(\s*[\[{].*)$/);

      if (!rowMatch) {
        continue;
      }

      const row: unknown = JSON.parse(rowMatch[1]);
      const values = getEventPageValues(row);

      if (values) {
        foundEventPage = true;
        addCampaignCards(values, cards);
      }
    }
  }

  if (!foundEventPage) {
    throw new Error('JKO Pay campaign data was not found in the official page');
  }

  return [...cards.values()];
};

export function createJkoPayImporter(fetchPage: FetchPage = fetchOfficialPage): PromotionSourceAdapter {
  return createPromotionSourceAdapter(jkoPayConfig, fetchPage, jkoPayCardExtractor);
}
