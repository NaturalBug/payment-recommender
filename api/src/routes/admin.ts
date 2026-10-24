import { Router, type RequestHandler } from 'express';
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
  createPaymentMethodType,
  deletePaymentMethodType,
  listPaymentMethodTypes,
  paymentMethodTypeExists
} from '../repositories/paymentMethodTypeRepository';
import {
  addAcceptance,
  listAcceptedPaymentMethods,
  removeAcceptance
} from '../repositories/merchantPaymentAcceptanceRepository';
import { createMerchantBranch, listMerchantBranches } from '../repositories/merchantBranchRepository';
import { createOutlet, listOutlets } from '../repositories/outletRepository';
import {
  createRewardRule,
  deleteRewardRule,
  listRewardRules
} from '../repositories/rewardRuleRepository';
import {
  findPromotionDraft,
  listImportRuns,
  listPromotionDrafts,
  publishPromotionDraft,
  reopenPromotionDraft,
  rejectPromotionDraft,
  updatePromotionDraft
} from '../repositories/promotionImportRepository';
import { listPromotions } from '../repositories/promotionRepository';
import {
  MerchantAlreadyExistsError,
  RepositoryConflictError,
  RepositoryValidationError
} from '../repositories/errors';
import type {
  ImportRunRecord,
  PromotionRecord,
  PromotionDraftRecord,
  PromotionDraftReviewInput,
  PromotionDraftStatus,
  RewardRuleRecord
} from '../repositories/types';

const router = Router();
const promotionDraftStatuses: PromotionDraftStatus[] = ['pending_review', 'published', 'rejected'];
const promotionDraftReviewFields = [
  'originType',
  'originMerchantIds',
  'originOutletIds',
  'eligibilityType',
  'eligibleBranchIds',
  'excludedMerchantIds',
  'excludedBranchIds',
  'paymentMethodIds',
  'merchantId',
  'paymentMethodId',
  'benefitType',
  'cashbackRate',
  'fixedDiscountAmount',
  'amountThreshold',
  'validityStart',
  'validityEnd',
  'promotionNote',
  'outletId'
] as const;

function serializeDateOnly(value: Date | null | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value === null ? null : value.toISOString().slice(0, 10);
}

function serializeImportRun(run: ImportRunRecord) {
  return {
    ...run,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null
  };
}

function serializePromotionDraft(draft: PromotionDraftRecord) {
  return {
    ...draft,
    fetchedAt: draft.fetchedAt.toISOString(),
    parsedValidityStart: serializeDateOnly(draft.parsedValidityStart),
    parsedValidityEnd: serializeDateOnly(draft.parsedValidityEnd),
    validityStart: serializeDateOnly(draft.validityStart),
    validityEnd: serializeDateOnly(draft.validityEnd),
    reviewedAt: draft.reviewedAt?.toISOString() ?? null
  };
}

function serializeRewardRule(rule: RewardRuleRecord) {
  return {
    ...rule,
    validityStart: rule.validityStart.toISOString().slice(0, 10),
    validityEnd: rule.validityEnd.toISOString().slice(0, 10)
  };
}

function serializePromotion(promotion: PromotionRecord) {
  return {
    ...promotion,
    validityStart: promotion.validityStart.toISOString().slice(0, 10),
    validityEnd: promotion.validityEnd.toISOString().slice(0, 10)
  };
}

function parseOptionalDate(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RepositoryValidationError('validity dates must use YYYY-MM-DD format');
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new RepositoryValidationError('validity dates must be valid calendar dates');
  }

  return date;
}

function parseNumericValue(value: unknown, field: string): number {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && !value.trim())
  ) {
    throw new RepositoryValidationError(`${field} must be numeric`);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new RepositoryValidationError(`${field} must be numeric`);
  }

  return parsed;
}

function hasOwn(values: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(values, key);
}

