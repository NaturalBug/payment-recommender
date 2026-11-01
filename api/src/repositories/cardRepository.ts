import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { normalizeMerchantName } from '../lib/normalization';
import {
  RepositoryConflictError,
  RepositoryNotFoundError,
  RepositoryValidationError
} from './errors';

export type IssuerRecord = {
  id: number;
  name: string;
};

export type CardRecord = {
  id: number;
  name: string;
  kind: string;
  issuerId: number;
  networkIds: number[];
};

export type RecommendationCardRecord = CardRecord & {
  issuerName: string;
};

export type MerchantCardRules = {
  issuerIdsByNetwork: Record<number, number[]>;
  excludedCardIds: number[];
};

export type MerchantCardRulesInput = MerchantCardRules;

export type ReplaceMerchantCardRulesOptions = {
  expectedCurrentRules?: MerchantCardRulesInput;
};

const issuerSelect = {
  id: true,
  name: true
} as const;

const cardSelect = {
  id: true,
  name: true,
  kind: true,
  issuerId: true,
  networks: { orderBy: { networkId: 'asc' }, select: { networkId: true } }
} as const;

function toCardRecord<T extends { networks: Array<{ networkId: number }> }>(
  card: T
): Omit<T, 'networks'> & { networkIds: number[] } {
  const { networks, ...rest } = card;
  return { ...rest, networkIds: networks.map((network) => network.networkId) };
}

export async function listIssuers(): Promise<IssuerRecord[]> {
  return prisma.issuer.findMany({
    orderBy: { name: 'asc' },
    select: issuerSelect
  });
}

export async function createIssuer(name: string): Promise<IssuerRecord> {
  const trimmedName = name.trim();
  const normalizedName = normalizeMerchantName(trimmedName);
  if (!normalizedName) {
    throw new RepositoryValidationError('issuer name is required');
  }

  const existingIssuers = await prisma.issuer.findMany({
    select: { id: true, name: true }
  });
  if (existingIssuers.some((issuer) => normalizeMerchantName(issuer.name) === normalizedName)) {
    throw new RepositoryConflictError('issuer already exists');
  }

  try {
    return await prisma.issuer.create({
      data: { name: trimmedName, normalizedName },
      select: issuerSelect
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new RepositoryConflictError('issuer already exists');
    }

    throw error;
  }
}

export async function deleteIssuer(id: number): Promise<boolean> {
  try {
    await prisma.issuer.delete({ where: { id } });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return false;
      }

      if (error.code === 'P2003') {
        throw new RepositoryConflictError('issuer has dependent catalog or promotion records');
      }
    }

    throw error;
  }
}

export async function listCards(): Promise<CardRecord[]> {
  const cards = await prisma.card.findMany({
    orderBy: [{ issuerId: 'asc' }, { name: 'asc' }],
    select: cardSelect
  });

  return cards.map(toCardRecord);
}

export async function listRecommendationCards(): Promise<RecommendationCardRecord[]> {
  const cards = await prisma.card.findMany({
    orderBy: [{ issuerId: 'asc' }, { name: 'asc' }],
    select: {
      ...cardSelect,
      issuer: { select: { name: true } }
    }
  });

  return cards.map(({ issuer, ...card }) => ({
    ...toCardRecord(card),
    issuerName: issuer.name
  }));
}

