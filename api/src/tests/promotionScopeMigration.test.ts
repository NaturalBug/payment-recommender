import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

describe('promotion scope schema compatibility', () => {
  test('preserves existing merchant branch IDs and references when adding Outlet schema', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promotion-scope-migration-'));
    const databasePath = path.join(directory, 'legacy.db');
    const databaseUrl = `file:${databasePath}`;
    const prismaCliPath = require.resolve('prisma');
    const legacySchemaPath = path.resolve(__dirname, 'fixtures/promotion-scope-legacy.prisma');
    const currentSchemaPath = path.resolve(__dirname, '../../prisma/schema.prisma');
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

    try {
      const env = { ...process.env, DATABASE_URL: databaseUrl };
      execFileSync(process.execPath, [prismaCliPath, 'db', 'push', '--schema', legacySchemaPath, '--skip-generate'], {
        env,
        stdio: 'pipe'
      });

      const statements = [
        `INSERT INTO Merchant (id, name, normalizedName) VALUES (7, 'Sanyou Cosmetics', 'sanyoucosmetics')`,
        `INSERT INTO PaymentMethod (id, name, normalizedName, type) VALUES (8, 'iPASS MONEY', 'ipassmoney', 'mobile_payment')`,
        `INSERT INTO MerchantPaymentAcceptance (id, merchantId, paymentMethodId) VALUES (9, 7, 8)`,
        `INSERT INTO MerchantOutlet (id, merchantId, name, normalizedName, location)
          VALUES (41, 7, 'Nangang branch', 'nangangbranch', 'Nangang District')`,
        `INSERT INTO RewardRule (
          id, merchantId, paymentMethodId, benefitType, cashbackRate, amountThreshold,
          validityStart, validityEnd, outletId
        ) VALUES (11, 7, 8, 'cashback', 0.05, 0, '2026-10-01', '2026-10-31', 41)`,
        `INSERT INTO ImportRun (id, source, status) VALUES (2, 'ipass-money', 'completed')`,
        `INSERT INTO PromotionDraft (
          id, importRunId, source, sourceFingerprint, sourceUrl, sourceTitle,
          sourceContent, fetchedAt, status, merchantId, paymentMethodId, outletId
        ) VALUES (
          21, 2, 'ipass-money', 'ipass-money:legacy', 'https://example.com/promo',
          'Legacy promotion', 'Legacy source content', '2026-10-01T00:00:00.000Z',
          'pending_review', 7, 8, 41
        )`
      ];
      for (const statement of statements) {
        await prisma.$executeRawUnsafe(statement);
      }

      execFileSync(process.execPath, [prismaCliPath, 'db', 'push', '--schema', currentSchemaPath, '--skip-generate'], {
        env,
        stdio: 'pipe'
      });

      const branches = await prisma.$queryRawUnsafe<Array<{ id: number; merchantId: number; name: string }>>(
        'SELECT id, merchantId, name FROM MerchantOutlet WHERE id = 41'
      );
      const rules = await prisma.$queryRawUnsafe<Array<{ outletId: number }>>(
        'SELECT outletId FROM RewardRule WHERE id = 11'
      );
      const drafts = await prisma.$queryRawUnsafe<Array<{ outletId: number; status: string }>>(
        'SELECT outletId, status FROM PromotionDraft WHERE id = 21'
      );
      const outlets = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
        'SELECT COUNT(*) AS count FROM Outlet'
      );

      expect({
        branch: branches[0],
        rewardBranchId: rules[0]?.outletId,
        draftBranchId: drafts[0]?.outletId,
        draftStatus: drafts[0]?.status,
        outletCount: Number(outlets[0]?.count)
      }).toEqual({
        branch: { id: 41, merchantId: 7, name: 'Nangang branch' },
        rewardBranchId: 41,
        draftBranchId: 41,
        draftStatus: 'pending_review',
        outletCount: 0
      });
    } finally {
      await prisma.$disconnect();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }, 30_000);
});
