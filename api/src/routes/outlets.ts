import { Router, type RequestHandler } from 'express';
import { listOutletBranches } from '../repositories/merchantBranchRepository';
import { findOutletById, listOutlets } from '../repositories/outletRepository';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    return res.json({ success: true, data: await listOutlets() });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'unable to list outlets'
    });
  }
});

const listBranchesHandler: RequestHandler = async (req, res) => {
  const outletId = Number(req.params.outletId);
  if (!Number.isSafeInteger(outletId) || outletId <= 0) {
    return res.status(404).json({ success: false, message: 'outlet not found' });
  }

  try {
    const outlet = await findOutletById(outletId);
    if (!outlet) {
      return res.status(404).json({ success: false, message: 'outlet not found' });
    }
    return res.json({ success: true, data: await listOutletBranches(outletId) });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'unable to list outlet branches'
    });
  }
};

router.get('/:outletId/branches', listBranchesHandler);

export default router;
