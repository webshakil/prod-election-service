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

router.get('/files', electionController.getAvailableFiles);

router.post(
  '/drafts',
  extractUserData,
  // requireCreator, // 
  determineCreatorType,
  checkElectionCreationEligibility,
  draftValidation,
  electionController.createDraft
);

router.get(
  '/drafts',
  extractUserData,
  //requireCreator,
  electionController.getMyDrafts
);

router.get(
  '/drafts/:id',
  extractUserData,
  // requireCreator, // 
  idParamValidation,
  electionController.getDraft
);

router.patch(
  '/drafts/:id',
  extractUserData,
  // requireCreator, 
  idParamValidation,
  uploadElectionMedia,
  electionController.updateDraft
);

router.delete(
  '/drafts/:id',
  extractUserData,
  // requireCreator, 
  idParamValidation,
  electionController.deleteDraft
);

router.post(
  '/drafts/:id/publish',
  extractUserData,
  // requireCreator, 
  idParamValidation,
  uploadElectionMedia, 
  electionController.publishElection
);

router.get(
  '/check-eligibility',
  extractUserData,
  electionController.checkEligibility
);

// ✅ NEW: Get ALL elections for any authenticated user
router.get(
  '/all-elections',
  extractUserData,
  paginationValidation,
  electionController.getAllElections
);

router.post(
  '/',
  extractUserData,
  // requireCreator, 
  determineCreatorType,
  checkElectionCreationEligibility,
  uploadElectionMedia,
  electionValidation,
  electionController.createElection
);

router.get(
  '/my-elections',
  extractUserData,
  //requireCreator,
  paginationValidation,
  electionController.getMyElections
);

router.get(
  '/public',
  paginationValidation,
  electionController.getPublicElections
);

router.get(
  '/:id',
  idParamValidation,
  electionController.getElection
);

router.get(
  '/slug/:slug',
  electionController.getElectionBySlug
);

router.put(
  '/:id',
  extractUserData,
  // requireCreator, 
  idParamValidation,
  uploadElectionMedia,
  electionController.updateElection
);

router.delete(
  '/:id',
  extractUserData,
  // requireCreator, 
  idParamValidation,
  electionController.deleteElection
);

router.get(
  '/:electionId/questions',
  idParamValidation,
  questionController.getElectionQuestions
);

router.post(
  '/:electionId/questions',
  extractUserData,
  // requireCreator,
  idParamValidation,
  uploadQuestionImage,
  questionValidation,
  questionController.addQuestion
);

router.get(
  '/questions/:questionId',
  idParamValidation,
  questionController.getQuestion
);

router.put(
  '/questions/:questionId',
  extractUserData,
  // requireCreator, 
  idParamValidation,
  uploadQuestionImage,
  questionController.updateQuestion
);

router.delete(
  '/questions/:questionId',
  extractUserData,
  // requireCreator, 
  idParamValidation,
  questionController.deleteQuestion
);

router.post(
  '/questions/:questionId/options',
  extractUserData,
  // requireCreator, //
  idParamValidation,
  uploadOptionImage,
  questionController.addOption
);

router.put(
  '/options/:optionId',
  extractUserData,
  // requireCreator, // 
  idParamValidation,
  uploadOptionImage,
  questionController.updateOption
);

router.delete(
  '/options/:optionId',
  extractUserData,
  // requireCreator, // 
  idParamValidation,
  questionController.deleteOption
);

router.post(
  '/:id/clone',
  extractUserData,
  // requireCreator, 
  idParamValidation,
  cloneExportController.cloneElection
);

router.get(
  '/:id/export',
  extractUserData,
  // requireCreator, // 
  idParamValidation,
  cloneExportController.exportElectionJSON
);

router.get(
  '/:id/export/csv',
  extractUserData,
  // requireCreator, // 
  idParamValidation,
  cloneExportController.exportElectionCSV
);

router.get(
  '/:id/export/questions',
  extractUserData,
  // requireCreator, // 
  idParamValidation,
  cloneExportController.exportQuestions
);

router.post(
  '/:electionId/generate-voting-id',
  extractUserData,
  idParamValidation,
  cloneExportController.generateVotingId
);

export default router;
//last workable code
// import express from 'express';
// import electionController from '../controllers/electionController.js';
// import questionController from '../controllers/questionController.js';
// import cloneExportController from '../controllers/cloneExportController.js';
// import { 
//   extractUserData, 
//   determineCreatorType,
//   requireCreator,
//   requireSubscribedCreator
// } from '../middleware/authMiddleware.js';
// import { checkElectionCreationEligibility } from '../middleware/subscriptionMiddleware.js';
// import { uploadElectionMedia, uploadQuestionImage, uploadOptionImage } from '../middleware/uploadMiddleware.js';
// import { 
//   draftValidation, 
//   electionValidation, 
//   questionValidation,
//   idParamValidation,
//   paginationValidation 
// } from '../utils/validators.js';