export async function createCard(input: {
  name: string;
  kind: string;
  issuerId: number;
  networkIds: number[];
}): Promise<CardRecord> {
  const name = input.name.trim();
  if (!name) {
    throw new RepositoryValidationError('card name is required');
  }
  if (!['credit', 'debit', 'prepaid'].includes(input.kind)) {
    throw new RepositoryValidationError('card kind must be credit, debit, or prepaid');
  }
  const networkIds = [...new Set(input.networkIds)].sort((a, b) => a - b);
  if (networkIds.length === 0 || networkIds.length !== input.networkIds.length) {
    throw new RepositoryValidationError('card networks must be a non-empty list without duplicates');
  }

  return prisma.$transaction(async (transaction) => {
    const issuer = await transaction.issuer.findUnique({
      where: { id: input.issuerId },
      select: { id: true }
    });
    if (!issuer) {
      throw new RepositoryValidationError('issuer is invalid');
    }

    const networkLock = await transaction.paymentMethod.updateMany({
      where: { id: { in: networkIds }, type: 'credit_card' },
      data: { type: 'credit_card' }
    });
    if (networkLock.count !== networkIds.length) {
      throw new RepositoryValidationError('networks must be existing credit-card payment methods');
    }

    try {
      return toCardRecord(await transaction.card.create({
        data: {
          name,
          kind: input.kind,
          issuerId: input.issuerId,
          networks: { create: networkIds.map((networkId) => ({ networkId })) }
        },
        select: cardSelect
      }));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new RepositoryConflictError('card already exists for this issuer');
        }
        if (error.code === 'P2003') {
          throw new RepositoryValidationError('issuer or network is invalid');
        }
      }

      throw error;
    }
  });
}

export async function deleteCard(id: number): Promise<boolean> {
  try {
    await prisma.card.delete({ where: { id } });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return false;
      }

      if (error.code === 'P2003') {
        throw new RepositoryConflictError('card has dependent merchant or promotion records');
      }
    }

    throw error;
  }
}

export async function getMerchantCardRules(merchantId: number): Promise<MerchantCardRules> {
  return prisma.$transaction(async (transaction) => {
    const merchant = await transaction.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true }
    });
    if (!merchant) {
      throw new RepositoryNotFoundError('merchant not found');
    }

    const [restrictions, exclusions] = await Promise.all([
      transaction.merchantIssuerRestriction.findMany({
        where: { merchantId },
        orderBy: [{ networkId: 'asc' }, { issuerId: 'asc' }],
        select: { networkId: true, issuerId: true }
      }),
      transaction.merchantCardExclusion.findMany({
        where: { merchantId },
        orderBy: { cardId: 'asc' },
        select: { cardId: true }
      })
    ]);

    const issuerIdsByNetwork: Record<number, number[]> = {};
    for (const restriction of restrictions) {
      issuerIdsByNetwork[restriction.networkId] ??= [];
      issuerIdsByNetwork[restriction.networkId].push(restriction.issuerId);
    }

    return {
      issuerIdsByNetwork,
      excludedCardIds: exclusions.map((exclusion) => exclusion.cardId)
    };
  });
}

function assertUniquePositiveIds(ids: number[], fieldName: string): void {
  if (
    !Array.isArray(ids) ||
    ids.some((id) => !Number.isInteger(id) || id <= 0) ||
    new Set(ids).size !== ids.length
  ) {
    throw new RepositoryValidationError(`${fieldName} must contain unique positive integer IDs`);
  }
}

function normalizeRulesForComparison(rules: MerchantCardRulesInput): MerchantCardRules {
  const issuerIdsByNetwork: Record<number, number[]> = {};
  for (const [networkKey, issuerIds] of Object.entries(rules.issuerIdsByNetwork ?? {})) {
    const networkId = Number(networkKey);
    if (!Number.isSafeInteger(networkId) || networkId <= 0) {
      continue;
    }
    const uniqueSorted = [...new Set((issuerIds ?? []).filter((id) => Number.isInteger(id) && id > 0))].sort(
      (a, b) => a - b
    );
    if (uniqueSorted.length > 0) {
      issuerIdsByNetwork[networkId] = uniqueSorted;
    }
  }

  const excludedCardIds = [...new Set((rules.excludedCardIds ?? []).filter((id) => Number.isInteger(id) && id > 0))].sort(
    (a, b) => a - b
  );

  return { issuerIdsByNetwork, excludedCardIds };
}

function sameRules(left: MerchantCardRulesInput, right: MerchantCardRulesInput): boolean {
  const normalizedLeft = normalizeRulesForComparison(left);
  const normalizedRight = normalizeRulesForComparison(right);
  return JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight);
}

