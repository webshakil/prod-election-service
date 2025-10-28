import express from 'express';
import securityController from '../controllers/securityController.js';
import { extractUserData, requireCreator, requireAuditor } from '../middleware/authMiddleware.js';
import { idParamValidation, paginationValidation } from '../utils/validators.js';

const router = express.Router();

// ============================================
// SECURITY CONFIGURATION ROUTES
// ============================================

// Configure security settings
router.post(
  '/elections/:electionId/config',
  extractUserData,
  requireCreator,
  idParamValidation,
  securityController.configureSecuritySettings
);

// Get security configuration
router.get(
  '/elections/:electionId/config',
  idParamValidation,
  securityController.getSecurityConfig
);

// Toggle specific security feature
router.patch(
  '/elections/:electionId/toggle',
  extractUserData,
  requireCreator,
  idParamValidation,
  securityController.toggleSecurityFeature
);

// Get security summary
router.get(
  '/elections/:electionId/summary',
  extractUserData,
  idParamValidation,
  securityController.getSecuritySummary
);

// ============================================
// AUDIT TRAIL ROUTES
// ============================================

// Log audit event
router.post(
  '/audit',
  extractUserData,
  securityController.logAuditEvent
);

// Get audit trail
router.get(
  '/elections/:electionId/audit',
  extractUserData,
  idParamValidation,
  paginationValidation,
  securityController.getAuditTrail
);

// Verify audit trail integrity
router.get(
  '/elections/:electionId/audit/verify',
  extractUserData,
  requireAuditor,
  idParamValidation,
  securityController.verifyAuditIntegrity
);

export default router;