import express from 'express';
import contentCreatorController from '../controllers/contentCreatorController.js';
import { extractUserData, requireContentCreator } from '../middleware/authMiddleware.js';
import { idParamValidation, paginationValidation } from '../utils/validators.js';

const router = express.Router();

// ============================================
// VOTTERY ICON ROUTES
// ============================================

// Create Vottery icon
router.post(
  '/icons',
  extractUserData,
  requireContentCreator,
  contentCreatorController.createVotteryIcon
);

// Get my icons
router.get(
  '/icons',
  extractUserData,
  requireContentCreator,
  paginationValidation,
  contentCreatorController.getMyIcons
);

// Toggle icon visibility
router.patch(
  '/icons/:iconId/visibility',
  extractUserData,
  requireContentCreator,
  idParamValidation,
  contentCreatorController.toggleIconVisibility
);

// ============================================
// ONE-TIME VOTING LINKS
// ============================================

// Generate one-time link
router.post(
  '/elections/:electionId/one-time-link',
  extractUserData,
  requireContentCreator,
  idParamValidation,
  contentCreatorController.generateOneTimeLink
);

// Validate one-time link (public)
router.get(
  '/one-time-link/:linkToken/validate',
  contentCreatorController.validateOneTimeLink
);

// Mark link as used
router.post(
  '/one-time-link/:linkId/mark-used',
  idParamValidation,
  contentCreatorController.markLinkAsUsed
);

// ============================================
// PROJECTED REVENUE TRACKING
// ============================================

// Track projected revenue
router.post(
  '/revenue',
  extractUserData,
  requireContentCreator,
  contentCreatorController.trackProjectedRevenue
);

// Get revenue report
router.get(
  '/revenue/report',
  extractUserData,
  requireContentCreator,
  contentCreatorController.getRevenueReport
);

// ============================================
// PERSONALIZED INTERFACE
// ============================================

// Get personalized voting interface
router.get(
  '/elections/:electionId/interface',
  idParamValidation,
  contentCreatorController.getPersonalizedInterface
);

export default router;