import express from 'express';
import electionController from '../controllers/electionController.js';
import questionController from '../controllers/questionController.js';
import cloneExportController from '../controllers/cloneExportController.js';
import { 
  extractUserData, 
  determineCreatorType,
  requireCreator,
  requireSubscribedCreator
} from '../middleware/authMiddleware.js';
import { checkElectionCreationEligibility } from '../middleware/subscriptionMiddleware.js';
import { uploadElectionMedia, uploadQuestionImage, uploadOptionImage } from '../middleware/uploadMiddleware.js';
import { 
  draftValidation, 
  electionValidation, 
  questionValidation,
  idParamValidation,
  paginationValidation 
} from '../utils/validators.js';

const router = express.Router();

// ============================================
// DRAFT ROUTES
// ============================================

// Create draft (basic info only)
router.post(
  '/drafts',
  extractUserData,
  requireCreator,
  determineCreatorType,
  checkElectionCreationEligibility,
  draftValidation,
  electionController.createDraft
);

// Get all my drafts
router.get(
  '/drafts',
  extractUserData,
  requireCreator,
  electionController.getMyDrafts
);

// Get single draft
router.get(
  '/drafts/:id',
  extractUserData,
  requireCreator,
  idParamValidation,
  electionController.getDraft
);

// Update draft (including media upload)
router.patch(
  '/drafts/:id',
  extractUserData,
  requireCreator,
  idParamValidation,
  uploadElectionMedia,
  electionController.updateDraft
);

// Delete draft
router.delete(
  '/drafts/:id',
  extractUserData,
  requireCreator,
  idParamValidation,
  electionController.deleteDraft
);

// Publish election from draft
router.post(
  '/drafts/:id/publish',
  extractUserData,
  requireCreator,
  idParamValidation,
  uploadElectionMedia, 
  electionController.publishElection
);

// ============================================
// ELECTION ROUTES
// ============================================

// Check eligibility to create election
router.get(
  '/check-eligibility',
  extractUserData,
  electionController.checkEligibility
);

// Create election directly (without draft)
router.post(
  '/',
  extractUserData,
  requireCreator,
  determineCreatorType,
  checkElectionCreationEligibility,
  uploadElectionMedia,
  electionValidation,
  electionController.createElection
);

// Get all my elections
router.get(
  '/my-elections',
  extractUserData,
  requireCreator,
  paginationValidation,
  electionController.getMyElections
);

// Get public elections (no auth required)
router.get(
  '/public',
  paginationValidation,
  electionController.getPublicElections
);

// Get election by ID (public access)
router.get(
  '/:id',
  idParamValidation,
  electionController.getElection
);

// Get election by slug (public access)
router.get(
  '/slug/:slug',
  electionController.getElectionBySlug
);

// Update election
router.put(
  '/:id',
  extractUserData,
  requireCreator,
  idParamValidation,
  uploadElectionMedia,
  electionController.updateElection
);

// Delete election
router.delete(
  '/:id',
  extractUserData,
  requireCreator,
  idParamValidation,
  electionController.deleteElection
);

// ============================================
// QUESTION ROUTES
// ============================================

// Get all questions for an election (public access)
router.get(
  '/:electionId/questions',
  idParamValidation,
  questionController.getElectionQuestions
);

// Add question to election
router.post(
  '/:electionId/questions',
  extractUserData,
  requireCreator,
  idParamValidation,
  uploadQuestionImage,
  questionValidation,
  questionController.addQuestion
);

// Get single question (public access)
router.get(
  '/questions/:questionId',
  idParamValidation,
  questionController.getQuestion
);

// Update question
router.put(
  '/questions/:questionId',
  extractUserData,
  requireCreator,
  idParamValidation,
  uploadQuestionImage,
  questionController.updateQuestion
);

// Delete question
router.delete(
  '/questions/:questionId',
  extractUserData,
  requireCreator,
  idParamValidation,
  questionController.deleteQuestion
);

// ============================================
// OPTION ROUTES
// ============================================

// Add option to question
router.post(
  '/questions/:questionId/options',
  extractUserData,
  requireCreator,
  idParamValidation,
  uploadOptionImage,
  questionController.addOption
);

// Update option
router.put(
  '/options/:optionId',
  extractUserData,
  requireCreator,
  idParamValidation,
  uploadOptionImage,
  questionController.updateOption
);

// Delete option
router.delete(
  '/options/:optionId',
  extractUserData,
  requireCreator,
  idParamValidation,
  questionController.deleteOption
);

// ============================================
// CLONE & EXPORT ROUTES
// ============================================

// Clone election
router.post(
  '/:id/clone',
  extractUserData,
  requireCreator,
  idParamValidation,
  cloneExportController.cloneElection
);

// Export election data (JSON)
router.get(
  '/:id/export',
  extractUserData,
  requireCreator,
  idParamValidation,
  cloneExportController.exportElectionJSON
);

// Export election data (CSV)
router.get(
  '/:id/export/csv',
  extractUserData,
  requireCreator,
  idParamValidation,
  cloneExportController.exportElectionCSV
);

// Export questions only
router.get(
  '/:id/export/questions',
  extractUserData,
  requireCreator,
  idParamValidation,
  cloneExportController.exportQuestions
);

// Generate unique voting ID
router.post(
  '/:electionId/generate-voting-id',
  extractUserData,
  idParamValidation,
  cloneExportController.generateVotingId
);

export default router;