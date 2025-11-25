// src/middleware/apiKeyAuth.js

import apiKeyService from '../services/apiKeyService.js';

const apiKeyAuth = async (req, res, next) => {
  const startTime = Date.now();
  
  try {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: { code: 'MISSING_API_KEY', message: 'API key required. Include X-API-Key header.' }
      });
    }
    
    // Validate key
    const validation = await apiKeyService.validateApiKey(apiKey);
    
    if (!validation.valid) {
      const messages = {
        INVALID_FORMAT: 'Invalid API key format.',
        KEY_NOT_FOUND: 'Invalid or revoked API key.',
        KEY_DISABLED: 'API key has been disabled.',
        KEY_EXPIRED: 'API key has expired.'
      };
      
      return res.status(401).json({
        success: false,
        error: { code: validation.error, message: messages[validation.error] || 'Invalid API key.' }
      });
    }
    
    const { keyData } = validation;
    
    // Check rate limit
    const rateLimit = await apiKeyService.checkRateLimit(keyData.id, keyData.rate_limit_per_minute);
    
    // Add rate limit headers
    res.set({
      'X-RateLimit-Limit': keyData.rate_limit_per_minute,
      'X-RateLimit-Remaining': rateLimit.remaining,
      'X-RateLimit-Reset': rateLimit.resetAt.toISOString()
    });
    
    if (!rateLimit.allowed) {
      res.set('Retry-After', rateLimit.retryAfter);
      return res.status(429).json({
        success: false,
        error: { 
          code: 'RATE_LIMIT_EXCEEDED', 
          message: `Too many requests. Retry after ${rateLimit.retryAfter} seconds.`,
          retry_after: rateLimit.retryAfter
        }
      });
    }
    
    // Attach key data to request
    req.apiKey = keyData;
    
    // Log request after response
    res.on('finish', () => {
      apiKeyService.logRequest(keyData.id, {
        endpoint: req.originalUrl,
        method: req.method,
        statusCode: res.statusCode,
        responseTimeMs: Date.now() - startTime,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      });
    });
    
    next();
    
  } catch (error) {
    console.error('API Key Auth Error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'AUTH_ERROR', message: 'Authentication error.' }
    });
  }
};

export { apiKeyAuth };
export default apiKeyAuth;