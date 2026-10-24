import {
  createPromotionSourceAdapter,
  fetchOfficialPage,
  normalizeHtmlText,
  type ExtractedPromotionCard,
  type PromotionCardExtractor
} from './shared';
import type { FetchPage, PromotionSourceAdapter } from './types';

const ipassMoneyConfig = {
  source: 'ipass-money' as const,
  listUrl: 'https://www.i-pass.com.tw/Preferential',
  allowedHostnames: ['www.i-pass.com.tw'],
  allowedPathPrefixes: ['/Preferential/Detail/']
};

const divWithClassPattern = /<div\b[^>]*\bclass\s*=\s*(["'])([^"']*)\1[^>]*>/gi;

function findDivContentWithClass(html: string, className: string): string | undefined {
  for (const match of html.matchAll(divWithClassPattern)) {
    if (!match[2].split(/\s+/).includes(className)) {
      continue;
    }

    const contentStart = (match.index ?? 0) + match[0].length;
    const closingTag = html.indexOf('</div>', contentStart);

    if (closingTag >= 0) {
      return html.slice(contentStart, closingTag);
    }
  }

  return undefined;
}

function extractItemCards(html: string): ExtractedPromotionCard[] {
  const itemStarts = [...html.matchAll(divWithClassPattern)].filter((match) =>
    match[2].split(/\s+/).includes('portfolio-item')
  );
  const cards: ExtractedPromotionCard[] = [];

  for (let index = 0; index < itemStarts.length; index += 1) {
    const itemStart = itemStarts[index];
    const start = itemStart.index ?? 0;
    const contentStart = start + itemStart[0].length;
    const end = itemStarts[index + 1]?.index ?? html.length;
    const itemHtml = html.slice(contentStart, end);
    const titleSection = findDivContentWithClass(itemHtml, 'portfolio-title');
    const heading = titleSection?.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)?.[1];
    const titleLink = heading?.match(/<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/i);

    if (!titleLink) {
      continue;
    }

    const dateLabels: string[] = [];
    const categoryLabels: string[] = [];

    if (titleSection) {
      for (const spanMatch of titleSection.matchAll(
        /<span\b[^>]*\bclass\s*=\s*(["'])([^"']*)\1[^>]*>([\s\S]*?)<\/span>/gi
      )) {
        const classes = spanMatch[2].split(/\s+/);

        if (classes.includes('labeldate')) {
          dateLabels.push(normalizeHtmlText(spanMatch[3]).replace(/\s*\([^)]*\)\s*$/, ''));
        } else if (classes.includes('label3')) {
          categoryLabels.push(spanMatch[3]);
        }
      }
    }

    const dateText = dateLabels.length === 2 ? dateLabels.join(' - ') : dateLabels.join(' ');
    const details = [dateText, ...categoryLabels].filter(Boolean).join(' ');
    const innerHtml = `<h3>${titleLink[3]}</h3><p>${details}</p>`;
    const text = normalizeHtmlText(innerHtml);
    cards.push({ href: titleLink[2], innerHtml, text });
  }

  return cards;
}

const ipassMoneyCardExtractor: PromotionCardExtractor = extractItemCards;

export function createIpassMoneyImporter(fetchPage: FetchPage = fetchOfficialPage): PromotionSourceAdapter {
  return createPromotionSourceAdapter(ipassMoneyConfig, fetchPage, ipassMoneyCardExtractor);
}
