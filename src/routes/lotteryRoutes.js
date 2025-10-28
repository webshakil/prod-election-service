import express from 'express';
import lotteryController from '../controllers/lotteryController.js';
import { extractUserData, requireCreator } from '../middleware/authMiddleware.js';
import { idParamValidation, paginationValidation } from '../utils/validators.js';

const router = express.Router();

// Configure lottery for election
router.post(
  '/:electionId/configure',
  extractUserData,
  requireCreator,
  idParamValidation,
  lotteryController.configureLottery
);

// Get lottery configuration
router.get(
  '/:electionId/config',
  idParamValidation,
  lotteryController.getLotteryConfig
);

// Select winners (manual trigger)
router.post(
  '/:electionId/select-winners',
  extractUserData,
  requireCreator,
  idParamValidation,
  lotteryController.selectWinners
);

// Get winners for an election
router.get(
  '/:electionId/winners',
  idParamValidation,
  paginationValidation,
  lotteryController.getWinners
);

// Claim prize (for winner)
router.post(
  '/winners/:winnerId/claim',
  extractUserData,
  idParamValidation,
  lotteryController.claimPrize
);

// Get my lottery wins
router.get(
  '/my-wins',
  extractUserData,
  paginationValidation,
  lotteryController.getMyWins
);

// Auto-trigger lottery (called by system/cron)
router.post(
  '/:electionId/auto-trigger',
  idParamValidation,
  lotteryController.autoTriggerLottery
);

export default router;