import { Router } from 'express';
import prisma from '../lib/prisma';
import { createMerchant, listMerchants } from '../repositories/merchantRepository';
import { createRewardRule, deleteRewardRule, listRewardRules } from '../repositories/rewardRuleRepository';

const router = Router();

function normalizePaymentMethodKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function legacyPaymentMethodId(paymentMethodName: string): string {
  const key = normalizePaymentMethodKey(paymentMethodName);
  const aliases: Record<string, string> = {
    amexgold: 'amex',
    linepay: 'linepay',
    jkopay: 'jko',
    visa: 'visa',
    cash: 'cash'
  };

  return aliases[key] ?? key;
}

function toLegacyRewardRule(rule: Awaited<ReturnType<typeof listRewardRules>>[number], merchantName: string) {
  return {
    id: String(rule.id),
    merchantName,
    paymentMethodId: legacyPaymentMethodId(rule.paymentMethodName),
    cashbackRate: Number(rule.cashbackRate),
    amountThreshold: rule.amountThreshold,
    validityStart: rule.validityStart.toISOString().slice(0, 10),
    validityEnd: rule.validityEnd.toISOString().slice(0, 10),
    promotionNote: rule.promotionNote ?? undefined
  };
}

router.get('/merchants', async (_req, res) => {
  try {
    const merchants = await listMerchants();
    return res.json({ success: true, data: merchants.map((merchant) => merchant.name) });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'unable to list merchants'
    });
  }
});

router.post('/merchants', async (req, res) => {
  const merchantName = String(req.body?.merchantName ?? req.body?.name ?? '').trim();

  if (!merchantName) {
    return res.status(400).json({
      success: false,
      message: 'merchantName is required'
    });
  }

  try {
    const existingMerchants = await listMerchants();
    const existing = existingMerchants.find((merchant) => merchant.name.toLowerCase() === merchantName.toLowerCase());

    if (existing) {
      return res.status(201).json({
        success: true,
        data: { merchantName: existing.name }
      });
    }

    const merchant = await createMerchant(merchantName, merchantName);
    return res.status(201).json({
      success: true,
      data: { merchantName: merchant.name }
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'unable to create merchant'
    });
  }
});

router.get('/reward-rules', async (_req, res) => {
  try {
    const merchants = await listMerchants();
    const merchantNameById = new Map(merchants.map((merchant) => [merchant.id, merchant.name]));
    const rewardRules = await listRewardRules();

    return res.json({
      success: true,
      data: rewardRules.map((rule) => {
        const merchantName = merchantNameById.get(rule.merchantId);
        if (!merchantName) {
          throw new Error(`merchant ${rule.merchantId} not found`);
        }

        return toLegacyRewardRule(rule, merchantName);
      })
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'unable to list reward rules'
    });
  }
});

router.post('/reward-rules', async (req, res) => {
  const { merchantName, paymentMethodId, cashbackRate, amountThreshold, validityStart, validityEnd, promotionNote } = req.body || {};

  if (!merchantName || !paymentMethodId || !validityStart || !validityEnd) {
    return res.status(400).json({
      success: false,
      message: 'merchantName, paymentMethodId, validityStart, and validityEnd are required'
    });
  }

  try {
    const merchants = await listMerchants();
    const merchant = merchants.find((entry) => entry.name.toLowerCase() === String(merchantName).trim().toLowerCase());
    if (!merchant) {
      return res.status(400).json({
        success: false,
        message: 'merchant not found'
      });
    }

    const paymentMethods = await prisma.paymentMethod.findMany();
    const paymentMethod = paymentMethods.find((entry) =>
      normalizePaymentMethodKey(entry.name) === normalizePaymentMethodKey(String(paymentMethodId))
    );

    if (!paymentMethod) {
      return res.status(400).json({
        success: false,
        message: 'paymentMethodId is invalid'
      });
    }

    const createdRule = await createRewardRule({
      merchantId: merchant.id,
      paymentMethodId: paymentMethod.id,
      cashbackRate: Number(cashbackRate ?? 0),
      amountThreshold: Number(amountThreshold ?? 0),
      validityStart: new Date(String(validityStart)),
      validityEnd: new Date(String(validityEnd)),
      promotionNote: promotionNote ? String(promotionNote) : undefined
    });

    return res.status(201).json({
      success: true,
      data: toLegacyRewardRule(createdRule, merchant.name)
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'unable to create reward rule'
    });
  }
});

router.delete('/reward-rules/:id', async (req, res) => {
  const ruleId = Number(req.params.id);

  if (!Number.isInteger(ruleId) || ruleId <= 0) {
    return res.status(404).json({
      success: false,
      message: 'reward rule not found'
    });
  }

  try {
    const deleted = await deleteRewardRule(ruleId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'reward rule not found'
      });
    }

    return res.json({
      success: true,
      data: { deleted: true }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'unable to delete reward rule'
    });
  }
});

export default router;