function parsePromotionDraftReviewPatch(
  body: unknown,
  existing: NonNullable<Awaited<ReturnType<typeof findPromotionDraft>>>
): PromotionDraftReviewInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new RepositoryValidationError('review fields are required');
  }

  const values = body as Record<string, unknown>;
  const keys = Object.keys(values);
  if (keys.length === 0 || keys.some((key) => !promotionDraftReviewFields.includes(key as typeof promotionDraftReviewFields[number]))) {
    throw new RepositoryValidationError('review fields are required or contain unsupported fields');
  }

  const patch: PromotionDraftReviewInput = {};

  if (hasOwn(values, 'originType')) {
    if (values.originType !== null && values.originType !== 'merchant' && values.originType !== 'outlet') {
      throw new RepositoryValidationError('originType must be merchant or outlet');
    }
    patch.originType = values.originType;
  }

  if (hasOwn(values, 'eligibilityType')) {
    const eligibilityTypes = ['merchant_wide', 'selected_branches', 'outlet'];
    if (values.eligibilityType !== null && !eligibilityTypes.includes(String(values.eligibilityType))) {
      throw new RepositoryValidationError('eligibilityType is invalid');
    }
    patch.eligibilityType = values.eligibilityType as PromotionDraftReviewInput['eligibilityType'];
  }

  for (const field of ['originMerchantIds', 'originOutletIds', 'eligibleBranchIds', 'excludedMerchantIds', 'excludedBranchIds', 'paymentMethodIds'] as const) {
    if (!hasOwn(values, field)) continue;
    if (!Array.isArray(values[field])) {
      throw new RepositoryValidationError(`${field} must be an array of positive integer IDs`);
    }
    const ids = (values[field] as unknown[]).map((value) => parseNumericValue(value, field));
    if (ids.some((value) => !Number.isSafeInteger(value) || value <= 0) || new Set(ids).size !== ids.length) {
      throw new RepositoryValidationError(`${field} must contain unique positive integer IDs`);
    }
    patch[field] = ids;
  }

  for (const field of ['merchantId', 'paymentMethodId'] as const) {
    if (!hasOwn(values, field)) continue;
    if (values[field] === null) {
      patch[field] = null;
      continue;
    }
    const parsed = parseNumericValue(values[field], field);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new RepositoryValidationError(`${field} must be a positive integer`);
    }
    patch[field] = parsed;
  }

  if (hasOwn(values, 'cashbackRate')) {
    if (values.cashbackRate === null) {
      patch.cashbackRate = null;
    } else {
      const cashbackRate = parseNumericValue(values.cashbackRate, 'cashbackRate');
      if (!Number.isFinite(cashbackRate) || cashbackRate < 0) {
        throw new RepositoryValidationError('cashbackRate must be a non-negative number');
      }
      patch.cashbackRate = cashbackRate;
    }
  }

  if (hasOwn(values, 'benefitType')) {
    if (values.benefitType !== 'cashback' && values.benefitType !== 'fixed_discount') {
      throw new RepositoryValidationError('benefitType must be cashback or fixed_discount');
    }
    patch.benefitType = values.benefitType;
  }

  if (hasOwn(values, 'fixedDiscountAmount')) {
    if (values.fixedDiscountAmount === null) {
      patch.fixedDiscountAmount = null;
    } else {
      const fixedDiscountAmount = parseNumericValue(values.fixedDiscountAmount, 'fixedDiscountAmount');
      if (!Number.isInteger(fixedDiscountAmount) || fixedDiscountAmount <= 0) {
        throw new RepositoryValidationError('fixedDiscountAmount must be a positive integer');
      }
      patch.fixedDiscountAmount = fixedDiscountAmount;
    }
  }

  if (hasOwn(values, 'amountThreshold')) {
    if (values.amountThreshold === null) {
      patch.amountThreshold = null;
    } else {
      const amountThreshold = parseNumericValue(values.amountThreshold, 'amountThreshold');
      if (!Number.isInteger(amountThreshold) || amountThreshold < 0) {
        throw new RepositoryValidationError('amountThreshold must be a non-negative integer');
      }
      patch.amountThreshold = amountThreshold;
    }
  }

  if (hasOwn(values, 'validityStart')) {
    patch.validityStart = values.validityStart === null ? null : parseOptionalDate(values.validityStart);
  }

  if (hasOwn(values, 'validityEnd')) {
    if (values.validityEnd === null) {
      patch.validityEnd = null;
    } else {
      const endDate = parseOptionalDate(values.validityEnd);
      patch.validityEnd = new Date(`${endDate.toISOString().slice(0, 10)}T23:59:59.999Z`);
    }
  }

  if (values.promotionNote !== undefined) {
    if (values.promotionNote !== null && typeof values.promotionNote !== 'string') {
      throw new RepositoryValidationError('promotionNote must be a string');
    }
    if (typeof values.promotionNote === 'string' && values.promotionNote.length > 500) {
      throw new RepositoryValidationError('promotionNote cannot exceed 500 characters');
    }
    patch.promotionNote = typeof values.promotionNote === 'string' ? values.promotionNote.trim() || null : null;
  }

  if (hasOwn(values, 'outletId')) {
    if (values.outletId === null) {
      patch.outletId = null;
    } else {
      const outletId = parseNumericValue(values.outletId, 'outletId');
      if (!Number.isInteger(outletId) || outletId <= 0) {
        throw new RepositoryValidationError('outletId must be a positive integer');
      }
      patch.outletId = outletId;
    }
  }

  const start = hasOwn(values, 'validityStart')
    ? patch.validityStart ?? null
    : existing.validityStart ?? existing.parsedValidityStart ?? null;
  const end = hasOwn(values, 'validityEnd')
    ? patch.validityEnd ?? null
    : existing.validityEnd ?? existing.parsedValidityEnd ?? null;
  if (start && end && end < start) {
    throw new RepositoryValidationError('validityEnd must be on or after validityStart');
  }

  return patch;
}

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
    benefitType: rule.benefitType,
    cashbackRate: rule.cashbackRate ?? undefined,
    fixedDiscountAmount: rule.fixedDiscountAmount,
    amountThreshold: rule.amountThreshold,
    validityStart: rule.validityStart.toISOString().slice(0, 10),
    validityEnd: rule.validityEnd.toISOString().slice(0, 10),
    promotionNote: rule.promotionNote ?? undefined,
    sourceUrl: rule.sourceUrl ?? undefined,
    outletId: rule.outletId ?? undefined,
    outletName: rule.outletName ?? undefined
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

