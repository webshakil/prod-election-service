// src/services/apiKeyService.js

import crypto from 'crypto';
import pool from '../config/database.js';

class ApiKeyService {
  
  // Generate new API key: vt_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  generateApiKey(environment = 'live') {
    const prefix = `vt_${environment}_`;
    const randomPart = crypto.randomBytes(24).toString('hex');
    const fullKey = prefix + randomPart;
    
    return {
      fullKey,
      keyId: `vt_${environment}_${randomPart.substring(0, 8)}`,
      keyPrefix: fullKey.substring(0, 16) + '...',
      keyHash: this.hashApiKey(fullKey)
    };
  }
  
  // HMAC-SHA256 hash
  hashApiKey(apiKey) {
    const secret = process.env.API_KEY_HASH_SECRET || 'vottery-api-secret-change-in-production';
    return crypto.createHmac('sha256', secret).update(apiKey).digest('hex');
  }
  
  // Create new API key
  async createApiKey(userId, data) {
    const { name, description, environment = 'live', expiresAt = null } = data;
    const { fullKey, keyId, keyPrefix, keyHash } = this.generateApiKey(environment);
    
    const result = await pool.query(`
      INSERT INTO votteryy_api_keys 
      (key_id, api_key_hash, key_prefix, user_id, name, description, environment, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, key_id, key_prefix, name, description, environment, 
                rate_limit_per_minute, rate_limit_per_hour, is_active, created_at, expires_at
    `, [keyId, keyHash, keyPrefix, userId, name, description, environment, expiresAt]);
    
    return { ...result.rows[0], api_key: fullKey };
  }
  
  // Validate API key
  async validateApiKey(apiKey) {
    if (!apiKey || !apiKey.startsWith('vt_')) {
      return { valid: false, error: 'INVALID_FORMAT' };
    }
    
    const keyHash = this.hashApiKey(apiKey);
    
    const result = await pool.query(`
      SELECT id, key_id, user_id, name, rate_limit_per_minute, rate_limit_per_hour,
             is_active, environment, expires_at
      FROM votteryy_api_keys WHERE api_key_hash = $1
    `, [keyHash]);
    
    if (result.rows.length === 0) {
      return { valid: false, error: 'KEY_NOT_FOUND' };
    }
    
    const keyData = result.rows[0];
    
    if (!keyData.is_active) {
      return { valid: false, error: 'KEY_DISABLED' };
    }
    
    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return { valid: false, error: 'KEY_EXPIRED' };
    }
    
    // Update last_used_at
    await pool.query('UPDATE votteryy_api_keys SET last_used_at = NOW() WHERE id = $1', [keyData.id]);
    
    return { valid: true, keyData };
  }
  
  // Check rate limit
  async checkRateLimit(keyId, limitPerMinute = 60) {
    const now = new Date();
    const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 
                                  now.getHours(), now.getMinutes(), 0, 0);
    
    const result = await pool.query(`
      INSERT INTO votteryy_api_rate_limits (api_key_id, window_start, window_type, request_count)
      VALUES ($1, $2, 'minute', 1)
      ON CONFLICT (api_key_id, window_start, window_type)
      DO UPDATE SET request_count = votteryy_api_rate_limits.request_count + 1
      RETURNING request_count
    `, [keyId, windowStart]);
    
    const requestCount = result.rows[0].request_count;
    const resetAt = new Date(windowStart.getTime() + 60000);
    
    if (requestCount > limitPerMinute) {
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter: Math.ceil((resetAt.getTime() - now.getTime()) / 1000)
      };
    }
    
    return { allowed: true, remaining: limitPerMinute - requestCount, resetAt };
  }
  
  // Log API request
  async logRequest(keyId, data) {
    const { endpoint, method, statusCode, responseTimeMs, ipAddress, userAgent } = data;
    
    try {
      await pool.query(`
        INSERT INTO votteryy_api_key_usage 
        (api_key_id, endpoint, method, status_code, response_time_ms, ip_address, user_agent)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [keyId, endpoint, method, statusCode, responseTimeMs, ipAddress, userAgent]);
    } catch (error) {
      console.error('Failed to log API request:', error);
    }
  }
  
  // Get all API keys (for admin)
  async getAllApiKeys(userId = null) {
    let query = `
      SELECT ak.*, ud.first_name, ud.last_name
      FROM votteryy_api_keys ak
      LEFT JOIN votteryy_user_details ud ON ak.user_id = ud.user_id
    `;
    
    const params = [];
    if (userId) {
      query += ' WHERE ak.user_id = $1';
      params.push(userId);
    }
    query += ' ORDER BY ak.created_at DESC';
    
    const result = await pool.query(query, params);
    return result.rows.map(row => ({
      ...row,
      created_by: `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unknown'
    }));
  }
  
  // Get single API key
  async getApiKeyById(id) {
    const result = await pool.query(`
      SELECT ak.*, ud.first_name, ud.last_name
      FROM votteryy_api_keys ak
      LEFT JOIN votteryy_user_details ud ON ak.user_id = ud.user_id
      WHERE ak.id = $1
    `, [id]);
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return { ...row, created_by: `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unknown' };
  }
  
  // Update API key
  async updateApiKey(id, data) {
    const { name, description, is_active, rate_limit_per_minute, rate_limit_per_hour, expires_at } = data;
    
    const result = await pool.query(`
      UPDATE votteryy_api_keys SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        is_active = COALESCE($3, is_active),
        rate_limit_per_minute = COALESCE($4, rate_limit_per_minute),
        rate_limit_per_hour = COALESCE($5, rate_limit_per_hour),
        expires_at = $6
      WHERE id = $7
      RETURNING *
    `, [name, description, is_active, rate_limit_per_minute, rate_limit_per_hour, expires_at, id]);
    
    return result.rows[0] || null;
  }
  
  // Revoke API key
  async revokeApiKey(id) {
    const result = await pool.query('DELETE FROM votteryy_api_keys WHERE id = $1 RETURNING *', [id]);
    return result.rows[0] || null;
  }
  
  // Get usage stats
  async getApiKeyUsage(keyId, days = 30) {
    const result = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total_requests,
        COUNT(*) FILTER (WHERE status_code >= 200 AND status_code < 300) as successful,
        COUNT(*) FILTER (WHERE status_code >= 400) as errors,
        AVG(response_time_ms)::integer as avg_response_time
      FROM votteryy_api_key_usage
      WHERE api_key_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `, [keyId]);
    
    return result.rows;
  }
}