// const router = express.Router();

// router.get('/files', electionController.getAvailableFiles);

// router.post(
//   '/drafts',
//   extractUserData,
//   requireCreator,
//   determineCreatorType,
//   checkElectionCreationEligibility,
//   draftValidation,
//   electionController.createDraft
// );

// router.get(
//   '/drafts',
//   extractUserData,
//   //requireCreator,
//   electionController.getMyDrafts
// );

// router.get(
//   '/drafts/:id',
//   extractUserData,
//   requireCreator,
//   idParamValidation,
//   electionController.getDraft
// );

// router.patch(
//   '/drafts/:id',
//   extractUserData,
//   requireCreator,
//   idParamValidation,
//   uploadElectionMedia,
//   electionController.updateDraft
// );

// router.delete(
//   '/drafts/:id',
//   extractUserData,
//   requireCreator,
//   idParamValidation,
//   electionController.deleteDraft
// );

// router.post(
//   '/drafts/:id/publish',
//   extractUserData,
//   requireCreator,
//   idParamValidation,
//   uploadElectionMedia, 
//   electionController.publishElection
// );

// router.get(
//   '/check-eligibility',
//   extractUserData,
//   electionController.checkEligibility
// );

// // ✅ NEW: Get ALL elections for any authenticated user
// router.get(
//   '/all-elections',
//   extractUserData,
//   paginationValidation,
//   electionController.getAllElections
// );

// router.post(
//   '/',
//   extractUserData,
//   requireCreator,
//   determineCreatorType,
//   checkElectionCreationEligibility,
//   uploadElectionMedia,
//   electionValidation,
//   electionController.createElection
// );

// router.get(
//   '/my-elections',
//   extractUserData,
//   //requireCreator,
//   paginationValidation,
//   electionController.getMyElections
// );

// router.get(
//   '/public',
//   paginationValidation,
//   electionController.getPublicElections
// );

// router.get(
//   '/:id',
//   idParamValidation,
//   electionController.getElection
// );

// router.get(
//   '/slug/:slug',
//   electionController.getElectionBySlug
// );

// router.put(
//   '/:id',
//   extractUserData,
//   requireCreator,
//   idParamValidation,
//   uploadElectionMedia,
//   electionController.updateElection
// );

// router.delete(
//   '/:id',
//   extractUserData,
//   requireCreator,
//   idParamValidation,
//   electionController.deleteElection
// );

// router.get(
//   '/:electionId/questions',
//   idParamValidation,
//   questionController.getElectionQuestions
// );

// router.post(
//   '/:electionId/questions',
//   extractUserData,
//   requireCreator,
//   idParamValidation,
//   uploadQuestionImage,
//   questionValidation,
//   questionController.addQuestion
// );

// router.get(
//   '/questions/:questionId',
//   idParamValidation,
//   questionController.getQuestion
// );

// router.put(
//   '/questions/:questionId',
//   extractUserData,
//   requireCreator,
//   idParamValidation,
//   uploadQuestionImage,
//   questionController.updateQuestion
// );

// router.delete(
//   '/questions/:questionId',
//   extractUserData,
//   requireCreator,
//   idParamValidation,
//   questionController.deleteQuestion
// );

// router.post(
//   '/questions/:questionId/options',
//   extractUserData,
//   requireCreator,
//   idParamValidation,
//   uploadOptionImage,
//   questionController.addOption
// );

// router.put(
//   '/options/:optionId',
//   extractUserData,
//   requireCreator,
//   idParamValidation,
//   uploadOptionImage,
//   questionController.updateOption
// );

// router.delete(
//   '/options/:optionId',
//   extractUserData,
//   requireCreator,
//   idParamValidation,
//   questionController.deleteOption
// );

// router.post(
//   '/:id/clone',
//   extractUserData,
//   requireCreator,
//   idParamValidation,
//   cloneExportController.cloneElection
// );

// router.get(
//   '/:id/export',
//   extractUserData,
//   requireCreator,
//   idParamValidation,
//   cloneExportController.exportElectionJSON
// );

// router.get(
//   '/:id/export/csv',
//   extractUserData,
//   requireCreator,
//   idParamValidation,
//   cloneExportController.exportElectionCSV
// );

// router.get(
//   '/:id/export/questions',
//   extractUserData,
//   requireCreator,
//   idParamValidation,
//   cloneExportController.exportQuestions
// );

// router.post(
//   '/:electionId/generate-voting-id',
//   extractUserData,
//   idParamValidation,
//   cloneExportController.generateVotingId
// );

// export default router;