router.get('/outlets', async (_req, res) => {
  try {
    return res.json({ success: true, data: await listOutlets() });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'unable to list outlets'
    });
  }
});

router.post('/outlets', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const location = req.body?.location;
  if (!name || name.length > 120 || (location !== undefined && (typeof location !== 'string' || location.length > 200))) {
    return res.status(400).json({ success: false, message: 'a valid outlet name is required' });
  }

  try {
    return res.status(201).json({
      success: true,
      data: await createOutlet({ name, location })
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
      message: error instanceof Error ? error.message : 'unable to create outlet'
    });
  }
});

const listBranchesHandler: RequestHandler = async (req, res) => {
  const merchantIdParam = req.params.merchantId;
  const merchantId = parsePositiveIntId(Array.isArray(merchantIdParam) ? merchantIdParam[0] : merchantIdParam);
  if (merchantId === null) {
    return res.status(404).json({ success: false, message: 'merchant not found' });
  }

  try {
    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId }, select: { id: true } });
    if (!merchant) {
      return res.status(404).json({ success: false, message: 'merchant not found' });
    }
    return res.json({ success: true, data: await listMerchantBranches(merchantId) });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'unable to list merchant branches'
    });
  }
};

router.get('/merchants/:merchantId/branches', listBranchesHandler);
router.get('/merchants/:merchantId/outlets', listBranchesHandler);

const createBranchHandler: RequestHandler = async (req, res) => {
  const merchantIdParam = req.params.merchantId;
  const merchantId = parsePositiveIntId(Array.isArray(merchantIdParam) ? merchantIdParam[0] : merchantIdParam);
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const location = req.body?.location;
  const rawOutletId = req.body?.outletId;
  const outletId = rawOutletId === undefined || rawOutletId === null ? null : Number(rawOutletId);
  if (merchantId === null) {
    return res.status(404).json({ success: false, message: 'merchant not found' });
  }
  if (
    !name ||
    name.length > 120 ||
    (location !== undefined && (typeof location !== 'string' || location.length > 200)) ||
    (rawOutletId !== undefined &&
      rawOutletId !== null &&
      (!Number.isSafeInteger(outletId) || (outletId ?? 0) <= 0))
  ) {
    return res.status(400).json({ success: false, message: 'valid branch details are required' });
  }

  try {
    const branch = await createMerchantBranch({
      merchantId,
      name,
      location: typeof location === 'string' ? location : undefined,
      outletId
    });
    return res.status(201).json({ success: true, data: branch });
  } catch (error) {
    if (error instanceof RepositoryConflictError) {
      return res.status(409).json({ success: false, message: error.message });
    }
    if (error instanceof RepositoryValidationError) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'unable to create merchant branch'
    });
  }
};

router.post('/merchants/:merchantId/branches', createBranchHandler);
router.post('/merchants/:merchantId/outlets', createBranchHandler);

// ---------------------------------------------------------------------------
// Payment Method Types
// ---------------------------------------------------------------------------

router.get('/payment-method-types', async (_req, res) => {
  try {
    return res.json({ success: true, data: await listPaymentMethodTypes() });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'unable to list payment method types'
    });
  }
});

