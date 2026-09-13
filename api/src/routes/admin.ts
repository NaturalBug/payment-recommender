import { Router } from 'express';
import prisma from '../lib/prisma';
import {
  createMerchant,
  deleteMerchant,
  findMerchantByName,
  listMerchants,
  updateMerchant
} from '../repositories/merchantRepository';
import {
  createPaymentMethod,
  deletePaymentMethod,
  findPaymentMethodById,
  listPaymentMethods,
  updatePaymentMethod
} from '../repositories/paymentMethodRepository';
import {
  addAcceptance,
  listAcceptedPaymentMethods,
  removeAcceptance
} from '../repositories/merchantPaymentAcceptanceRepository';
import {
  createRewardRule,
  deleteRewardRule,
  listRewardRules
} from '../repositories/rewardRuleRepository';
import {
  MerchantAlreadyExistsError,
  RepositoryConflictError,
  RepositoryValidationError
} from '../repositories/errors';

const router = Router();

function parsePositiveIntId(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function toRewardRuleResponse(rule: Awaited<ReturnType<typeof listRewardRules>>[number], merchantName: string) {
  return {
    id: String(rule.id),
    merchantName,
    paymentMethodId: rule.paymentMethodId,
    cashbackRate: Number(rule.cashbackRate),
    amountThreshold: rule.amountThreshold,
    validityStart: rule.validityStart.toISOString().slice(0, 10),
    validityEnd: rule.validityEnd.toISOString().slice(0, 10),
    promotionNote: rule.promotionNote ?? undefined
  };
}

// ---------------------------------------------------------------------------
// Merchants
// ---------------------------------------------------------------------------

router.get('/merchants', async (_req, res) => {
  try {
    const merchants = await listMerchants();
    return res.json({ success: true, data: merchants });
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
      data: merchant
    });
  } catch (error) {
    if (error instanceof MerchantAlreadyExistsError || error instanceof RepositoryConflictError) {
      return res.status(409).json({ success: false, message: error.message });
    }

    if (error instanceof RepositoryValidationError) {
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'unable to create merchant'
    });
  }
});

router.patch('/merchants/:id', async (req, res) => {
  const id = parsePositiveIntId(req.params.id);
  if (id === null) {
    return res.status(404).json({
      success: false,
      message: 'merchant not found'
    });
  }

  const merchantName = String(req.body?.merchantName ?? req.body?.name ?? '').trim();
  if (!merchantName) {
    return res.status(400).json({
      success: false,
      message: 'merchantName is required'
    });
  }

  try {
    const updated = await updateMerchant(id, merchantName);
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'merchant not found'
      });
    }

    return res.json({
      success: true,
      data: updated
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
      message: error instanceof Error ? error.message : 'unable to update merchant'
    });
  }
});

router.delete('/merchants/:id', async (req, res) => {
  const id = parsePositiveIntId(req.params.id);
  if (id === null) {
    return res.status(404).json({
      success: false,
      message: 'merchant not found'
    });
  }

  try {
    const deleted = await deleteMerchant(id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'merchant not found'
      });
    }

    return res.json({
      success: true,
      data: { deleted: true }
    });
  } catch (error) {
    if (error instanceof RepositoryConflictError) {
      return res.status(409).json({ success: false, message: error.message });
    }

    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'unable to delete merchant'
    });
  }
});

// ---------------------------------------------------------------------------
// Payment Methods
// ---------------------------------------------------------------------------

router.get('/payment-methods', async (_req, res) => {
  try {
    const paymentMethods = await listPaymentMethods();
    return res.json({ success: true, data: paymentMethods });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'unable to list payment methods'
    });
  }
});

router.post('/payment-methods', async (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  const type = String(req.body?.type ?? '').trim();

  if (!name || !type) {
    return res.status(400).json({
      success: false,
      message: 'name and type are required'
    });
  }

  try {
    const paymentMethod = await createPaymentMethod({ name, type });
    return res.status(201).json({
      success: true,
      data: paymentMethod
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
      message: error instanceof Error ? error.message : 'unable to create payment method'
    });
  }
});

