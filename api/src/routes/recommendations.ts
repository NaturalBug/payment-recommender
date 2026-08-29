import { Router } from 'express';
import { getRecommendations } from '../services/recommendationService';

const router = Router();

router.get('/', (req, res) => {
  const merchant_name = String(req.query.merchant_name || '');
  const amount = Number(req.query.amount || 0);
  const date = req.query.date ? new Date(String(req.query.date)) : new Date();

  if (!merchant_name || Number.isNaN(amount) || amount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'merchant_name and positive amount are required'
    });
  }

  const results = getRecommendations({ merchant_name, amount, date });
  return res.json({ success: true, data: results });
});

export default router;
