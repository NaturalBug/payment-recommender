import { Router } from 'express';
import { createMerchant, findMerchantByName, listMerchants } from '../repositories/merchantRepository';
import {
  findPaymentMethodByLegacyIdOrName,
  toLegacyPaymentMethodId
} from '../repositories/paymentMethodRepository';
import { createRewardRule, deleteRewardRule, listRewardRules } from '../repositories/rewardRuleRepository';
import {
  MerchantAlreadyExistsError,
  RepositoryConflictError,
  RepositoryValidationError
} from '../repositories/errors';

const router = Router();

function toLegacyRewardRule(rule: Awaited<ReturnType<typeof listRewardRules>>[number], merchantName: string) {
  return {
    id: String(rule.id),
    merchantName,
    paymentMethodId: toLegacyPaymentMethodId(rule.paymentMethodName),
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
    const merchant = await createMerchant(merchantName, merchantName);
    return res.status(201).json({
      success: true,
      data: { merchantName: merchant.name }
    });
  } catch (error) {
    if (error instanceof MerchantAlreadyExistsError) {
      return res.status(409).json({ success: false, message: error.message });
    }

    return res.status(500).json({
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
  const merchantNameValue = String(merchantName ?? '').trim();
  const paymentMethodValue = String(paymentMethodId ?? '').trim();
  const cashbackRateValue = Number(cashbackRate ?? 0);
  const amountThresholdValue = Number(amountThreshold ?? 0);
  const validityStartValue = new Date(String(validityStart ?? ''));
  const validityEndValue = new Date(String(validityEnd ?? ''));

  if (!merchantNameValue || !paymentMethodValue || !validityStart || !validityEnd) {
    return res.status(400).json({
      success: false,
      message: 'merchantName, paymentMethodId, validityStart, and validityEnd are required'
    });
  }

  if (
    !Number.isFinite(cashbackRateValue) ||
    !Number.isFinite(amountThresholdValue) ||
    amountThresholdValue < 0 ||
    Number.isNaN(validityStartValue.getTime()) ||
    Number.isNaN(validityEndValue.getTime()) ||
    validityEndValue < validityStartValue
  ) {
    return res.status(400).json({
      success: false,
      message: 'cashbackRate, amountThreshold, and validity dates must be valid'
    });
  }

  try {
    const merchant = await findMerchantByName(merchantNameValue);
    if (!merchant) {
      return res.status(400).json({
        success: false,
        message: 'merchant not found'
      });
    }

    const paymentMethod = await findPaymentMethodByLegacyIdOrName(paymentMethodValue);

    if (!paymentMethod) {
      return res.status(400).json({
        success: false,
        message: 'paymentMethodId is invalid'
      });
    }

    const createdRule = await createRewardRule({
      merchantId: merchant.id,
      paymentMethodId: paymentMethod.id,
      cashbackRate: cashbackRateValue,
      amountThreshold: amountThresholdValue,
      validityStart: validityStartValue,
      validityEnd: validityEndValue,
      promotionNote: promotionNote ? String(promotionNote) : undefined
    });

    return res.status(201).json({
      success: true,
      data: toLegacyRewardRule(createdRule, merchant.name)
    });
  } catch (error) {
    if (error instanceof RepositoryConflictError) {
      return res.status(409).json({ success: false, message: error.message });
    }

    if (error instanceof RepositoryValidationError) {
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(500).json({
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
