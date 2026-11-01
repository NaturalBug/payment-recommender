import prisma from '../lib/prisma';
import {
  createCard,
  createIssuer,
  deleteCard,
  deleteIssuer,
  getMerchantCardRules,
  listCards,
  listIssuers,
  listRecommendationCards,
  replaceMerchantCardRules
} from '../repositories/cardRepository';
import { Prisma, PrismaClient } from '@prisma/client';
import { RepositoryConflictError, RepositoryValidationError } from '../repositories/errors';
import { updatePaymentMethod } from '../repositories/paymentMethodRepository';

async function createNetwork(name = 'Visa') {
  return prisma.paymentMethod.create({
    data: { name, normalizedName: name.toLowerCase(), type: 'credit_card' }
  });
}

async function createTestIssuer(name = 'Example Bank') {
  return prisma.issuer.create({
    data: { name, normalizedName: name.toLowerCase() }
  });
}

describe('card schema', () => {
  const concurrentPrisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    }
  });

  beforeEach(async () => {
    await prisma.promotion.deleteMany();
    await prisma.promotionDraft.deleteMany();
    await prisma.importRun.deleteMany();
    await prisma.rewardRule.deleteMany();
    await prisma.merchantIssuerRestriction.deleteMany();
    await prisma.merchantPaymentAcceptance.deleteMany();
    await prisma.merchantCardExclusion.deleteMany();
    await prisma.merchant.deleteMany();
    await prisma.card.deleteMany();
    await prisma.issuer.deleteMany();
    await prisma.paymentMethod.deleteMany();
  });

  afterAll(async () => {
    await concurrentPrisma.$disconnect();
    await prisma.$disconnect();
  });

  test('persists a card linked to an issuer and a network payment method', async () => {
    const network = await createNetwork();
    const issuer = await createTestIssuer();
    const card = await prisma.card.create({
      data: { issuerId: issuer.id, networks: { create: [{ networkId: network.id }] }, name: 'Example Platinum', kind: 'credit' },
      include: { networks: true }
    });

    expect(card).toMatchObject({ issuerId: issuer.id, kind: 'credit', networks: [{ networkId: network.id }] });
  });

  test('persists merchant restrictions and promotion issuer/card scopes', async () => {
    const network = await createNetwork();
    const issuer = await createTestIssuer();
    const card = await prisma.card.create({
      data: { issuerId: issuer.id, networks: { create: [{ networkId: network.id }] }, name: 'Example Debit', kind: 'debit' }
    });
    const merchant = await prisma.merchant.create({
      data: { name: 'Cafe', normalizedName: 'cafe' }
    });
    const run = await prisma.importRun.create({ data: { source: 'test', status: 'completed' } });
    const draft = await prisma.promotionDraft.create({
      data: {
        importRunId: run.id,
        source: 'test',
        sourceFingerprint: 'card-scope',
        sourceUrl: 'https://example.com',
        sourceTitle: 'Title',
        sourceContent: 'Content',
        fetchedAt: new Date('2026-01-01'),
        issuers: { create: { issuerId: issuer.id } },
        cards: { create: { cardId: card.id } }
      }
    });
    const promotion = await prisma.promotion.create({
      data: {
        sourceDraftId: draft.id,
        originType: 'merchant',
        eligibilityType: 'all',
        benefitType: 'cashback',
        amountThreshold: 0,
        validityStart: new Date('2026-01-01'),
        validityEnd: new Date('2026-12-31'),
        sourceUrl: 'https://example.com',
        sourceTitle: 'Title',
        issuers: { create: { issuerId: issuer.id } },
        cards: { create: { cardId: card.id } }
      }
    });
    await prisma.merchantPaymentAcceptance.create({
      data: { merchantId: merchant.id, paymentMethodId: network.id }
    });
    await prisma.merchantIssuerRestriction.create({
      data: { merchantId: merchant.id, networkId: network.id, issuerId: issuer.id }
    });
    await prisma.merchantCardExclusion.create({
      data: { merchantId: merchant.id, cardId: card.id }
    });

    expect(await prisma.promotionDraftIssuer.count({ where: { draftId: draft.id } })).toBe(1);
    expect(await prisma.promotionCard.count({ where: { promotionId: promotion.id } })).toBe(1);
    expect(await prisma.merchantIssuerRestriction.count()).toBe(1);
    expect(await prisma.merchantCardExclusion.count()).toBe(1);
  });

  test('rejects an issuer restriction for a network the merchant does not accept', async () => {
    const network = await createNetwork();
    const issuer = await createTestIssuer();
    const merchant = await prisma.merchant.create({
      data: { name: 'Cafe', normalizedName: 'cafe' }
    });

    await expect(
      prisma.merchantIssuerRestriction.create({
        data: { merchantId: merchant.id, networkId: network.id, issuerId: issuer.id }
      })
    ).rejects.toThrow();
  });

  test('rejects deleting accepted network while issuer restrictions exist at DB level', async () => {
    const network = await createNetwork();
    const issuer = await createTestIssuer();
    const merchant = await prisma.merchant.create({
      data: { name: 'Cafe', normalizedName: 'cafe' }
    });
    await prisma.merchantPaymentAcceptance.create({
      data: { merchantId: merchant.id, paymentMethodId: network.id }
    });
    await prisma.merchantIssuerRestriction.create({
      data: { merchantId: merchant.id, networkId: network.id, issuerId: issuer.id }
    });

    await expect(
      prisma.merchantPaymentAcceptance.delete({
        where: { merchantId_paymentMethodId: { merchantId: merchant.id, paymentMethodId: network.id } }
      })
    ).rejects.toThrow();
    await expect(
      prisma.merchantIssuerRestriction.count({
        where: { merchantId: merchant.id, networkId: network.id, issuerId: issuer.id }
      })
    ).resolves.toBe(1);
  });

  test('rejects issuer names that duplicate after normalization', async () => {
    await createIssuer('  Example   Bank ');

    await expect(createIssuer('example bank')).rejects.toBeInstanceOf(RepositoryConflictError);
  });

  test('lists issuers and cards from the catalog', async () => {
    const issuer = await createIssuer('Example Bank');
    const network = await createNetwork();
    const card = await createCard({
      name: 'Example Platinum',
      kind: 'credit',
      issuerId: issuer.id,
      networkIds: [network.id]
    });

    await expect(listIssuers()).resolves.toMatchObject([{ id: issuer.id, name: 'Example Bank' }]);
    await expect(listCards()).resolves.toMatchObject([
      { id: card.id, name: 'Example Platinum', issuerId: issuer.id, networkIds: [network.id] }
    ]);
  });

  test('creates a card linked to an existing issuer and credit-card network', async () => {
    const issuer = await createIssuer('Example Bank');
    const network = await createNetwork();

    await expect(
      createCard({ name: 'Example Platinum', kind: 'credit', issuerId: issuer.id, networkIds: [network.id] })
    ).resolves.toMatchObject({
      name: 'Example Platinum',
      kind: 'credit',
      issuerId: issuer.id,
      networkIds: [network.id]
    });
  });

  test('creates a card with several networks and rejects empty, duplicate, or non-credit-card sets', async () => {
    const issuer = await createIssuer('Example Bank');
    const visa = await createNetwork('Multi Visa');
    const jcb = await createNetwork('Multi JCB');

    await expect(
      createCard({ name: 'Dual', kind: 'credit', issuerId: issuer.id, networkIds: [jcb.id, visa.id] })
    ).resolves.toMatchObject({ networkIds: [visa.id, jcb.id] });
    await expect(listCards()).resolves.toMatchObject([{ name: 'Dual', networkIds: [visa.id, jcb.id] }]);
    await expect(listRecommendationCards()).resolves.toMatchObject([
      { name: 'Dual', issuerName: 'Example Bank', networkIds: [visa.id, jcb.id] }
    ]);

    for (const networkIds of [[], [visa.id, visa.id]]) {
      await expect(
        createCard({ name: 'Bad', kind: 'credit', issuerId: issuer.id, networkIds })
      ).rejects.toBeInstanceOf(RepositoryValidationError);
    }
    await expect(prisma.card.count({ where: { name: 'Bad' } })).resolves.toBe(0);
  });

  test('prevents creating a card when a concurrent network downgrade commits first', async () => {
    const issuer = await createIssuer('Race Bank');
    const network = await createNetwork('Race Visa');
    let releaseLock!: () => void;
    const lockReleased = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    let lockTransactionPromise: Promise<unknown> | null = null;
    const lockReady = new Promise<void>((resolve) => {
      lockTransactionPromise = concurrentPrisma.$transaction(async (transaction) => {
        await transaction.paymentMethod.update({
          where: { id: network.id },
          data: { name: 'Race Visa' }
        });
        resolve();
        await lockReleased;
      });
    });
    await lockReady;

    const downgradePromise = updatePaymentMethod(network.id, {
      name: network.name,
      type: 'mobile_payment'
    });
    await new Promise((resolve) => setImmediate(resolve));
    const creationPromise = createCard({
      name: 'Race Card',
      kind: 'credit',
      issuerId: issuer.id,
      networkIds: [network.id]
    });

    releaseLock();
    await lockTransactionPromise;
    const [downgradeResult, creationResult] = await Promise.allSettled([downgradePromise, creationPromise]);
    const persistedNetwork = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: network.id },
      select: { type: true }
    });
    const cardCount = await prisma.card.count({
      where: { issuerId: issuer.id, networks: { some: { networkId: network.id } }, name: 'Race Card' }
    });

    if (downgradeResult.status === 'fulfilled' && downgradeResult.value) {
      expect(downgradeResult.value.type).toBe('mobile_payment');
      expect(creationResult.status).toBe('rejected');
      if (creationResult.status === 'rejected') {
        expect(creationResult.reason).toBeInstanceOf(RepositoryValidationError);
      }
      expect(persistedNetwork.type).toBe('mobile_payment');
      expect(cardCount).toBe(0);
      return;
    }

    expect(creationResult.status).toBe('fulfilled');
    expect(persistedNetwork.type).toBe('credit_card');
    expect(cardCount).toBe(1);
    expect(downgradeResult.status).toBe('rejected');
    if (downgradeResult.status === 'rejected') {
      expect(downgradeResult.reason).toBeInstanceOf(RepositoryConflictError);
    }
  });

  test('rejects unsupported card kinds', async () => {
    const issuer = await createIssuer('Example Bank');
    const network = await createNetwork();

    await expect(
      createCard({ name: 'Example Platinum', kind: 'charge', issuerId: issuer.id, networkIds: [network.id] })
    ).rejects.toBeInstanceOf(RepositoryValidationError);
  });

  test('rejects unknown issuer IDs when creating cards', async () => {
    const network = await createNetwork();

    await expect(
      createCard({ name: 'Example Platinum', kind: 'credit', issuerId: 9999, networkIds: [network.id] })
    ).rejects.toBeInstanceOf(RepositoryValidationError);
  });

  test('rejects unknown or non-card networks when creating cards', async () => {
    const issuer = await createIssuer('Example Bank');
    const wallet = await prisma.paymentMethod.create({
      data: { name: 'Wallet', normalizedName: 'wallet', type: 'wallet' }
    });

    await expect(
      createCard({ name: 'Example Platinum', kind: 'credit', issuerId: issuer.id, networkIds: [9999] })
    ).rejects.toBeInstanceOf(RepositoryValidationError);
    await expect(
      createCard({ name: 'Example Platinum', kind: 'credit', issuerId: issuer.id, networkIds: [wallet.id] })
    ).rejects.toBeInstanceOf(RepositoryValidationError);
  });

  test('deletes unused catalog records and returns false for missing IDs', async () => {
    const issuer = await createIssuer('Example Bank');
    const network = await createNetwork();
    const card = await createCard({
      name: 'Example Platinum',
      kind: 'credit',
      issuerId: issuer.id,
      networkIds: [network.id]
    });

    await expect(deleteCard(card.id)).resolves.toBe(true);
    await expect(deleteCard(card.id)).resolves.toBe(false);
    await expect(deleteIssuer(issuer.id)).resolves.toBe(true);
    await expect(deleteIssuer(issuer.id)).resolves.toBe(false);
  });

  test('rejects deleting an issuer that still has catalog cards', async () => {
    const issuer = await createIssuer('Example Bank');
    const network = await createNetwork();
    await createCard({ name: 'Example Platinum', kind: 'credit', issuerId: issuer.id, networkIds: [network.id] });

    await expect(deleteIssuer(issuer.id)).rejects.toBeInstanceOf(RepositoryConflictError);
  });

  test('treats an empty issuer allowlist as unrestricted', async () => {
    const network = await createNetwork();
    const merchant = await prisma.merchant.create({
      data: { name: 'Cafe', normalizedName: 'cafe' }
    });
    await prisma.merchantPaymentAcceptance.create({
      data: { merchantId: merchant.id, paymentMethodId: network.id }
    });

    await expect(getMerchantCardRules(merchant.id)).resolves.toEqual({
      issuerIdsByNetwork: {},
      excludedCardIds: []
    });

    await replaceMerchantCardRules(merchant.id, {
      issuerIdsByNetwork: { [network.id]: [] },
      excludedCardIds: []
    });

    await expect(getMerchantCardRules(merchant.id)).resolves.toEqual({
      issuerIdsByNetwork: {},
      excludedCardIds: []
    });
    expect(await prisma.merchantIssuerRestriction.count()).toBe(0);
  });

  test('returns and replaces issuer allowlists and excluded card IDs', async () => {
    const network = await createNetwork();
    const issuer = await createIssuer('Example Bank');
    const card = await createCard({
      name: 'Example Platinum',
      kind: 'credit',
      issuerId: issuer.id,
      networkIds: [network.id]
    });
    const merchant = await prisma.merchant.create({
      data: { name: 'Cafe', normalizedName: 'cafe' }
    });
    await prisma.merchantPaymentAcceptance.create({
      data: { merchantId: merchant.id, paymentMethodId: network.id }
    });

    await replaceMerchantCardRules(merchant.id, {
      issuerIdsByNetwork: { [network.id]: [issuer.id] },
      excludedCardIds: [card.id]
    });

    await expect(getMerchantCardRules(merchant.id)).resolves.toEqual({
      issuerIdsByNetwork: { [network.id]: [issuer.id] },
      excludedCardIds: [card.id]
    });
  });

  test('reads card rules through a single transaction snapshot', async () => {
    const network = await createNetwork('Snapshot Visa');
    const oldIssuer = await createIssuer('Snapshot Bank A');
    const newIssuer = await createIssuer('Snapshot Bank B');
    const oldCard = await createCard({
      name: 'Snapshot Card A',
      kind: 'credit',
      issuerId: oldIssuer.id,
      networkIds: [network.id]
    });
    const newCard = await createCard({
      name: 'Snapshot Card B',
      kind: 'credit',
      issuerId: newIssuer.id,
      networkIds: [network.id]
    });
    const merchant = await prisma.merchant.create({
      data: { name: 'Snapshot Cafe', normalizedName: 'snapshotcafe' }
    });
    await prisma.merchantPaymentAcceptance.create({
      data: { merchantId: merchant.id, paymentMethodId: network.id }
    });
    await replaceMerchantCardRules(merchant.id, {
      issuerIdsByNetwork: { [network.id]: [oldIssuer.id] },
      excludedCardIds: [oldCard.id]
    });
    let releaseBlockedRead!: () => void;
    let unblockRead = new Promise<void>((resolve) => {
      releaseBlockedRead = resolve;
    });
    const middleware: Prisma.Middleware = async (params, next) => {
      if (
        params.model === 'MerchantCardExclusion' &&
        params.action === 'findMany' &&
        params.args?.where?.merchantId === merchant.id
      ) {
        await unblockRead;
      }
      return next(params);
    };
    prisma.$use(middleware);

    const readPromise = getMerchantCardRules(merchant.id);
    await new Promise((resolve) => setImmediate(resolve));
    const writePromise = replaceMerchantCardRules(merchant.id, {
      issuerIdsByNetwork: { [network.id]: [newIssuer.id] },
      excludedCardIds: [newCard.id]
    });
    releaseBlockedRead();
    const [snapshotRead, written] = await Promise.all([readPromise, writePromise]);

    expect(snapshotRead).toEqual({
      issuerIdsByNetwork: { [network.id]: [oldIssuer.id] },
      excludedCardIds: [oldCard.id]
    });
    expect(written).toEqual({
      issuerIdsByNetwork: { [network.id]: [newIssuer.id] },
      excludedCardIds: [newCard.id]
    });
  });

  test('rejects replacing card rules when expected baseline is stale', async () => {
    const network = await createNetwork('Expected Visa');
    const oldIssuer = await createIssuer('Expected Bank A');
    const currentIssuer = await createIssuer('Expected Bank B');
    const oldCard = await createCard({
      name: 'Expected Card A',
      kind: 'credit',
      issuerId: oldIssuer.id,
      networkIds: [network.id]
    });
    const currentCard = await createCard({
      name: 'Expected Card B',
      kind: 'credit',
      issuerId: currentIssuer.id,
      networkIds: [network.id]
    });
    const merchant = await prisma.merchant.create({
      data: { name: 'Expected Cafe', normalizedName: 'expectedcafe' }
    });
    await prisma.merchantPaymentAcceptance.create({
      data: { merchantId: merchant.id, paymentMethodId: network.id }
    });
    await replaceMerchantCardRules(merchant.id, {
      issuerIdsByNetwork: { [network.id]: [currentIssuer.id] },
      excludedCardIds: [currentCard.id]
    });

    await expect(
      replaceMerchantCardRules(
        merchant.id,
        {
          issuerIdsByNetwork: { [network.id]: [oldIssuer.id] },
          excludedCardIds: [oldCard.id]
        },
        {
          expectedCurrentRules: {
            issuerIdsByNetwork: { [network.id]: [oldIssuer.id] },
            excludedCardIds: [oldCard.id]
          }
        }
      )
    ).rejects.toBeInstanceOf(RepositoryConflictError);
    await expect(getMerchantCardRules(merchant.id)).resolves.toEqual({
      issuerIdsByNetwork: { [network.id]: [currentIssuer.id] },
      excludedCardIds: [currentCard.id]
    });
  });

  test('rejects rules targeting a network the merchant does not accept', async () => {
    const network = await createNetwork();
    const unacceptedNetwork = await createNetwork('Mastercard');
    const issuer = await createIssuer('Example Bank');
    const merchant = await prisma.merchant.create({
      data: { name: 'Cafe', normalizedName: 'cafe' }
    });
    await prisma.merchantPaymentAcceptance.create({
      data: { merchantId: merchant.id, paymentMethodId: network.id }
    });
    await replaceMerchantCardRules(merchant.id, {
      issuerIdsByNetwork: { [network.id]: [issuer.id] },
      excludedCardIds: []
    });

    await expect(
      replaceMerchantCardRules(merchant.id, {
        issuerIdsByNetwork: { [unacceptedNetwork.id]: [issuer.id] },
        excludedCardIds: []
      })
    ).rejects.toBeInstanceOf(RepositoryValidationError);
    await expect(getMerchantCardRules(merchant.id)).resolves.toEqual({
      issuerIdsByNetwork: { [network.id]: [issuer.id] },
      excludedCardIds: []
    });
  });

  test('rejects issuer restrictions for an accepted wallet payment method', async () => {
    const wallet = await prisma.paymentMethod.create({
      data: { name: 'Wallet', normalizedName: 'wallet', type: 'wallet' }
    });
    const issuer = await createIssuer('Example Bank');
    const merchant = await prisma.merchant.create({
      data: { name: 'Cafe', normalizedName: 'cafe' }
    });
    await prisma.merchantPaymentAcceptance.create({
      data: { merchantId: merchant.id, paymentMethodId: wallet.id }
    });

    await expect(
      replaceMerchantCardRules(merchant.id, {
        issuerIdsByNetwork: { [wallet.id]: [issuer.id] },
        excludedCardIds: []
      })
    ).rejects.toBeInstanceOf(RepositoryValidationError);
  });

  test('treats an empty issuer list for an accepted wallet as no restriction', async () => {
    const wallet = await prisma.paymentMethod.create({
      data: { name: 'Wallet', normalizedName: 'wallet', type: 'wallet' }
    });
    const merchant = await prisma.merchant.create({
      data: { name: 'Cafe', normalizedName: 'cafe' }
    });
    await prisma.merchantPaymentAcceptance.create({
      data: { merchantId: merchant.id, paymentMethodId: wallet.id }
    });

    await expect(
      replaceMerchantCardRules(merchant.id, {
        issuerIdsByNetwork: { [wallet.id]: [] },
        excludedCardIds: []
      })
    ).resolves.toEqual({ issuerIdsByNetwork: {}, excludedCardIds: [] });
    expect(await prisma.merchantIssuerRestriction.count({ where: { merchantId: merchant.id } })).toBe(0);
  });
});
