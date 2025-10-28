import pool from '../config/database.js';
import { asyncHandler, AppError } from '../utils/errorHandler.js';
import { formatResponse } from '../utils/helpers.js';
import { HTTP_STATUS } from '../config/constants.js';
import crypto from 'crypto';

class ContentCreatorController {
  /**
   * Create Vottery icon for embedding
   */
  createVotteryIcon = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { election_id, icon_url, is_hidden } = req.body;

    // Verify election ownership
    const electionCheck = await pool.query(
      'SELECT creator_id FROM votteryyy_elections WHERE id = $1',
      [election_id]
    );

    if (electionCheck.rows.length === 0) {
      throw new AppError('Election not found', HTTP_STATUS.NOT_FOUND);
    }

    if (electionCheck.rows[0].creator_id !== userId) {
      throw new AppError('Only election creator can create icons', HTTP_STATUS.FORBIDDEN);
    }

    // Generate embedded link
    const embeddedLink = `${process.env.FRONTEND_URL}/vote/${election_id}?icon=true`;

    const query = `
      INSERT INTO votteryy_content_creator_icons (
        creator_id, election_id, icon_url, is_hidden, embedded_link
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const result = await pool.query(query, [
      userId,
      election_id,
      icon_url,
      is_hidden ?? true,
      embeddedLink
    ]);

    res.status(HTTP_STATUS.CREATED).json(
      formatResponse(true, result.rows[0], 'Vottery icon created successfully')
    );
  });

  /**
   * Toggle icon visibility
   */
  toggleIconVisibility = asyncHandler(async (req, res) => {
    const { iconId } = req.params;
    const { userId } = req.user;
    const { is_hidden } = req.body;

    // Verify ownership
    const iconCheck = await pool.query(
      'SELECT creator_id FROM votteryy_content_creator_icons WHERE id = $1',
      [iconId]
    );

    if (iconCheck.rows.length === 0) {
      throw new AppError('Icon not found', HTTP_STATUS.NOT_FOUND);
    }

    if (iconCheck.rows[0].creator_id !== userId) {
      throw new AppError('Only icon creator can toggle visibility', HTTP_STATUS.FORBIDDEN);
    }

    const query = `
      UPDATE votteryy_content_creator_icons
      SET is_hidden = $1
      WHERE id = $2
      RETURNING *
    `;

    const result = await pool.query(query, [is_hidden, iconId]);

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, result.rows[0], 'Icon visibility updated')
    );
  });

  /**
   * Get my icons
   */
  getMyIcons = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const query = `
      SELECT 
        i.*,
        e.title as election_title,
        COUNT(*) OVER() as total_count
      FROM votteryy_content_creator_icons i
      JOIN votteryyy_elections e ON i.election_id = e.id
      WHERE i.creator_id = $1
      ORDER BY i.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(query, [userId, limit, offset]);

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, {
        icons: result.rows,
        total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
        page: parseInt(page),
        limit: parseInt(limit)
      }, 'Icons retrieved successfully')
    );
  });

  /**
   * Generate one-time voting link
   */
  generateOneTimeLink = asyncHandler(async (req, res) => {
    const { electionId } = req.params;
    const { userId } = req.user;
    const { viewer_identifier, expires_in_hours } = req.body;

    // Verify election ownership
    const electionCheck = await pool.query(
      'SELECT creator_id FROM votteryyy_elections WHERE id = $1',
      [electionId]
    );

    if (electionCheck.rows.length === 0) {
      throw new AppError('Election not found', HTTP_STATUS.NOT_FOUND);
    }

    if (electionCheck.rows[0].creator_id !== userId) {
      throw new AppError('Only election creator can generate one-time links', HTTP_STATUS.FORBIDDEN);
    }

    // Generate unique link token
    const linkToken = crypto.randomBytes(32).toString('hex');
    const uniqueLink = `${process.env.FRONTEND_URL}/vote/${electionId}/otl/${linkToken}`;

    // Calculate expiration
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + (expires_in_hours || 24));

    const query = `
      INSERT INTO votteryy_one_time_voting_links (
        election_id, viewer_identifier, unique_link, expires_at
      )
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const result = await pool.query(query, [
      electionId,
      viewer_identifier || `viewer-${Date.now()}`,
      uniqueLink,
      expiresAt
    ]);

    res.status(HTTP_STATUS.CREATED).json(
      formatResponse(true, result.rows[0], 'One-time voting link generated')
    );
  });

  /**
   * Validate one-time link
   */
  validateOneTimeLink = asyncHandler(async (req, res) => {
    const { linkToken } = req.params;

    const uniqueLink = `${process.env.FRONTEND_URL}/vote/%/otl/${linkToken}`;

    const query = `
      SELECT 
        otl.*,
        e.title as election_title,
        e.status as election_status
      FROM votteryy_one_time_voting_links otl
      JOIN votteryyy_elections e ON otl.election_id = e.id
      WHERE otl.unique_link LIKE $1
    `;

    const result = await pool.query(query, [uniqueLink.replace('%', '_')]);

    if (result.rows.length === 0) {
      throw new AppError('Invalid voting link', HTTP_STATUS.NOT_FOUND);
    }

    const link = result.rows[0];

    // Check if already used
    if (link.is_used) {
      throw new AppError('This voting link has already been used', HTTP_STATUS.GONE);
    }

    // Check if expired
    if (new Date(link.expires_at) < new Date()) {
      throw new AppError('This voting link has expired', HTTP_STATUS.GONE);
    }

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, link, 'Voting link is valid')
    );
  });

  /**
   * Mark one-time link as used
   */
  markLinkAsUsed = asyncHandler(async (req, res) => {
    const { linkId } = req.params;

    const query = `
      UPDATE votteryy_one_time_voting_links
      SET is_used = TRUE, used_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [linkId]);

    if (result.rows.length === 0) {
      throw new AppError('Link not found', HTTP_STATUS.NOT_FOUND);
    }

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, result.rows[0], 'Link marked as used')
    );
  });

  /**
   * Track projected revenue
   */
  trackProjectedRevenue = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const {
      election_id,
      content_platform,
      projected_amount,
      actual_amount,
      revenue_date
    } = req.body;

    // Verify election ownership
    const electionCheck = await pool.query(
      'SELECT creator_id FROM votteryyy_elections WHERE id = $1',
      [election_id]
    );

    if (electionCheck.rows.length === 0) {
      throw new AppError('Election not found', HTTP_STATUS.NOT_FOUND);
    }

    if (electionCheck.rows[0].creator_id !== userId) {
      throw new AppError('Only election creator can track revenue', HTTP_STATUS.FORBIDDEN);
    }

    const query = `
      INSERT INTO votteryy_projected_revenue (
        creator_id, election_id, content_platform,
        projected_amount, actual_amount, revenue_date
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await pool.query(query, [
      userId,
      election_id,
      content_platform || 'Unknown',
      projected_amount || null,
      actual_amount || null,
      revenue_date || new Date()
    ]);

    res.status(HTTP_STATUS.CREATED).json(
      formatResponse(true, result.rows[0], 'Revenue tracked successfully')
    );
  });

  /**
   * Get projected revenue report
   */
  getRevenueReport = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { election_id, start_date, end_date } = req.query;

    let query = `
      SELECT 
        pr.*,
        e.title as election_title,
        SUM(pr.projected_amount) OVER(PARTITION BY pr.election_id) as total_projected,
        SUM(pr.actual_amount) OVER(PARTITION BY pr.election_id) as total_actual
      FROM votteryy_projected_revenue pr
      JOIN votteryyy_elections e ON pr.election_id = e.id
      WHERE pr.creator_id = $1
    `;

    const params = [userId];
    let paramIndex = 2;

    if (election_id) {
      query += ` AND pr.election_id = $${paramIndex}`;
      params.push(election_id);
      paramIndex++;
    }

    if (start_date) {
      query += ` AND pr.revenue_date >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      query += ` AND pr.revenue_date <= $${paramIndex}`;
      params.push(end_date);
    }

    query += ` ORDER BY pr.revenue_date DESC`;

    const result = await pool.query(query, params);

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, result.rows, 'Revenue report retrieved successfully')
    );
  });

  /**
   * Get personalized voting interface settings
   */
  getPersonalizedInterface = asyncHandler(async (req, res) => {
    const { electionId } = req.params;

    const query = `
      SELECT 
        e.corporate_style,
        e.logo_url,
        e.title,
        e.description,
        i.icon_url,
        i.is_hidden as icon_hidden
      FROM votteryyy_elections e
      LEFT JOIN votteryy_content_creator_icons i ON e.id = i.election_id
      WHERE e.id = $1
      LIMIT 1
    `;

    const result = await pool.query(query, [electionId]);

    if (result.rows.length === 0) {
      throw new AppError('Election not found', HTTP_STATUS.NOT_FOUND);
    }

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, result.rows[0], 'Personalized interface retrieved')
    );
  });
}

export default new ContentCreatorController();