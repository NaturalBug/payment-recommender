import type { ImportSource } from '../repositories/types';
import type { FetchPage, ImportedPromotionCandidate, PromotionSourceAdapter } from './types';

type SourceImporterConfig = {
  source: ImportSource;
  listUrl: string;
  allowedHostnames: string[];
};

const officialUserAgent = 'payment-recommender-importer/1.0 (+https://github.com/)';

function decodeHtmlEntities(value: string): string {
  const entities: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&quot;': '"',
    '&#39;': "'",
    '&lt;': '<',
    '&gt;': '>'
  };

  return value.replace(/&(?:nbsp|amp|quot|#39|lt|gt);/gi, (entity) => entities[entity.toLowerCase()]);
}

function stripTags(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
}

function normalizeWhitespace(value: string): string {
  return decodeHtmlEntities(value).replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractTitle(innerHtml: string, fallbackText: string): string {
  const headerMatch = innerHtml.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);

  if (headerMatch) {
    const title = normalizeWhitespace(stripTags(headerMatch[1]));

    if (title) {
      return title;
    }
  }

  const [firstSentence] = fallbackText.split(/(?<=[。.!?])\s+/);
  return firstSentence ? firstSentence.slice(0, 120) : fallbackText.slice(0, 120);
}

function parseCashbackRate(sourceContent: string): number | undefined {
  const match = sourceContent.match(/(\d+(?:\.\d+)?)\s*%/);

  if (!match) {
    return undefined;
  }

  return Number(match[1]) / 100;
}

function parseAmountThreshold(sourceContent: string): number | undefined {
  const match =
    sourceContent.match(/(?:單筆滿|消費滿|滿額)\s*(?:NT\$|NTD\$?|新臺幣)?\s*([0-9][0-9,]*)\s*元?/i) ??
    sourceContent.match(/滿\s*(?:NT\$|NTD\$?|新臺幣)\s*([0-9][0-9,]*)\s*元?/i) ??
    sourceContent.match(/滿\s*([0-9][0-9,]*)\s*元/i);

  if (!match) {
    return undefined;
  }

  return Number(match[1].replace(/,/g, ''));
}

function createUtcDate(year: number, month: number, day: number, endOfDay = false): Date {
  return new Date(
    Date.UTC(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0)
  );
}

function parseDateRange(sourceContent: string): Pick<
  ImportedPromotionCandidate,
  'parsedValidityStart' | 'parsedValidityEnd'
> {
  const match = sourceContent.match(
    /(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})\s*(?:至|到|-|~|－|—)\s*(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})/
  );

  if (!match) {
    return {};
  }

  const [, startYear, startMonth, startDay, endYear, endMonth, endDay] = match;

  return {
    parsedValidityStart: createUtcDate(Number(startYear), Number(startMonth), Number(startDay)),
    parsedValidityEnd: createUtcDate(Number(endYear), Number(endMonth), Number(endDay), true)
  };
}

function buildOfficialUrl(url: string, allowedHostnames: string[]): URL {
  const parsedUrl = new URL(url);

  if (parsedUrl.protocol !== 'https:' || !allowedHostnames.includes(parsedUrl.hostname)) {
    throw new Error(`unsupported official url: ${url}`);
  }

  return parsedUrl;
}

function resolveOfficialCardUrl(listUrl: string, href: string, allowedHostnames: string[]): URL | null {
  if (!href || href.startsWith('#') || /^javascript:/i.test(href)) {
    return null;
  }

  const resolvedUrl = new URL(href, listUrl);

  if (resolvedUrl.protocol !== 'https:' || !allowedHostnames.includes(resolvedUrl.hostname)) {
    return null;
  }

  return resolvedUrl;
}

function extractLinkedCards(html: string): Array<{ href: string; innerHtml: string; text: string }> {
  const anchorPattern = /<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  const cards: Array<{ href: string; innerHtml: string; text: string }> = [];

  for (const match of html.matchAll(anchorPattern)) {
    const href = match[2];
    const innerHtml = match[3];
    const text = normalizeWhitespace(stripTags(innerHtml));
    const looksLikeCard = /<(h[1-6]|p|article|section|li|div|span)\b/i.test(innerHtml);

    if (!text || text.length < 12 || !looksLikeCard) {
      continue;
    }

    cards.push({ href, innerHtml, text });
  }

  return cards;
}

function toPromotionCandidate(
  config: SourceImporterConfig,
  listUrl: string,
  card: { href: string; innerHtml: string; text: string }
): ImportedPromotionCandidate | null {
  const sourceUrl = resolveOfficialCardUrl(listUrl, card.href, config.allowedHostnames);

  if (!sourceUrl) {
    return null;
  }

  const sourceContent = card.text;
  const sourceTitle = extractTitle(card.innerHtml, sourceContent);
  const parsedValidity = parseDateRange(sourceContent);

  return {
    sourceFingerprint: `${config.source}:${sourceUrl.toString()}`,
    sourceUrl: sourceUrl.toString(),
    sourceTitle,
    sourceContent,
    fetchedAt: new Date(),
    parsedCashbackRate: parseCashbackRate(sourceContent),
    parsedAmountThreshold: parseAmountThreshold(sourceContent),
    ...parsedValidity
  };
}

export async function fetchOfficialPage(url: string): Promise<string> {
  buildOfficialUrl(url, [new URL(url).hostname]);

  const response = await fetch(url, {
    headers: {
      'User-Agent': officialUserAgent
    },
    redirect: 'manual'
  });

  if (response.status >= 300 && response.status < 400) {
    throw new Error(`failed to fetch ${url}: redirects are not allowed`);
  }

  if (!response.ok) {
    throw new Error(`failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

export function createPromotionSourceAdapter(
  config: SourceImporterConfig,
  fetchPage?: FetchPage
): PromotionSourceAdapter {
  const listUrl = buildOfficialUrl(config.listUrl, config.allowedHostnames).toString();
  const fetchConfiguredPage = fetchPage ?? ((pageUrl: string) => fetchOfficialPage(pageUrl));

  return {
    source: config.source,
    async import() {
      const html = await fetchConfiguredPage(listUrl);

      return extractLinkedCards(html)
        .map((card) => toPromotionCandidate(config, listUrl, card))
        .filter((candidate): candidate is ImportedPromotionCandidate => candidate !== null);
    }
  };
}
