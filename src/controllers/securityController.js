import pool from '../config/database.js';
import { asyncHandler, AppError } from '../utils/errorHandler.js';
import { formatResponse } from '../utils/helpers.js';
import { HTTP_STATUS } from '../config/constants.js';
import crypto from 'crypto';

class SecurityController {
  /**
   * Configure security settings for an election
   */
  configureSecuritySettings = asyncHandler(async (req, res) => {
    const { electionId } = req.params;
    const { userId } = req.user;
    const {
      encryption_enabled,
      digital_signatures_enabled,
      tamper_resistance_enabled,
      identity_verification_required,
      privacy_protection_enabled,
      audit_trail_enabled,
      encryption_algorithm,
      signature_algorithm
    } = req.body;

    // Verify election ownership
    const electionCheck = await pool.query(
      'SELECT creator_id FROM votteryyy_elections WHERE id = $1',
      [electionId]
    );

    if (electionCheck.rows.length === 0) {
      throw new AppError('Election not found', HTTP_STATUS.NOT_FOUND);
    }

    if (electionCheck.rows[0].creator_id !== userId) {
      throw new AppError('Only election creator can configure security', HTTP_STATUS.FORBIDDEN);
    }

    // Check if security config exists
    const existingConfig = await pool.query(
      'SELECT id FROM votteryy_election_security_config WHERE election_id = $1',
      [electionId]
    );

    let result;
    if (existingConfig.rows.length > 0) {
      // Update existing config
      const query = `
        UPDATE votteryy_election_security_config
        SET 
          encryption_enabled = COALESCE($1, encryption_enabled),
          digital_signatures_enabled = COALESCE($2, digital_signatures_enabled),
          tamper_resistance_enabled = COALESCE($3, tamper_resistance_enabled),
          identity_verification_required = COALESCE($4, identity_verification_required),
          privacy_protection_enabled = COALESCE($5, privacy_protection_enabled),
          audit_trail_enabled = COALESCE($6, audit_trail_enabled),
          encryption_algorithm = COALESCE($7, encryption_algorithm),
          signature_algorithm = COALESCE($8, signature_algorithm),
          updated_at = CURRENT_TIMESTAMP
        WHERE election_id = $9
        RETURNING *
      `;

      result = await pool.query(query, [
        encryption_enabled,
        digital_signatures_enabled,
        tamper_resistance_enabled,
        identity_verification_required,
        privacy_protection_enabled,
        audit_trail_enabled,
        encryption_algorithm,
        signature_algorithm,
        electionId
      ]);
    } else {
      // Create new config with defaults
      const query = `
        INSERT INTO votteryy_election_security_config (
          election_id, encryption_enabled, digital_signatures_enabled,
          tamper_resistance_enabled, identity_verification_required,
          privacy_protection_enabled, audit_trail_enabled,
          encryption_algorithm, signature_algorithm
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;

      result = await pool.query(query, [
        electionId,
        encryption_enabled ?? true,
        digital_signatures_enabled ?? true,
        tamper_resistance_enabled ?? true,
        identity_verification_required ?? false,
        privacy_protection_enabled ?? true,
        audit_trail_enabled ?? true,
        encryption_algorithm || 'AES-256-GCM',
        signature_algorithm || 'RSA-SHA256'
      ]);
    }

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, result.rows[0], 'Security settings configured successfully')
    );
  });

  /**
   * Get security configuration
   */
  getSecurityConfig = asyncHandler(async (req, res) => {
    const { electionId } = req.params;

    const query = `
      SELECT * FROM votteryy_election_security_config
      WHERE election_id = $1
    `;

    const result = await pool.query(query, [electionId]);

    if (result.rows.length === 0) {
      // Return default config
      return res.status(HTTP_STATUS.OK).json(
        formatResponse(true, {
          election_id: electionId,
          encryption_enabled: true,
          digital_signatures_enabled: true,
          tamper_resistance_enabled: true,
          identity_verification_required: false,
          privacy_protection_enabled: true,
          audit_trail_enabled: true,
          encryption_algorithm: 'AES-256-GCM',
          signature_algorithm: 'RSA-SHA256'
        }, 'Default security configuration')
      );
    }

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, result.rows[0], 'Security configuration retrieved')
    );
  });

  /**
   * Log audit trail event
   */
  logAuditEvent = asyncHandler(async (req, res) => {
    const {
      election_id,
      action_type,
      action_description,
      data_before,
      data_after
    } = req.body;
    const { userId } = req.user;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    // Generate event hash for tamper detection
    const eventData = JSON.stringify({
      election_id,
      user_id: userId,
      action_type,
      timestamp: new Date().toISOString(),
      data_before,
      data_after
    });
    const eventHash = crypto.createHash('sha256').update(eventData).digest('hex');

    const query = `
      INSERT INTO votteryy_audit_trail (
        election_id, user_id, action_type, action_description,
        ip_address, user_agent, data_before, data_after, event_hash
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const result = await pool.query(query, [
      election_id,
      userId,
      action_type,
      action_description || null,
      ipAddress,
      userAgent,
      data_before ? JSON.stringify(data_before) : null,
      data_after ? JSON.stringify(data_after) : null,
      eventHash
    ]);

    res.status(HTTP_STATUS.CREATED).json(
      formatResponse(true, result.rows[0], 'Audit event logged')
    );
  });

  /**
   * Get audit trail for an election
   */
  getAuditTrail = asyncHandler(async (req, res) => {
    const { electionId } = req.params;
    const { userId } = req.user;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    // Verify election ownership or admin access
    const electionCheck = await pool.query(
      'SELECT creator_id FROM votteryyy_elections WHERE id = $1',
      [electionId]
    );

    if (electionCheck.rows.length === 0) {
      throw new AppError('Election not found', HTTP_STATUS.NOT_FOUND);
    }

    if (electionCheck.rows[0].creator_id !== userId) {
      // Check if user has admin/auditor role
      const roles = req.user.roles || [];
      if (!roles.includes('Admin') && !roles.includes('Auditor') && !roles.includes('Manager')) {
        throw new AppError('You do not have permission to view audit trail', HTTP_STATUS.FORBIDDEN);
      }
    }

    const query = `
      SELECT 
        at.*,
        ud.email as user_email,
        ud.username,
        COUNT(*) OVER() as total_count
      FROM votteryy_audit_trail at
      LEFT JOIN votteryy_user_details ud ON at.user_id = ud.id
      WHERE at.election_id = $1
      ORDER BY at.timestamp DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(query, [electionId, limit, offset]);

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, {
        audit_events: result.rows,
        total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
        page: parseInt(page),
        limit: parseInt(limit)
      }, 'Audit trail retrieved successfully')
    );
  });

  /**
   * Verify audit trail integrity
   */
  verifyAuditIntegrity = asyncHandler(async (req, res) => {
    const { electionId } = req.params;
    const { userId } = req.user;

    // Verify access
    const electionCheck = await pool.query(
      'SELECT creator_id FROM votteryyy_elections WHERE id = $1',
      [electionId]
    );

    if (electionCheck.rows.length === 0) {
      throw new AppError('Election not found', HTTP_STATUS.NOT_FOUND);
    }

    if (electionCheck.rows[0].creator_id !== userId) {
      const roles = req.user.roles || [];
      if (!roles.includes('Admin') && !roles.includes('Auditor')) {
        throw new AppError('You do not have permission to verify audit trail', HTTP_STATUS.FORBIDDEN);
      }
    }

    // Get all audit events
    const result = await pool.query(
      'SELECT * FROM votteryy_audit_trail WHERE election_id = $1 ORDER BY timestamp',
      [electionId]
    );

    const events = result.rows;
    let tamperedEvents = 0;
    let verifiedEvents = 0;

    // Verify each event hash
    for (const event of events) {
      const eventData = JSON.stringify({
        election_id: event.election_id,
        user_id: event.user_id,
        action_type: event.action_type,
        timestamp: event.timestamp,
        data_before: event.data_before,
        data_after: event.data_after
      });

      const calculatedHash = crypto.createHash('sha256').update(eventData).digest('hex');

      if (calculatedHash === event.event_hash) {
        verifiedEvents++;
      } else {
        tamperedEvents++;
      }
    }

    const integrity = {
      total_events: events.length,
      verified_events: verifiedEvents,
      tampered_events: tamperedEvents,
      integrity_percentage: events.length > 0 ? ((verifiedEvents / events.length) * 100).toFixed(2) : 100,
      is_intact: tamperedEvents === 0
    };

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, integrity, 'Audit trail integrity verified')
    );
  });

  /**
   * Enable/Disable specific security feature
   */
  toggleSecurityFeature = asyncHandler(async (req, res) => {
    const { electionId } = req.params;
    const { userId } = req.user;
    const { feature, enabled } = req.body;

    // Verify election ownership
    const electionCheck = await pool.query(
      'SELECT creator_id FROM votteryyy_elections WHERE id = $1',
      [electionId]
    );

    if (electionCheck.rows.length === 0) {
      throw new AppError('Election not found', HTTP_STATUS.NOT_FOUND);
    }

    if (electionCheck.rows[0].creator_id !== userId) {
      throw new AppError('Only election creator can toggle security features', HTTP_STATUS.FORBIDDEN);
    }

    // Validate feature name
    const validFeatures = [
      'encryption_enabled',
      'digital_signatures_enabled',
      'tamper_resistance_enabled',
      'identity_verification_required',
      'privacy_protection_enabled',
      'audit_trail_enabled'
    ];

    if (!validFeatures.includes(feature)) {
      throw new AppError('Invalid security feature', HTTP_STATUS.BAD_REQUEST);
    }

    // Update specific feature
    const query = `
      UPDATE votteryy_election_security_config
      SET ${feature} = $1, updated_at = CURRENT_TIMESTAMP
      WHERE election_id = $2
      RETURNING *
    `;

    const result = await pool.query(query, [enabled, electionId]);

    if (result.rows.length === 0) {
      // Create new config if doesn't exist
      const insertQuery = `
        INSERT INTO votteryy_election_security_config (election_id, ${feature})
        VALUES ($1, $2)
        RETURNING *
      `;
      const insertResult = await pool.query(insertQuery, [electionId, enabled]);
      return res.status(HTTP_STATUS.OK).json(
        formatResponse(true, insertResult.rows[0], `${feature} ${enabled ? 'enabled' : 'disabled'}`)
      );
    }

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, result.rows[0], `${feature} ${enabled ? 'enabled' : 'disabled'}`)
    );
  });

  /**
   * Get security summary for dashboard
   */
  getSecuritySummary = asyncHandler(async (req, res) => {
    const { electionId } = req.params;

    const configQuery = await pool.query(
      'SELECT * FROM votteryy_election_security_config WHERE election_id = $1',
      [electionId]
    );

    const auditCount = await pool.query(
      'SELECT COUNT(*) FROM votteryy_audit_trail WHERE election_id = $1',
      [electionId]
    );

    const lastAuditEvent = await pool.query(
      'SELECT timestamp, action_type FROM votteryy_audit_trail WHERE election_id = $1 ORDER BY timestamp DESC LIMIT 1',
      [electionId]
    );

    const summary = {
      security_config: configQuery.rows[0] || null,
      total_audit_events: parseInt(auditCount.rows[0].count),
      last_audit_event: lastAuditEvent.rows[0] || null,
      security_score: this.calculateSecurityScore(configQuery.rows[0])
    };

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, summary, 'Security summary retrieved')
    );
  });

  /**
   * Calculate security score based on enabled features
   */
  calculateSecurityScore(config) {
    if (!config) return 50; // Default score

    let score = 0;
    const features = [
      'encryption_enabled',
      'digital_signatures_enabled',
      'tamper_resistance_enabled',
      'identity_verification_required',
      'privacy_protection_enabled',
      'audit_trail_enabled'
    ];

    features.forEach(feature => {
      if (config[feature]) score += (100 / features.length);
    });

    return Math.round(score);
  }
}

export default new SecurityController();