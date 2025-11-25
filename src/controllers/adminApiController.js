// src/controllers/adminApiController.js

import apiKeyService from '../services/apiKeyService.js';

// Create new API key
export const createApiKey = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRoles = req.user.roles || [];
    
    // Check if user has admin or manager role
    const isAdminOrManager = userRoles.some(role => 
      ['Admin', 'Manager', 'admin', 'manager'].includes(role)
    );
    
    if (!isAdminOrManager) {
      return res.status(403).json({ success: false, message: 'Only admin/manager can create API keys.' });
    }
    
    const { name, description, environment, expires_at } = req.body;
    
    if (!name?.trim()) {
      return res.status(400).json({ success: false, message: 'Name is required.' });
    }
    
    const apiKey = await apiKeyService.createApiKey(userId, {
      name: name.trim(),
      description: description?.trim() || null,
      environment: environment || 'live',
      expiresAt: expires_at || null
    });
    
    return res.status(201).json({
      success: true,
      message: 'API key created. Save it now - you will not see it again!',
      data: apiKey
    });
  } catch (error) {
    console.error('Create API Key Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create API key.' });
  }
};

// List all API keys
export const getApiKeys = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRoles = req.user.roles || [];
    
    const isAdminOrManager = userRoles.some(role => 
      ['Admin', 'Manager', 'admin', 'manager'].includes(role)
    );
    
    if (!isAdminOrManager) {
      return res.status(403).json({ success: false, message: 'Only admin/manager can view API keys.' });
    }
    
    // Manager sees all, Admin sees all too
    const isManager = userRoles.some(role => ['Manager', 'manager'].includes(role));
    const keys = await apiKeyService.getAllApiKeys(isManager ? null : userId);
    
    return res.status(200).json({ success: true, data: keys });
  } catch (error) {
    console.error('Get API Keys Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch API keys.' });
  }
};

// Get single API key
export const getApiKeyById = async (req, res) => {
  try {
    const { id } = req.params;
    const key = await apiKeyService.getApiKeyById(id);
    
    if (!key) {
      return res.status(404).json({ success: false, message: 'API key not found.' });
    }
    
    return res.status(200).json({ success: true, data: key });
  } catch (error) {
    console.error('Get API Key Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch API key.' });
  }
};

// Update API key
export const updateApiKey = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, is_active, rate_limit_per_minute, rate_limit_per_hour, expires_at } = req.body;
    
    const updated = await apiKeyService.updateApiKey(id, {
      name, description, is_active, rate_limit_per_minute, rate_limit_per_hour, expires_at
    });
    
    if (!updated) {
      return res.status(404).json({ success: false, message: 'API key not found.' });
    }
    
    return res.status(200).json({ success: true, message: 'API key updated.', data: updated });
  } catch (error) {
    console.error('Update API Key Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update API key.' });
  }
};

// Revoke API key
export const revokeApiKey = async (req, res) => {
  try {
    const { id } = req.params;
    const revoked = await apiKeyService.revokeApiKey(id);
    
    if (!revoked) {
      return res.status(404).json({ success: false, message: 'API key not found.' });
    }
    
    return res.status(200).json({ success: true, message: 'API key revoked.' });
  } catch (error) {
    console.error('Revoke API Key Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to revoke API key.' });
  }
};

// Get usage stats
export const getApiKeyUsage = async (req, res) => {
  try {
    const { id } = req.params;
    const { days = 30 } = req.query;
    
    const usage = await apiKeyService.getApiKeyUsage(id, Math.min(90, parseInt(days)));
    
    return res.status(200).json({ success: true, data: usage });
  } catch (error) {
    console.error('Get Usage Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch usage.' });
  }
};