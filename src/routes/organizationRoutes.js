import express from 'express';
import organizationController from '../controllers/organizationController.js';
import { 
  extractUserData,
  requireOrganizationCreator,
  requireOrganizationOwner,
  requireOrganizationManager,
  requireAnyRole
} from '../middleware/authMiddleware.js';
import { uploadOrganizationLogo } from '../middleware/uploadMiddleware.js';
import { 
  organizationValidation,
  idParamValidation,
  paginationValidation 
} from '../utils/validators.js';

const router = express.Router();

// ============================================
// ORGANIZATION CRUD
// ============================================

// Create organization
router.post(
  '/',
  extractUserData,
  uploadOrganizationLogo,
  organizationValidation,
  organizationController.createOrganization
);

// Get all my organizations
router.get(
  '/my-organizations',
  extractUserData,
  paginationValidation,
  organizationController.getMyOrganizations
);

// Get organization by ID
router.get(
  '/:id',
  extractUserData,
  idParamValidation,
  organizationController.getOrganization
);

// Update organization
router.put(
  '/:id',
  extractUserData,
  requireOrganizationOwner,
  idParamValidation,
  uploadOrganizationLogo,
  organizationController.updateOrganization
);

// Delete organization
router.delete(
  '/:id',
  extractUserData,
  requireOrganizationOwner,
  idParamValidation,
  organizationController.deleteOrganization
);

// ============================================
// ORGANIZATION MEMBERS
// ============================================

// Get all members of organization
router.get(
  '/:id/members',
  extractUserData,
  requireAnyRole(['Organization_Owner', 'Organization_Manager', 'Organization_Team_Member']),
  idParamValidation,
  paginationValidation,
  organizationController.getMembers
);

// Invite member to organization
router.post(
  '/:id/members/invite',
  extractUserData,
  requireOrganizationManager,
  idParamValidation,
  organizationController.inviteMember
);

// Update member role
router.put(
  '/:id/members/:memberId',
  extractUserData,
  requireOrganizationManager,
  idParamValidation,
  organizationController.updateMemberRole
);

// Remove member from organization
router.delete(
  '/:id/members/:memberId',
  extractUserData,
  requireOrganizationManager,
  idParamValidation,
  organizationController.removeMember
);

// ============================================
// ORGANIZATION ELECTIONS
// ============================================

// Get all elections for organization
router.get(
  '/:id/elections',
  extractUserData,
  requireAnyRole(['Organization_Owner', 'Organization_Manager', 'Organization_Team_Member']),
  idParamValidation,
  paginationValidation,
  organizationController.getOrganizationElections
);

// ============================================
// ORGANIZATION SETTINGS
// ============================================

// Get organization settings
router.get(
  '/:id/settings',
  extractUserData,
  requireOrganizationManager,
  idParamValidation,
  organizationController.getSettings
);

// Update organization settings
router.put(
  '/:id/settings',
  extractUserData,
  requireOrganizationOwner,
  idParamValidation,
  organizationController.updateSettings
);

export default router;