router.patch('/payment-methods/:id', async (req, res) => {
  const id = parsePositiveIntId(req.params.id);
  if (id === null) {
    return res.status(404).json({
      success: false,
      message: 'payment method not found'
    });
  }

  const rawName = req.body?.name;
  const rawType = req.body?.type;

  if (rawName === undefined && rawType === undefined) {
    return res.status(400).json({
      success: false,
      message: 'name or type is required'
    });
  }

  if (rawName !== undefined && !String(rawName).trim()) {
    return res.status(400).json({
      success: false,
      message: 'name cannot be empty'
    });
  }

  if (rawType !== undefined && !String(rawType).trim()) {
    return res.status(400).json({
      success: false,
      message: 'type cannot be empty'
    });
  }

  try {
    const existing = await prisma.paymentMethod.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'payment method not found'
      });
    }

    const updated = await updatePaymentMethod(id, {
      name: rawName !== undefined ? String(rawName).trim() : existing.name,
      type: rawType !== undefined ? String(rawType).trim() : existing.type
    });

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'payment method not found'
      });
    }

    return res.json({
      success: true,
      data: updated
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
      message: error instanceof Error ? error.message : 'unable to update payment method'
    });
  }
});

router.delete('/payment-methods/:id', async (req, res) => {
  const id = parsePositiveIntId(req.params.id);
  if (id === null) {
    return res.status(404).json({
      success: false,
      message: 'payment method not found'
    });
  }

  try {
    const deleted = await deletePaymentMethod(id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'payment method not found'
      });
    }

    return res.json({
      success: true,
      data: { deleted: true }
    });
  } catch (error) {
    if (error instanceof RepositoryConflictError) {
      return res.status(409).json({ success: false, message: error.message });
    }

    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'unable to delete payment method'
    });
  }
});

// ---------------------------------------------------------------------------
// Merchant Payment Acceptance
// ---------------------------------------------------------------------------

router.get('/merchants/:merchantId/payment-methods', async (req, res) => {
  const merchantId = parsePositiveIntId(req.params.merchantId);
  if (merchantId === null) {
    return res.status(404).json({
      success: false,
      message: 'merchant not found'
    });
  }

  try {
    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) {
      return res.status(404).json({
        success: false,
        message: 'merchant not found'
      });
    }

    const paymentMethods = await listAcceptedPaymentMethods(merchantId);
    return res.json({
      success: true,
      data: paymentMethods
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'unable to list accepted payment methods'
    });
  }
});

router.put('/merchants/:merchantId/payment-methods/:paymentMethodId', async (req, res) => {
  const merchantId = parsePositiveIntId(req.params.merchantId);
  const paymentMethodId = parsePositiveIntId(req.params.paymentMethodId);

  if (merchantId === null || paymentMethodId === null) {
    return res.status(404).json({
      success: false,
      message: 'resource not found'
    });
  }

  try {
    const [merchant, paymentMethod] = await Promise.all([
      prisma.merchant.findUnique({ where: { id: merchantId } }),
      prisma.paymentMethod.findUnique({ where: { id: paymentMethodId } })
    ]);

    if (!merchant) {
      return res.status(404).json({
        success: false,
        message: 'merchant not found'
      });
    }

    if (!paymentMethod) {
      return res.status(404).json({
        success: false,
        message: 'payment method not found'
      });
    }

    const acceptance = await addAcceptance(merchantId, paymentMethodId);
    return res.status(201).json({
      success: true,
      data: acceptance
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
      message: error instanceof Error ? error.message : 'unable to add acceptance'
    });
  }
});

router.delete('/merchants/:merchantId/payment-methods/:paymentMethodId', async (req, res) => {
  const merchantId = parsePositiveIntId(req.params.merchantId);
  const paymentMethodId = parsePositiveIntId(req.params.paymentMethodId);

  if (merchantId === null || paymentMethodId === null) {
    return res.status(404).json({
      success: false,
      message: 'resource not found'
    });
  }

  try {
    const deleted = await removeAcceptance(merchantId, paymentMethodId);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'acceptance not found'
      });
    }

    return res.json({
      success: true,
      data: { deleted: true }
    });
  } catch (error) {
    if (error instanceof RepositoryConflictError) {
      return res.status(409).json({ success: false, message: error.message });
    }

    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'unable to remove acceptance'
    });
  }
});

// ---------------------------------------------------------------------------
// Reward Rules
// ---------------------------------------------------------------------------

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

        return toRewardRuleResponse(rule, merchantName);
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
  const paymentMethodIdValue = Number(paymentMethodId);
  const cashbackRateValue = Number(cashbackRate ?? 0);
  const amountThresholdValue = Number(amountThreshold ?? 0);
  const validityStartValue = new Date(String(validityStart ?? ''));
  const validityEndValue = new Date(String(validityEnd ?? ''));

  if (!merchantNameValue || !Number.isInteger(paymentMethodIdValue) || paymentMethodIdValue <= 0 || !validityStart || !validityEnd) {
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

    const paymentMethod = await findPaymentMethodById(paymentMethodIdValue);

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
      data: toRewardRuleResponse(createdRule, merchant.name)
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
  const ruleId = parsePositiveIntId(req.params.id);

  if (ruleId === null) {
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
