import { Router } from 'express';
import { listMerchants } from '../repositories/merchantRepository';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const merchants = await listMerchants();
    return res.json({ success: true, data: merchants.map(({ id, name }) => ({ id, name })) });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'unable to list merchants'
    });
  }
});

export default router;
