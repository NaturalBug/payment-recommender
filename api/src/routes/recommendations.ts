import { Router } from 'express';
import { RepositoryNotFoundError, RepositoryValidationError } from '../repositories/errors';
import { getRecommendations } from '../services/recommendationService';

const router = Router();

function parseContextId(value: unknown): number | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

router.get('/', async (req, res) => {
  const merchant_name = String(req.query.merchant_name || '');
  const amount = Number(req.query.amount || 0);
  const date = req.query.date ? new Date(String(req.query.date)) : new Date();
  const outlet_name = req.query.outlet_name ? String(req.query.outlet_name).trim() : undefined;
  const branch_id = parseContextId(req.query.branch_id);
  const outlet_id = parseContextId(req.query.outlet_id);

  if (
    !merchant_name ||
    Number.isNaN(amount) ||
    amount <= 0 ||
    (outlet_name !== undefined && outlet_name.length > 120) ||
    branch_id === null ||
    outlet_id === null
  ) {
    return res.status(400).json({
      success: false,
      message: 'merchant_name and positive amount are required; branch_id and outlet_id must be positive integer IDs'
    });
  }

  try {
    const results = await getRecommendations({ merchant_name, amount, date, outlet_name, branch_id, outlet_id });
    return res.json({ success: true, data: results });
  } catch (error) {
    if (error instanceof RepositoryNotFoundError) {
      return res.status(404).json({ success: false, message: error.message });
    }
    if (error instanceof RepositoryValidationError) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'unable to fetch recommendations'
    });
  }
});

export default router;