router.post('/payment-method-types', async (req, res) => {
  try {
    const created = await createPaymentMethodType(String(req.body?.name ?? ''));
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    if (error instanceof RepositoryConflictError) {
      return res.status(409).json({ success: false, message: error.message });
    }
    if (error instanceof RepositoryValidationError) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'unable to create payment method type'
    });
  }
});

router.delete('/payment-method-types/:id', async (req, res) => {
  const id = parsePositiveIntId(req.params.id);
  if (id === null) {
    return res.status(404).json({ success: false, message: 'payment method type not found' });
  }

  try {
    if (!(await deletePaymentMethodType(id))) {
      return res.status(404).json({ success: false, message: 'payment method type not found' });
    }
    return res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    if (error instanceof RepositoryConflictError) {
      return res.status(409).json({ success: false, message: error.message });
    }
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'unable to delete payment method type'
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
    if (!(await paymentMethodTypeExists(type))) {
      return res.status(400).json({
        success: false,
        message: 'payment method type is not in the catalog'
      });
    }

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

    if (rawType !== undefined && !(await paymentMethodTypeExists(String(rawType).trim()))) {
      return res.status(400).json({
        success: false,
        message: 'payment method type is not in the catalog'
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
// Imported Promotion Review
// ---------------------------------------------------------------------------

router.get('/import-runs', async (_req, res) => {
  try {
    const runs = await listImportRuns();
    return res.json({ success: true, data: runs.map(serializeImportRun) });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'unable to list import runs'
    });
  }
});

router.get('/promotions', async (_req, res) => {
  try {
    const promotions = await listPromotions();
    return res.json({ success: true, data: promotions.map(serializePromotion) });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'unable to list promotions'
    });
  }
});

router.get('/promotion-drafts', async (req, res) => {
  const rawStatus = req.query.status;
  if (rawStatus !== undefined && (
    typeof rawStatus !== 'string' ||
    !promotionDraftStatuses.includes(rawStatus as PromotionDraftStatus)
  )) {
    return res.status(400).json({ success: false, message: 'status is invalid' });
  }

  try {
    const drafts = await listPromotionDrafts(rawStatus as PromotionDraftStatus | undefined);
    return res.json({ success: true, data: drafts.map(serializePromotionDraft) });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'unable to list promotion drafts'
    });
  }
});

router.patch('/promotion-drafts/:id', async (req, res) => {
  const id = parsePositiveIntId(req.params.id);
  if (id === null) {
    return res.status(404).json({ success: false, message: 'promotion draft not found' });
  }

  try {
    const existing = await findPromotionDraft(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'promotion draft not found' });
    }

    const updated = await updatePromotionDraft(id, parsePromotionDraftReviewPatch(req.body, existing));
    if (!updated) {
      return res.status(404).json({ success: false, message: 'promotion draft not found' });
    }

    return res.json({ success: true, data: serializePromotionDraft(updated) });
  } catch (error) {
    if (error instanceof RepositoryConflictError) {
      return res.status(409).json({ success: false, message: error.message });
    }
    if (error instanceof RepositoryValidationError) {
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'unable to update promotion draft'
    });
  }
});

router.post('/promotion-drafts/:id/publish', async (req, res) => {
  const id = parsePositiveIntId(req.params.id);
  if (id === null) {
    return res.status(404).json({ success: false, message: 'promotion draft not found' });
  }

  try {
    const result = await publishPromotionDraft(id);
    return res.status(201).json({
      success: true,
      data: {
        ...serializePromotionDraft(result.draft),
        promotion: serializePromotion(result.promotion)
      }
    });
  } catch (error) {
    if (error instanceof RepositoryConflictError) {
      return res.status(409).json({ success: false, message: error.message });
    }
    if (error instanceof RepositoryValidationError) {
      const status = error.message === 'promotion draft not found' ? 404 : 400;
      return res.status(status).json({ success: false, message: error.message });
    }

    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'unable to publish promotion draft'
    });
  }
});

router.post('/promotion-drafts/:id/reject', async (req, res) => {
  const id = parsePositiveIntId(req.params.id);
  if (id === null) {
    return res.status(404).json({ success: false, message: 'promotion draft not found' });
  }

  const reason = req.body?.reason;
  if (typeof reason !== 'string' || !reason.trim()) {
    return res.status(400).json({ success: false, message: 'rejection reason is required' });
  }

  try {
    const rejected = await rejectPromotionDraft(id, reason);
    if (!rejected) {
      return res.status(404).json({ success: false, message: 'promotion draft not found' });
    }

    return res.json({ success: true, data: serializePromotionDraft(rejected) });
  } catch (error) {
    if (error instanceof RepositoryConflictError) {
      return res.status(409).json({ success: false, message: error.message });
    }
    if (error instanceof RepositoryValidationError) {
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'unable to reject promotion draft'
    });
  }
});

