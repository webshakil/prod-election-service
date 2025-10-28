import pool from '../config/database.js';
import { asyncHandler, AppError } from '../utils/errorHandler.js';
import { formatResponse } from '../utils/helpers.js';
import { HTTP_STATUS } from '../config/constants.js';
import { getFileUrl } from '../middleware/uploadMiddleware.js';

class OrganizationController {
  /**
   * Create organization
   */
  createOrganization = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { organization_name, organization_type, description, email, phone, country, city, address, website } = req.body;

    // Handle logo upload
    let logoUrl = null;
    if (req.file) {
      logoUrl = getFileUrl(req.file.filename, 'logos');
    }

    const query = `
      INSERT INTO votteryy_organizations (
        owner_id, organization_name, organization_type, description,
        logo_url, website, email, phone, country, city, address
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const values = [
      userId,
      organization_name,
      organization_type || null,
      description || null,
      logoUrl,
      website || null,
      email || null,
      phone || null,
      country || null,
      city || null,
      address || null
    ];

    const result = await pool.query(query, values);
    const organization = result.rows[0];

    // Auto-add creator as owner in members table
    await pool.query(`
      INSERT INTO votteryy_organization_members (
        organization_id, user_id, role, permissions
      )
      VALUES ($1, $2, 'owner', '{}')
    `, [organization.id, userId]);

    res.status(HTTP_STATUS.CREATED).json(
      formatResponse(true, organization, 'Organization created successfully')
    );
  });

  /**
   * Get my organizations
   */
  getMyOrganizations = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const query = `
      SELECT 
        o.*,
        om.role as my_role,
        COUNT(*) OVER() as total_count,
        (SELECT COUNT(*) FROM votteryy_organization_members WHERE organization_id = o.id) as members_count,
        (SELECT COUNT(*) FROM votteryyy_elections WHERE organization_id = o.id) as elections_count
      FROM votteryy_organizations o
      JOIN votteryy_organization_members om ON o.id = om.organization_id
      WHERE om.user_id = $1
      ORDER BY o.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(query, [userId, limit, offset]);

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, {
        organizations: result.rows,
        total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
        page: parseInt(page),
        limit: parseInt(limit)
      }, 'Organizations retrieved successfully')
    );
  });

  /**
   * Get organization by ID
   */
  getOrganization = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { userId } = req.user;

    // Check if user is member
    const memberCheck = await pool.query(
      'SELECT role FROM votteryy_organization_members WHERE organization_id = $1 AND user_id = $2',
      [id, userId]
    );

    if (memberCheck.rows.length === 0) {
      throw new AppError('You are not a member of this organization', HTTP_STATUS.FORBIDDEN);
    }

    const query = `
      SELECT 
        o.*,
        (SELECT COUNT(*) FROM votteryy_organization_members WHERE organization_id = o.id) as members_count,
        (SELECT COUNT(*) FROM votteryyy_elections WHERE organization_id = o.id) as elections_count,
        (SELECT json_agg(json_build_object(
          'user_id', om.user_id,
          'role', om.role,
          'joined_at', om.joined_at
        )) FROM votteryy_organization_members om WHERE om.organization_id = o.id) as members
      FROM votteryy_organizations o
      WHERE o.id = $1
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      throw new AppError('Organization not found', HTTP_STATUS.NOT_FOUND);
    }

    const organization = result.rows[0];
    organization.my_role = memberCheck.rows[0].role;

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, organization, 'Organization retrieved successfully')
    );
  });

  /**
   * Update organization
   */
  updateOrganization = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { userId } = req.user;
    const updateData = req.body;

    // Verify ownership
    const ownerCheck = await pool.query(
      'SELECT id FROM votteryy_organizations WHERE id = $1 AND owner_id = $2',
      [id, userId]
    );

    if (ownerCheck.rows.length === 0) {
      throw new AppError('You do not have permission to update this organization', HTTP_STATUS.FORBIDDEN);
    }

    // Handle logo upload
    if (req.file) {
      updateData.logo_url = getFileUrl(req.file.filename, 'logos');
    }

    const fields = [];
    const values = [];
    let paramCount = 0;

    const allowedFields = [
      'organization_name', 'organization_type', 'description', 'logo_url',
      'website', 'email', 'phone', 'country', 'city', 'address'
    ];

    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        paramCount++;
        fields.push(`${field} = $${paramCount}`);
        values.push(updateData[field]);
      }
    }

    if (fields.length === 0) {
      const org = await pool.query('SELECT * FROM votteryy_organizations WHERE id = $1', [id]);
      return res.status(HTTP_STATUS.OK).json(
        formatResponse(true, org.rows[0], 'No changes made')
      );
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE votteryy_organizations
      SET ${fields.join(', ')}
      WHERE id = $${paramCount + 1}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, result.rows[0], 'Organization updated successfully')
    );
  });

  /**
   * Delete organization
   */
  deleteOrganization = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { userId } = req.user;

    // Verify ownership
    const ownerCheck = await pool.query(
      'SELECT id FROM votteryy_organizations WHERE id = $1 AND owner_id = $2',
      [id, userId]
    );

    if (ownerCheck.rows.length === 0) {
      throw new AppError('You do not have permission to delete this organization', HTTP_STATUS.FORBIDDEN);
    }

    await pool.query('DELETE FROM votteryy_organizations WHERE id = $1', [id]);

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, null, 'Organization deleted successfully')
    );
  });

  /**
   * Get organization members
   */
  getMembers = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { userId } = req.user;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Verify membership
    const memberCheck = await pool.query(
      'SELECT role FROM votteryy_organization_members WHERE organization_id = $1 AND user_id = $2',
      [id, userId]
    );

    if (memberCheck.rows.length === 0) {
      throw new AppError('You are not a member of this organization', HTTP_STATUS.FORBIDDEN);
    }

    const query = `
      SELECT 
        om.*,
        ud.email,
        ud.username,
        COUNT(*) OVER() as total_count
      FROM votteryy_organization_members om
      LEFT JOIN votteryy_user_details ud ON om.user_id = ud.id
      WHERE om.organization_id = $1
      ORDER BY om.joined_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(query, [id, limit, offset]);

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, {
        members: result.rows,
        total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
        page: parseInt(page),
        limit: parseInt(limit)
      }, 'Members retrieved successfully')
    );
  });

  /**
   * Invite member to organization
   */
  inviteMember = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { userId } = req.user;
    const { user_id, role = 'member' } = req.body;

    // Verify manager/owner permission
    const permissionCheck = await pool.query(
      `SELECT role FROM votteryy_organization_members 
       WHERE organization_id = $1 AND user_id = $2 
       AND role IN ('owner', 'manager')`,
      [id, userId]
    );

    if (permissionCheck.rows.length === 0) {
      throw new AppError('You do not have permission to invite members', HTTP_STATUS.FORBIDDEN);
    }

    // Check if user already a member
    const existingMember = await pool.query(
      'SELECT id FROM votteryy_organization_members WHERE organization_id = $1 AND user_id = $2',
      [id, user_id]
    );

    if (existingMember.rows.length > 0) {
      throw new AppError('User is already a member', HTTP_STATUS.CONFLICT);
    }

    const query = `
      INSERT INTO votteryy_organization_members (
        organization_id, user_id, role, invited_by
      )
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const result = await pool.query(query, [id, user_id, role, userId]);

    res.status(HTTP_STATUS.CREATED).json(
      formatResponse(true, result.rows[0], 'Member invited successfully')
    );
  });

  /**
   * Update member role
   */
  updateMemberRole = asyncHandler(async (req, res) => {
    const { id, memberId } = req.params;
    const { userId } = req.user;
    const { role } = req.body;

    // Verify manager/owner permission
    const permissionCheck = await pool.query(
      `SELECT role FROM votteryy_organization_members 
       WHERE organization_id = $1 AND user_id = $2 
       AND role IN ('owner', 'manager')`,
      [id, userId]
    );

    if (permissionCheck.rows.length === 0) {
      throw new AppError('You do not have permission to update member roles', HTTP_STATUS.FORBIDDEN);
    }

    // Cannot change owner role
    const memberCheck = await pool.query(
      'SELECT role FROM votteryy_organization_members WHERE id = $1',
      [memberId]
    );

    if (memberCheck.rows.length === 0) {
      throw new AppError('Member not found', HTTP_STATUS.NOT_FOUND);
    }

    if (memberCheck.rows[0].role === 'owner') {
      throw new AppError('Cannot change owner role', HTTP_STATUS.FORBIDDEN);
    }

    const query = `
      UPDATE votteryy_organization_members
      SET role = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;

    const result = await pool.query(query, [role, memberId]);

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, result.rows[0], 'Member role updated successfully')
    );
  });

  /**
   * Remove member from organization
   */
  removeMember = asyncHandler(async (req, res) => {
    const { id, memberId } = req.params;
    const { userId } = req.user;

    // Verify manager/owner permission
    const permissionCheck = await pool.query(
      `SELECT role FROM votteryy_organization_members 
       WHERE organization_id = $1 AND user_id = $2 
       AND role IN ('owner', 'manager')`,
      [id, userId]
    );

    if (permissionCheck.rows.length === 0) {
      throw new AppError('You do not have permission to remove members', HTTP_STATUS.FORBIDDEN);
    }

    // Cannot remove owner
    const memberCheck = await pool.query(
      'SELECT role FROM votteryy_organization_members WHERE id = $1',
      [memberId]
    );

    if (memberCheck.rows.length === 0) {
      throw new AppError('Member not found', HTTP_STATUS.NOT_FOUND);
    }

    if (memberCheck.rows[0].role === 'owner') {
      throw new AppError('Cannot remove owner', HTTP_STATUS.FORBIDDEN);
    }

    await pool.query('DELETE FROM votteryy_organization_members WHERE id = $1', [memberId]);

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, null, 'Member removed successfully')
    );
  });

  /**
   * Get organization elections
   */
  getOrganizationElections = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { userId } = req.user;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    // Verify membership
    const memberCheck = await pool.query(
      'SELECT role FROM votteryy_organization_members WHERE organization_id = $1 AND user_id = $2',
      [id, userId]
    );

    if (memberCheck.rows.length === 0) {
      throw new AppError('You are not a member of this organization', HTTP_STATUS.FORBIDDEN);
    }

    const query = `
      SELECT 
        e.*,
        COUNT(*) OVER() as total_count
      FROM votteryyy_elections e
      WHERE e.organization_id = $1
      ORDER BY e.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(query, [id, limit, offset]);

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, {
        elections: result.rows,
        total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
        page: parseInt(page),
        limit: parseInt(limit)
      }, 'Elections retrieved successfully')
    );
  });

  /**
   * Get organization settings
   */
  getSettings = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { userId } = req.user;

    // Verify membership
    const memberCheck = await pool.query(
      'SELECT role FROM votteryy_organization_members WHERE organization_id = $1 AND user_id = $2',
      [id, userId]
    );

    if (memberCheck.rows.length === 0) {
      throw new AppError('You are not a member of this organization', HTTP_STATUS.FORBIDDEN);
    }

    const query = `
      SELECT * FROM votteryy_organizations
      WHERE id = $1
    `;

    const result = await pool.query(query, [id]);

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, result.rows[0], 'Settings retrieved successfully')
    );
  });

  /**
   * Update organization settings
   */
  updateSettings = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { userId } = req.user;

    // Verify ownership
    const ownerCheck = await pool.query(
      'SELECT id FROM votteryy_organizations WHERE id = $1 AND owner_id = $2',
      [id, userId]
    );

    if (ownerCheck.rows.length === 0) {
      throw new AppError('Only owner can update settings', HTTP_STATUS.FORBIDDEN);
    }

    // Update logic similar to updateOrganization
    // Can add specific settings fields here

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, null, 'Settings updated successfully')
    );
  });
}

export default new OrganizationController();