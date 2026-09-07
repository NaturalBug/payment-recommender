import { Router } from 'express';
import { getRecommendations } from '../services/recommendationService';

const router = Router();

router.get('/', async (req, res) => {
  const merchant_name = String(req.query.merchant_name || '');
  const amount = Number(req.query.amount || 0);
  const date = req.query.date ? new Date(String(req.query.date)) : new Date();

  if (!merchant_name || Number.isNaN(amount) || amount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'merchant_name and positive amount are required'
    });
  }

  try {
    const results = await getRecommendations({ merchant_name, amount, date });
    return res.json({ success: true, data: results });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'unable to fetch recommendations'
    });
  }
});

export default router;