router.post('/promotion-drafts/:id/reopen', async (req, res) => {
  const id = parsePositiveIntId(req.params.id);
  if (id === null) {
    return res.status(404).json({ success: false, message: 'promotion draft not found' });
  }

  try {
    const reopened = await reopenPromotionDraft(id);
    if (!reopened) {
      return res.status(404).json({ success: false, message: 'promotion draft not found' });
    }
    return res.json({ success: true, data: serializePromotionDraft(reopened) });
  } catch (error) {
    if (error instanceof RepositoryConflictError) {
      return res.status(409).json({ success: false, message: error.message });
    }
    if (error instanceof RepositoryValidationError) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'unable to reopen promotion draft'
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
  const {
    merchantName,
    paymentMethodId,
    benefitType: rawBenefitType,
    cashbackRate,
    fixedDiscountAmount,
    amountThreshold,
    validityStart,
    validityEnd,
    promotionNote,
    sourceUrl,
    outletId: rawOutletId
  } = req.body || {};
  const merchantNameValue = String(merchantName ?? '').trim();
  const paymentMethodIdValue = Number(paymentMethodId);
  const benefitType = rawBenefitType ?? 'cashback';
  const cashbackRateValue = cashbackRate === undefined ? undefined : Number(cashbackRate);
  const fixedDiscountAmountValue = fixedDiscountAmount === undefined ? undefined : Number(fixedDiscountAmount);
  const amountThresholdValue = Number(amountThreshold ?? 0);
  const outletIdValue = rawOutletId === undefined || rawOutletId === null ? null : Number(rawOutletId);
  const validityStartValue = new Date(String(validityStart ?? ''));
  const validityEndValue = new Date(String(validityEnd ?? ''));
  let sourceUrlValue: string | undefined;

  if (
    promotionNote !== undefined &&
    promotionNote !== null &&
    (typeof promotionNote !== 'string' || promotionNote.length > 500)
  ) {
    return res.status(400).json({
      success: false,
      message: 'promotionNote must be a string no longer than 500 characters'
    });
  }

  if (sourceUrl !== undefined && sourceUrl !== null && sourceUrl !== '') {
    if (typeof sourceUrl !== 'string' || sourceUrl.length > 2000) {
      return res.status(400).json({ success: false, message: 'sourceUrl must be an HTTPS URL' });
    }
    try {
      const parsedUrl = new URL(sourceUrl);
      if (parsedUrl.protocol !== 'https:') {
        throw new Error('invalid protocol');
      }
      sourceUrlValue = parsedUrl.toString();
    } catch {
      return res.status(400).json({ success: false, message: 'sourceUrl must be an HTTPS URL' });
    }
  }

  if (!merchantNameValue || !Number.isInteger(paymentMethodIdValue) || paymentMethodIdValue <= 0 || !validityStart || !validityEnd) {
    return res.status(400).json({
      success: false,
      message: 'merchantName, paymentMethodId, validityStart, and validityEnd are required'
    });
  }

  if (
    (benefitType !== 'cashback' && benefitType !== 'fixed_discount') ||
    (benefitType === 'cashback' && (!Number.isFinite(cashbackRateValue) || (cashbackRateValue ?? -1) < 0)) ||
    (benefitType === 'fixed_discount' &&
      (!Number.isInteger(fixedDiscountAmountValue) || (fixedDiscountAmountValue ?? 0) <= 0)) ||
    !Number.isInteger(amountThresholdValue) ||
    amountThresholdValue < 0 ||
    (outletIdValue !== null && (!Number.isInteger(outletIdValue) || outletIdValue <= 0)) ||
    Number.isNaN(validityStartValue.getTime()) ||
    Number.isNaN(validityEndValue.getTime()) ||
    validityEndValue < validityStartValue
  ) {
    return res.status(400).json({
      success: false,
      message: 'benefit values, amountThreshold, and validity dates must be valid'
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
      benefitType,
      cashbackRate: cashbackRateValue,
      fixedDiscountAmount: fixedDiscountAmountValue,
      amountThreshold: amountThresholdValue,
      validityStart: validityStartValue,
      validityEnd: validityEndValue,
      promotionNote: promotionNote ? String(promotionNote) : undefined,
      sourceUrl: sourceUrlValue,
      outletId: outletIdValue
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