export default new ApiKeyService();
// // src/services/apiKeyService.js
// // Service for generating, validating, and managing API keys

// import crypto from 'crypto';
// import pool from '../config/database.js';

// class ApiKeyService {
  
//   /**
//    * Generate a new API key
//    * Format: vt_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (44 chars total)
//    */
//   generateApiKey(environment = 'live') {
//     const prefix = `vt_${environment}_`;
//     const randomPart = crypto.randomBytes(24).toString('hex'); // 48 chars
//     const fullKey = prefix + randomPart;
    
//     return {
//       fullKey,                                    // Full key (shown once to user)
//       keyId: `vt_${environment}_${randomPart.substring(0, 8)}`, // Public ID
//       keyPrefix: fullKey.substring(0, 16) + '...', // For display
//       keyHash: this.hashApiKey(fullKey)           // For storage
//     };
//   }
  
//   /**
//    * Hash API key using HMAC-SHA256 with secret
//    * More secure than plain SHA-256 - protected against rainbow tables
//    */
//   hashApiKey(apiKey) {
//     // Use environment variable for the secret, with fallback for development
//     const secret = process.env.API_KEY_HASH_SECRET || 'vottery-api-key-secret-change-in-production';
    
//     if (!process.env.API_KEY_HASH_SECRET) {
//       console.warn('WARNING: API_KEY_HASH_SECRET not set. Using default secret. Set this in production!');
//     }
    
//     return crypto.createHmac('sha256', secret).update(apiKey).digest('hex');
//   }
  
//   /**
//    * Create a new API key in database
//    */
//   async createApiKey(userId, data) {
//     const { name, description, environment = 'live', expiresAt = null } = data;
    
//     // Generate the key
//     const { fullKey, keyId, keyPrefix, keyHash } = this.generateApiKey(environment);
    
//     const query = `
//       INSERT INTO votteryy_api_keys (
//         key_id, api_key_hash, key_prefix, user_id, 
//         name, description, environment, expires_at
//       )
//       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
//       RETURNING id, key_id, key_prefix, name, description, environment, 
//                 permissions, rate_limit_per_minute, rate_limit_per_hour,
//                 is_active, created_at, expires_at
//     `;
    
//     const values = [
//       keyId,
//       keyHash,
//       keyPrefix,
//       userId,
//       name,
//       description || null,
//       environment,
//       expiresAt
//     ];
    
//     const result = await pool.query(query, values);
    
