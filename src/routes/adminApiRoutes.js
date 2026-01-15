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
