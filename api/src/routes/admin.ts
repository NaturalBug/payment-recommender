import { Router } from 'express';
import { addMerchant, addRewardRule, getMerchantCatalog, getRewardRuleCatalog, removeRewardRule } from '../data';

const router = Router();

router.get('/merchants', (_req, res) => {
  return res.json({
    success: true,
    data: getMerchantCatalog()
  });
});

router.post('/merchants', (req, res) => {
  const merchantName = String(req.body?.merchantName ?? req.body?.name ?? '').trim();

  if (!merchantName) {
    return res.status(400).json({
      success: false,
      message: 'merchantName is required'
    });
  }

  try {
    const created = addMerchant(merchantName);
    return res.status(201).json({
      success: true,
      data: { merchantName: created }
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'unable to create merchant'
    });
  }
});

router.get('/reward-rules', (_req, res) => {
  return res.json({
    success: true,
    data: getRewardRuleCatalog()
  });
});

router.post('/reward-rules', (req, res) => {
  const { merchantName, paymentMethodId, cashbackRate, amountThreshold, validityStart, validityEnd, promotionNote } = req.body || {};

  if (!merchantName || !paymentMethodId || !validityStart || !validityEnd) {
    return res.status(400).json({
      success: false,
      message: 'merchantName, paymentMethodId, validityStart, and validityEnd are required'
    });
  }

  try {
    const createdRule = addRewardRule({
      merchantName: String(merchantName),
      paymentMethodId: String(paymentMethodId),
      cashbackRate: Number(cashbackRate ?? 0),
      amountThreshold: Number(amountThreshold ?? 0),
      validityStart: String(validityStart),
      validityEnd: String(validityEnd),
      promotionNote: promotionNote ? String(promotionNote) : undefined
    });

    return res.status(201).json({
      success: true,
      data: createdRule
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'unable to create reward rule'
    });
  }
});

router.delete('/reward-rules/:id', (req, res) => {
  const deleted = removeRewardRule(req.params.id);

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
});

export default router;