//     return {
//       ...result.rows[0],
//       api_key: fullKey  // Return full key ONLY on creation (never stored/shown again)
//     };
//   }
  
//   /**
//    * Validate API key and return key data if valid
//    */
//   async validateApiKey(apiKey) {
//     if (!apiKey || !apiKey.startsWith('vt_')) {
//       return { valid: false, error: 'INVALID_FORMAT' };
//     }
    
//     const keyHash = this.hashApiKey(apiKey);
    
//     const query = `
//       SELECT 
//         id, key_id, user_id, name, permissions,
//         allowed_endpoints, allowed_ips,
//         rate_limit_per_minute, rate_limit_per_hour,
//         is_active, environment, expires_at, last_used_at
//       FROM votteryy_api_keys
//       WHERE api_key_hash = $1
//     `;
    
//     const result = await pool.query(query, [keyHash]);
    
//     if (result.rows.length === 0) {
//       return { valid: false, error: 'KEY_NOT_FOUND' };
//     }
    
//     const keyData = result.rows[0];
    
//     // Check if active
//     if (!keyData.is_active) {
//       return { valid: false, error: 'KEY_DISABLED' };
//     }
    
//     // Check if expired
//     if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
//       return { valid: false, error: 'KEY_EXPIRED' };
//     }
    
//     // Update last_used_at
//     await pool.query(
//       'UPDATE votteryy_api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
//       [keyData.id]
//     );
    
//     return { valid: true, keyData };
//   }
  
//   /**
//    * Check rate limit for an API key
//    * Returns { allowed: boolean, remaining: number, resetAt: Date }
//    */
//   async checkRateLimit(keyId, limitPerMinute = 60) {
//     const now = new Date();
//     const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 
//                                   now.getHours(), now.getMinutes(), 0, 0);
    
//     const client = await pool.connect();
    
//     try {
//       await client.query('BEGIN');
      
//       // Get or create rate limit record
//       const upsertQuery = `
//         INSERT INTO votteryy_api_rate_limits (api_key_id, window_start, window_type, request_count)
//         VALUES ($1, $2, 'minute', 1)
//         ON CONFLICT (api_key_id, window_start, window_type)
//         DO UPDATE SET request_count = votteryy_api_rate_limits.request_count + 1
//         RETURNING request_count
//       `;
      
//       const result = await client.query(upsertQuery, [keyId, windowStart]);
//       const requestCount = result.rows[0].request_count;
      
//       await client.query('COMMIT');
      
//       const resetAt = new Date(windowStart.getTime() + 60000); // Next minute
      
//       if (requestCount > limitPerMinute) {
//         return {
//           allowed: false,
//           remaining: 0,
//           resetAt,
//           retryAfter: Math.ceil((resetAt.getTime() - now.getTime()) / 1000)
//         };
//       }
      
//       return {
//         allowed: true,
//         remaining: limitPerMinute - requestCount,
//         resetAt
//       };
      
//     } catch (error) {
//       await client.query('ROLLBACK');
//       console.error('Rate limit check error:', error);
//       // On error, allow the request (fail open)
//       return { allowed: true, remaining: limitPerMinute, resetAt: new Date() };
//     } finally {
//       client.release();
//     }
//   }
  
//   /**
//    * Log API request for analytics
//    */
//   async logRequest(keyId, requestData) {
//     const { endpoint, method, statusCode, responseTimeMs, ipAddress, userAgent } = requestData;
    
//     try {
//       await pool.query(`
//         INSERT INTO votteryy_api_key_usage 
//         (api_key_id, endpoint, method, status_code, response_time_ms, ip_address, user_agent)
//         VALUES ($1, $2, $3, $4, $5, $6, $7)
//       `, [keyId, endpoint, method, statusCode, responseTimeMs, ipAddress, userAgent]);
//     } catch (error) {
//       console.error('Failed to log API request:', error);
//       // Don't throw - logging failure shouldn't break the request
//     }
//   }
  
//   /**
//    * Get all API keys for admin view (with creator info from votteryy_user_details)
//    */
//   async getAllApiKeys(userId = null) {
//     let query = `
//       SELECT 
//         ak.id, ak.key_id, ak.key_prefix, ak.user_id, ak.name, ak.description,
//         ak.permissions, ak.allowed_endpoints, ak.allowed_ips,
//         ak.rate_limit_per_minute, ak.rate_limit_per_hour,
//         ak.is_active, ak.environment, ak.created_at, ak.updated_at, 
//         ak.last_used_at, ak.expires_at,
//         ud.first_name as created_by_first_name,
//         ud.last_name as created_by_last_name
//       FROM votteryy_api_keys ak
//       LEFT JOIN votteryy_user_details ud ON ak.user_id = ud.user_id
//     `;
    
