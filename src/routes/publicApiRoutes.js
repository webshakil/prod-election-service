// src/routes/publicApiRoutes.js
// External API routes - requires API key

import express from 'express';
import apiKeyAuth from '../middleware/apiKeyAuth.js';
import {
  getElections,
  getElectionById,
  getElectionQuestions,
  getElectionResults,
  getElectionStats,
  getCategories
} from '../controllers/publicApiController.js';

const router = express.Router();

// Health check (no auth)
router.get('/health', (req, res) => {
  res.json({ success: true, status: 'healthy', version: 'v1', timestamp: new Date().toISOString() });
});

// All other routes require API key
router.use(apiKeyAuth);

router.get('/elections', getElections);
router.get('/elections/:id', getElectionById);
router.get('/elections/:id/questions', getElectionQuestions);
router.get('/elections/:id/results', getElectionResults);
router.get('/elections/:id/stats', getElectionStats);
router.get('/categories', getCategories);

export default router;
// // src/routes/publicApiRoutes.js
// // Public API routes for external integrations (requires API key)

// import express from 'express';
// import { apiKeyAuth } from '../middleware/apiKeyAuth.js';
// import {
//   getElections,
//   getElectionById,
//   getElectionQuestions,
//   getElectionResults,
//   getElectionStats,
//   getCategories
// } from '../controllers/publicApiController.js';

// const router = express.Router();

// // =============================================
// // PUBLIC API v1 ROUTES
// // All routes require API key authentication
// // =============================================

// // Apply API key authentication to all routes except health check
// router.use((req, res, next) => {
//   // Skip auth for health check
//   if (req.path === '/health') {
//     return next();
//   }
//   return apiKeyAuth(req, res, next);
// });

// /**
//  * @route   GET /api/v1/health
//  * @desc    Health check endpoint (no auth required)
//  * @access  Public
//  */
// router.get('/health', (req, res) => {
//   res.json({
//     success: true,
//     data: {
//       status: 'healthy',
//       version: 'v1',
//       timestamp: new Date().toISOString()
//     }
//   });
// });

// /**
//  * @route   GET /api/v1/elections
//  * @desc    List all public elections with pagination
//  * @access  API Key Required
//  * @query   page, limit, status, category_id, voting_type, sort_by, sort_order
//  * 
//  * @example
//  * curl -X GET "https://api.vottery.com/api/v1/elections?page=1&limit=10" \
//  *   -H "X-API-Key: vt_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
//  */
// router.get('/elections', getElections);

// /**
//  * @route   GET /api/v1/elections/:id
//  * @desc    Get single election details
//  * @access  API Key Required
//  * 
//  * @example
//  * curl -X GET "https://api.vottery.com/api/v1/elections/123" \
//  *   -H "X-API-Key: vt_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
//  */
// router.get('/elections/:id', getElectionById);

// /**
//  * @route   GET /api/v1/elections/:id/questions
//  * @desc    Get all questions for an election
//  * @access  API Key Required
//  * 
//  * @example
//  * curl -X GET "https://api.vottery.com/api/v1/elections/123/questions" \
//  *   -H "X-API-Key: vt_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
//  */
// router.get('/elections/:id/questions', getElectionQuestions);

// /**
//  * @route   GET /api/v1/elections/:id/results
//  * @desc    Get election results (only for completed elections)
//  * @access  API Key Required
//  * 
//  * @example
//  * curl -X GET "https://api.vottery.com/api/v1/elections/123/results" \
//  *   -H "X-API-Key: vt_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
//  */
// router.get('/elections/:id/results', getElectionResults);

// /**
//  * @route   GET /api/v1/elections/:id/stats
//  * @desc    Get election statistics
//  * @access  API Key Required
//  * 
//  * @example
//  * curl -X GET "https://api.vottery.com/api/v1/elections/123/stats" \
//  *   -H "X-API-Key: vt_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
//  */
// router.get('/elections/:id/stats', getElectionStats);

// /**
//  * @route   GET /api/v1/categories
//  * @desc    List all election categories
//  * @access  API Key Required
//  * 
//  * @example
//  * curl -X GET "https://api.vottery.com/api/v1/categories" \
//  *   -H "X-API-Key: vt_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
//  */
// router.get('/categories', getCategories);

// export default router;