export async function replaceMerchantCardRules(
  merchantId: number,
  rules: MerchantCardRulesInput,
  options?: ReplaceMerchantCardRulesOptions
): Promise<MerchantCardRules> {
  return prisma.$transaction(async (transaction) => {
    const merchant = await transaction.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true }
    });
    if (!merchant) {
      throw new RepositoryNotFoundError('merchant not found');
    }

    if (!rules || typeof rules !== 'object' || !rules.issuerIdsByNetwork || !Array.isArray(rules.excludedCardIds)) {
      throw new RepositoryValidationError('card rules are invalid');
    }

    const networkEntries = Object.entries(rules.issuerIdsByNetwork).map(([networkKey, issuerIds]) => {
      const networkId = Number(networkKey);
      if (!/^[1-9]\d*$/.test(networkKey) || !Number.isSafeInteger(networkId)) {
        throw new RepositoryValidationError('issuer allowlist network IDs must be positive integers');
      }
      assertUniquePositiveIds(issuerIds, 'issuer allowlist');
      return { networkId, issuerIds };
    });
    assertUniquePositiveIds(rules.excludedCardIds, 'excluded cards');

    for (const { networkId, issuerIds: allowedIssuerIds } of networkEntries) {
      if (allowedIssuerIds.length === 0) {
        continue;
      }

      const acceptance = await transaction.merchantPaymentAcceptance.findUnique({
        where: { merchantId_paymentMethodId: { merchantId, paymentMethodId: networkId } },
        select: { paymentMethod: { select: { type: true } } }
      });
      if (!acceptance || acceptance.paymentMethod.type !== 'credit_card') {
        throw new RepositoryValidationError(
          'issuer restriction network must be an accepted credit-card payment method'
        );
      }
    }

    const issuerIds = [...new Set(networkEntries.flatMap((entry) => entry.issuerIds))];
    if (issuerIds.length > 0) {
      const existingIssuerCount = await transaction.issuer.count({ where: { id: { in: issuerIds } } });
      if (existingIssuerCount !== issuerIds.length) {
        throw new RepositoryValidationError('issuer allowlist contains an unknown issuer ID');
      }
    }

    if (rules.excludedCardIds.length > 0) {
      const existingCardCount = await transaction.card.count({
        where: { id: { in: rules.excludedCardIds } }
      });
      if (existingCardCount !== rules.excludedCardIds.length) {
        throw new RepositoryValidationError('excluded cards contain an unknown card ID');
      }
    }

    if (options?.expectedCurrentRules) {
      const [currentRestrictions, currentExclusions] = await Promise.all([
        transaction.merchantIssuerRestriction.findMany({
          where: { merchantId },
          orderBy: [{ networkId: 'asc' }, { issuerId: 'asc' }],
          select: { networkId: true, issuerId: true }
        }),
        transaction.merchantCardExclusion.findMany({
          where: { merchantId },
          orderBy: { cardId: 'asc' },
          select: { cardId: true }
        })
      ]);
      const currentRules: MerchantCardRules = {
        issuerIdsByNetwork: {},
        excludedCardIds: currentExclusions.map((exclusion) => exclusion.cardId)
      };
      for (const restriction of currentRestrictions) {
        currentRules.issuerIdsByNetwork[restriction.networkId] ??= [];
        currentRules.issuerIdsByNetwork[restriction.networkId].push(restriction.issuerId);
      }

      if (!sameRules(currentRules, options.expectedCurrentRules)) {
        throw new RepositoryConflictError('card rules changed; reload and retry');
      }
    }

    await transaction.merchantIssuerRestriction.deleteMany({ where: { merchantId } });
    await transaction.merchantCardExclusion.deleteMany({ where: { merchantId } });

    for (const { networkId, issuerIds: allowedIssuerIds } of networkEntries) {
      for (const issuerId of allowedIssuerIds) {
        await transaction.merchantIssuerRestriction.create({
          data: { merchantId, networkId, issuerId }
        });
      }
    }
    for (const cardId of rules.excludedCardIds) {
      await transaction.merchantCardExclusion.create({
        data: { merchantId, cardId }
      });
    }

    return {
      issuerIdsByNetwork: Object.fromEntries(
        networkEntries.filter((entry) => entry.issuerIds.length > 0).map((entry) => [entry.networkId, entry.issuerIds])
      ),
      excludedCardIds: rules.excludedCardIds
    };
  });
}