//     const params = [];
    
//     if (userId) {
//       query += ' WHERE ak.user_id = $1';
//       params.push(userId);
//     }
    
//     query += ' ORDER BY ak.created_at DESC';
    
//     const result = await pool.query(query, params);
    
//     // Format response with creator info
//     return result.rows.map(row => ({
//       ...row,
//       created_by: {
//         id: row.user_id,
//         name: `${row.created_by_first_name || ''} ${row.created_by_last_name || ''}`.trim() || 'Unknown'
//       }
//     }));
//   }
  
//   /**
//    * Get single API key by ID (with creator info from votteryy_user_details)
//    */
//   async getApiKeyById(id) {
//     const query = `
//       SELECT 
//         ak.id, ak.key_id, ak.key_prefix, ak.user_id, ak.name, ak.description,
//         ak.permissions, ak.allowed_endpoints, ak.allowed_ips,
//         ak.rate_limit_per_minute, ak.rate_limit_per_hour,
//         ak.is_active, ak.environment, ak.created_at, ak.updated_at, 
//         ak.last_used_at, ak.expires_at,
//         ud.first_name as created_by_first_name,
//         ud.last_name as created_by_last_name
//       FROM votteryy_api_keys ak
//       LEFT JOIN votteryy_user_details ud ON ak.user_id = ud.user_id
//       WHERE ak.id = $1
//     `;
    
//     const result = await pool.query(query, [id]);
    
//     if (result.rows.length === 0) return null;
    
//     const row = result.rows[0];
//     return {
//       ...row,
//       created_by: {
//         id: row.user_id,
//         name: `${row.created_by_first_name || ''} ${row.created_by_last_name || ''}`.trim() || 'Unknown'
//       }
//     };
//   }
  
//   /**
//    * Update API key
//    */
//   async updateApiKey(id, userId, updateData) {
//     const { name, description, is_active, rate_limit_per_minute, rate_limit_per_hour, expires_at } = updateData;
    
//     const query = `
//       UPDATE votteryy_api_keys
//       SET 
//         name = COALESCE($1, name),
//         description = COALESCE($2, description),
//         is_active = COALESCE($3, is_active),
//         rate_limit_per_minute = COALESCE($4, rate_limit_per_minute),
//         rate_limit_per_hour = COALESCE($5, rate_limit_per_hour),
//         expires_at = $6
//       WHERE id = $7 AND user_id = $8
//       RETURNING id, key_id, key_prefix, name, description, is_active, 
//                 rate_limit_per_minute, rate_limit_per_hour, expires_at, updated_at
//     `;
    
//     const result = await pool.query(query, [
//       name, description, is_active, 
//       rate_limit_per_minute, rate_limit_per_hour, expires_at,
//       id, userId
//     ]);
    
//     return result.rows[0] || null;
//   }
  
//   /**
//    * Revoke (delete) API key
//    */
//   async revokeApiKey(id, userId) {
//     const query = `
//       DELETE FROM votteryy_api_keys
//       WHERE id = $1 AND user_id = $2
//       RETURNING id, key_id, name
//     `;
    
//     const result = await pool.query(query, [id, userId]);
//     return result.rows[0] || null;
//   }
  
//   /**
//    * Get usage statistics for an API key
//    */
//   async getApiKeyUsage(keyId, days = 30) {
//     const query = `
//       SELECT 
//         DATE(created_at) as date,
//         COUNT(*) as total_requests,
//         COUNT(*) FILTER (WHERE status_code >= 200 AND status_code < 300) as successful,
//         COUNT(*) FILTER (WHERE status_code >= 400) as errors,
//         AVG(response_time_ms)::integer as avg_response_time,
//         COUNT(DISTINCT ip_address) as unique_ips
//       FROM votteryy_api_key_usage
//       WHERE api_key_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '${days} days'
//       GROUP BY DATE(created_at)
//       ORDER BY date DESC
//     `;
    
//     const result = await pool.query(query, [keyId]);
//     return result.rows;
//   }
  
//   /**
//    * Clean up old rate limit records (run periodically)
//    */
//   async cleanupRateLimits() {
//     await pool.query(`
//       DELETE FROM votteryy_api_rate_limits
//       WHERE window_start < CURRENT_TIMESTAMP - INTERVAL '1 hour'
//     `);
//   }
// }

// export default new ApiKeyService();