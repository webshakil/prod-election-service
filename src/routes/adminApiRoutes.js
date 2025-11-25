// src/routes/adminApiRoutes.js
// Admin routes for API key management (Admin/Manager only)

import express from 'express';
import { extractUserData, requireAdmin } from '../middleware/authMiddleware.js';
import {
  createApiKey,
  getApiKeys,
  getApiKeyById,
  updateApiKey,
  revokeApiKey,
  getApiKeyUsage
} from '../controllers/adminApiController.js';

const router = express.Router();

// All routes require login (extractUserData) and admin/manager role
router.use(extractUserData);

// POST /api/admin/api-keys - Create new API key
router.post('/api-keys', createApiKey);

// GET /api/admin/api-keys - List all API keys
router.get('/api-keys', getApiKeys);

// GET /api/admin/api-keys/:id - Get single API key
router.get('/api-keys/:id', getApiKeyById);

// PATCH /api/admin/api-keys/:id - Update API key
router.patch('/api-keys/:id', updateApiKey);

// DELETE /api/admin/api-keys/:id - Revoke API key
router.delete('/api-keys/:id', revokeApiKey);

// GET /api/admin/api-keys/:id/usage - Get usage stats
router.get('/api-keys/:id/usage', getApiKeyUsage);

export default router;
// // src/routes/adminApiRoutes.js
// // Admin routes for API key management (Admin/Manager only)

// import express from 'express';
// import { authMiddleware } from '../middleware/authMiddleware.js';
// import authMiddleware from '../middleware/authMiddleware.js';
// import {
//   createApiKey,
//   getApiKeys,
//   getApiKeyById,
//   updateApiKey,
//   revokeApiKey,
//   getApiKeyUsage
// } from '../controllers/adminApiController.js';

// const router = express.Router();

// // =============================================
// // ADMIN API KEY MANAGEMENT ROUTES
// // All routes require user authentication
// // =============================================

// // Apply authentication middleware to all routes
// router.use(authMiddleware);

// /**
//  * @route   POST /api/admin/api-keys
//  * @desc    Generate a new API key
//  * @access  Admin, Manager
//  * @body    { name, description?, environment?, expires_at? }
//  * 
//  * @example
//  * curl -X POST "https://api.vottery.com/api/admin/api-keys" \
//  *   -H "Authorization: Bearer YOUR_JWT_TOKEN" \
//  *   -H "Content-Type: application/json" \
//  *   -d '{"name": "Mobile App", "description": "API key for mobile app", "environment": "live"}'
//  */
// router.post('/api-keys', createApiKey);

// /**
//  * @route   GET /api/admin/api-keys
//  * @desc    List all API keys (Admin sees all, Manager sees own)
//  * @access  Admin, Manager
//  * 
//  * @example
//  * curl -X GET "https://api.vottery.com/api/admin/api-keys" \
//  *   -H "Authorization: Bearer YOUR_JWT_TOKEN"
//  */
// router.get('/api-keys', getApiKeys);

// /**
//  * @route   GET /api/admin/api-keys/:id
//  * @desc    Get single API key details
//  * @access  Admin, Manager (own keys only for Manager)
//  * 
//  * @example
//  * curl -X GET "https://api.vottery.com/api/admin/api-keys/1" \
//  *   -H "Authorization: Bearer YOUR_JWT_TOKEN"
//  */
// router.get('/api-keys/:id', getApiKeyById);

// /**
//  * @route   PATCH /api/admin/api-keys/:id
//  * @desc    Update API key (name, description, status, rate limits)
//  * @access  Admin, Manager (own keys only for Manager)
//  * @body    { name?, description?, is_active?, rate_limit_per_minute?, rate_limit_per_hour?, expires_at? }
//  * 
//  * @example
//  * curl -X PATCH "https://api.vottery.com/api/admin/api-keys/1" \
//  *   -H "Authorization: Bearer YOUR_JWT_TOKEN" \
//  *   -H "Content-Type: application/json" \
//  *   -d '{"is_active": false}'
//  */
// router.patch('/api-keys/:id', updateApiKey);

// /**
//  * @route   DELETE /api/admin/api-keys/:id
//  * @desc    Revoke (delete) an API key
//  * @access  Admin, Manager (own keys only for Manager)
//  * 
//  * @example
//  * curl -X DELETE "https://api.vottery.com/api/admin/api-keys/1" \
//  *   -H "Authorization: Bearer YOUR_JWT_TOKEN"
//  */
// router.delete('/api-keys/:id', revokeApiKey);

// /**
//  * @route   GET /api/admin/api-keys/:id/usage
//  * @desc    Get usage statistics for an API key
//  * @access  Admin, Manager (own keys only for Manager)
//  * @query   days (default: 30, max: 90)
//  * 
//  * @example
//  * curl -X GET "https://api.vottery.com/api/admin/api-keys/1/usage?days=30" \
//  *   -H "Authorization: Bearer YOUR_JWT_TOKEN"
//  */
// router.get('/api-keys/:id/usage', getApiKeyUsage);

// export default router;