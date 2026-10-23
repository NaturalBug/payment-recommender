import { Router, type RequestHandler } from 'express';
import prisma from '../lib/prisma';
import { listMerchants } from '../repositories/merchantRepository';
import { listMerchantBranches } from '../repositories/merchantBranchRepository';

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

const listBranchesHandler: RequestHandler = async (req, res) => {
  const merchantId = Number(req.params.merchantId);
  if (!Number.isInteger(merchantId) || merchantId <= 0) {
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

router.get('/:merchantId/branches', listBranchesHandler);
router.get('/:merchantId/outlets', listBranchesHandler);

export default router;
