// src/routes/publicApiRoutes.js
import express from 'express';
import apiKeyAuth from '../middleware/apiKeyAuth.js';
import {
  getElections,
  getElectionById,
  getElectionQuestions,
  getElectionResults,
  getElectionStats,
  getCategories,
  getMyElections,      // ✅ NEW
  getMyElectionById    // ✅ NEW
} from '../controllers/publicApiController.js';

const router = express.Router();

// Health check (no auth)
router.get('/health', (req, res) => {
  res.json({ success: true, status: 'healthy', version: 'v1', timestamp: new Date().toISOString() });
});

// All other routes require API key
router.use(apiKeyAuth);

// Public elections (anyone can see public elections)
router.get('/elections', getElections);
router.get('/elections/:id', getElectionById);
router.get('/elections/:id/questions', getElectionQuestions);
router.get('/elections/:id/results', getElectionResults);
router.get('/elections/:id/stats', getElectionStats);
router.get('/categories', getCategories);

// ✅ NEW: User's own elections (filtered by API key owner)
router.get('/my/elections', getMyElections);
router.get('/my/elections/:id', getMyElectionById);

export default router;
// // src/routes/publicApiRoutes.js
// // External API routes - requires API key

// import express from 'express';
// import apiKeyAuth from '../middleware/apiKeyAuth.js';
// import {
//   getElections,
//   getElectionById,
//   getElectionQuestions,
//   getElectionResults,
//   getElectionStats,
//   getCategories
// } from '../controllers/publicApiController.js';

// const router = express.Router();

// // Health check (no auth)
// router.get('/health', (req, res) => {
//   res.json({ success: true, status: 'healthy', version: 'v1', timestamp: new Date().toISOString() });
// });

// // All other routes require API key
// router.use(apiKeyAuth);

// router.get('/elections', getElections);
// router.get('/elections/:id', getElectionById);
// router.get('/elections/:id/questions', getElectionQuestions);
// router.get('/elections/:id/results', getElectionResults);
// router.get('/elections/:id/stats', getElectionStats);
// router.get('/categories', getCategories);

// export default router;
