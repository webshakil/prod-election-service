// src/controllers/publicApiController.js
// Controllers for Public API (external users with API keys)

import pool from '../config/database.js';

// Helper function for consistent responses
const respond = (res, status, data) => {
  const response = {
    success: status < 400,
    ...data,
    meta: {
      timestamp: new Date().toISOString(),
      rate_limit: {
        limit: res.getHeader('X-RateLimit-Limit'),
        remaining: res.getHeader('X-RateLimit-Remaining'),
        reset: res.getHeader('X-RateLimit-Reset')
      }
    }
  };
  return res.status(status).json(response);
};

// GET /api/v1/elections
export const getElections = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      category_id, 
      voting_type, 
      sort_by = 'created_at', 
      sort_order = 'DESC' 
    } = req.query;
    
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;
    
    const allowedSort = ['created_at', 'start_date', 'end_date', 'title'];
    const sortField = allowedSort.includes(sort_by) ? sort_by : 'created_at';
    const sortDir = sort_order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    
    let where = ["permission_type = 'public'"];
    const params = [];
    let i = 0;
    
    if (status) { where.push(`status = $${++i}`); params.push(status); }
    if (category_id) { where.push(`category_id = $${++i}`); params.push(parseInt(category_id)); }
    if (voting_type) { where.push(`voting_type = $${++i}`); params.push(voting_type); }
    
    const whereClause = 'WHERE ' + where.join(' AND ');
    
    // Count
    const countResult = await pool.query(`SELECT COUNT(*) FROM votteryyy_elections ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].count);
    
    // Data
    const result = await pool.query(`
      SELECT 
        e.id, e.title, e.description, e.slug, 
        e.topic_image_url, e.topic_video_url, e.logo_url,
        e.start_date, e.end_date, e.start_time, e.end_time, e.timezone, 
        e.voting_type, e.permission_type, e.status, e.category_id,
        e.is_free, e.pricing_type, e.general_participation_fee,
        e.biometric_required, e.authentication_methods,
        e.show_live_results, e.vote_editing_allowed,
        e.video_watch_required, e.minimum_watch_time, e.minimum_watch_percentage,
        e.lottery_enabled, e.lottery_prize_funding_source, e.lottery_reward_type,
        e.lottery_total_prize_pool, e.lottery_prize_description, 
        e.lottery_estimated_value, e.lottery_winner_count, e.lottery_prize_distribution,
        e.anonymous_voting_enabled,
        e.created_at, e.updated_at, e.published_at,
        COALESCE((SELECT COUNT(*) FROM votteryy_votes WHERE election_id = e.id AND status = 'valid'), 0)::integer as vote_count,
        COALESCE((SELECT COUNT(*) FROM votteryyy_anonymous_votes WHERE election_id = e.id), 0)::integer as anonymous_vote_count
      FROM votteryyy_elections e
      ${whereClause}
      ORDER BY e.${sortField} ${sortDir}
      LIMIT $${++i} OFFSET $${++i}
    `, [...params, limitNum, offset]);
    
    const totalPages = Math.ceil(total / limitNum);
    
    return respond(res, 200, {
      data: {
        elections: result.rows.map(e => ({ ...e, total_votes: e.vote_count + e.anonymous_vote_count })),
        pagination: { page: pageNum, limit: limitNum, total, total_pages: totalPages, has_next: pageNum < totalPages, has_prev: pageNum > 1 }
      }
    });
  } catch (error) {
    console.error('Public API - getElections:', error);
    return respond(res, 500, { error: { code: 'SERVER_ERROR', message: 'Failed to fetch elections.' } });
  }
};

// GET /api/v1/elections/:id
export const getElectionById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get election
    const result = await pool.query(`
      SELECT 
        e.*, 
        COALESCE((SELECT COUNT(*) FROM votteryy_votes WHERE election_id = e.id AND status = 'valid'), 0)::integer as normal_vote_count,
        COALESCE((SELECT COUNT(*) FROM votteryyy_anonymous_votes WHERE election_id = e.id), 0)::integer as anonymous_vote_count
      FROM votteryyy_elections e
      WHERE e.id = $1 AND e.permission_type = 'public'
    `, [id]);
    
    if (result.rows.length === 0) {
      return respond(res, 404, { error: { code: 'NOT_FOUND', message: 'Election not found or not public.' } });
    }
    
    const election = result.rows[0];
    election.total_vote_count = election.normal_vote_count + election.anonymous_vote_count;
    
    // Get questions with options
    const questionsResult = await pool.query(`
      SELECT 
        q.id, q.question_text, q.question_type, q.question_image_url,
        q.question_order, q.is_required, q.max_selections,
        json_agg(
          json_build_object(
            'id', o.id,
            'option_text', o.option_text,
            'option_image_url', o.option_image_url,
            'option_order', o.option_order
          ) ORDER BY o.option_order
        ) as options
      FROM votteryy_election_questions q
      LEFT JOIN votteryy_election_options o ON q.id = o.question_id
      WHERE q.election_id = $1
      GROUP BY q.id
      ORDER BY q.question_order
    `, [id]);
    
    election.questions = questionsResult.rows;
    
    // Build lottery_config object
    if (election.lottery_enabled) {
      election.lottery_config = {
        lottery_enabled: election.lottery_enabled,
        prize_funding_source: election.lottery_prize_funding_source,
        reward_type: election.lottery_reward_type,
        total_prize_pool: election.lottery_total_prize_pool,
        prize_description: election.lottery_prize_description,
        estimated_value: election.lottery_estimated_value,
        projected_revenue: election.lottery_projected_revenue,
        revenue_share_percentage: election.lottery_revenue_share_percentage,
        winner_count: election.lottery_winner_count,
        prize_distribution: election.lottery_prize_distribution
      };
    }
    
    // Add shareable_url
    election.shareable_url = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/vote/${election.slug}`;
    
    return respond(res, 200, { data: { election } });
  } catch (error) {
    console.error('Public API - getElectionById:', error);
    return respond(res, 500, { error: { code: 'SERVER_ERROR', message: 'Failed to fetch election.' } });
  }
};

// GET /api/v1/elections/:id/questions
export const getElectionQuestions = async (req, res) => {
  try {
    const { id } = req.params;
    
    const check = await pool.query("SELECT id FROM votteryyy_elections WHERE id = $1 AND permission_type = 'public'", [id]);
    if (check.rows.length === 0) {
      return respond(res, 404, { error: { code: 'NOT_FOUND', message: 'Election not found or not public.' } });
    }
    
    const result = await pool.query(`
      SELECT q.*, 
             json_agg(
               json_build_object(
                 'id', o.id,
                 'option_text', o.option_text,
                 'option_image_url', o.option_image_url,
                 'option_order', o.option_order
               ) ORDER BY o.option_order
             ) as options
      FROM votteryy_election_questions q
      LEFT JOIN votteryy_election_options o ON q.id = o.question_id
      WHERE q.election_id = $1
      GROUP BY q.id
      ORDER BY q.question_order
    `, [id]);
    
    return respond(res, 200, { data: { questions: result.rows } });
  } catch (error) {
    console.error('Public API - getElectionQuestions:', error);
    return respond(res, 500, { error: { code: 'SERVER_ERROR', message: 'Failed to fetch questions.' } });
  }
};

// GET /api/v1/elections/:id/results
export const getElectionResults = async (req, res) => {
  try {
    const { id } = req.params;
    
    const electionResult = await pool.query(`
      SELECT id, title, status, voting_type, end_date 
      FROM votteryyy_elections WHERE id = $1 AND permission_type = 'public'
    `, [id]);
    
    if (electionResult.rows.length === 0) {
      return respond(res, 404, { error: { code: 'NOT_FOUND', message: 'Election not found or not public.' } });
    }
    
    const election = electionResult.rows[0];
    
    // Check if ended
    if (election.status !== 'completed' && new Date() < new Date(election.end_date)) {
      return respond(res, 403, { error: { code: 'RESULTS_NOT_AVAILABLE', message: 'Results not available until election ends.' } });
    }
    
    const results = await pool.query(`
      SELECT 
        q.id as question_id,
        q.question_text,
        json_agg(
          json_build_object(
            'option_id', o.id,
            'option_text', o.option_text,
            'vote_count', COALESCE(v.vote_count, 0) + COALESCE(av.anonymous_vote_count, 0)
          ) ORDER BY o.option_order
        ) as options
      FROM votteryy_election_questions q
      LEFT JOIN votteryy_election_options o ON q.id = o.question_id
      LEFT JOIN (
        SELECT option_id, COUNT(*) as vote_count
        FROM votteryy_votes
        WHERE election_id = $1 AND status = 'valid'
        GROUP BY option_id
      ) v ON o.id = v.option_id
      LEFT JOIN (
        SELECT option_id, COUNT(*) as anonymous_vote_count
        FROM votteryyy_anonymous_votes
        WHERE election_id = $1
        GROUP BY option_id
      ) av ON o.id = av.option_id
      WHERE q.election_id = $1
      GROUP BY q.id, q.question_text, q.question_order
      ORDER BY q.question_order
    `, [id]);
    
    return respond(res, 200, { data: { election: { id: election.id, title: election.title }, results: results.rows } });
  } catch (error) {
    console.error('Public API - getElectionResults:', error);
    return respond(res, 500, { error: { code: 'SERVER_ERROR', message: 'Failed to fetch results.' } });
  }
};

// GET /api/v1/elections/:id/stats
export const getElectionStats = async (req, res) => {
  try {
    const { id } = req.params;
    
    const electionResult = await pool.query(`
      SELECT id, title, start_date, end_date, status 
      FROM votteryyy_elections WHERE id = $1 AND permission_type = 'public'
    `, [id]);
    
    if (electionResult.rows.length === 0) {
      return respond(res, 404, { error: { code: 'NOT_FOUND', message: 'Election not found or not public.' } });
    }
    
    const election = electionResult.rows[0];
    
    const statsResult = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM votteryy_votes WHERE election_id = $1 AND status = 'valid')::integer as total_votes,
        (SELECT COUNT(*) FROM votteryyy_anonymous_votes WHERE election_id = $1)::integer as anonymous_votes,
        (SELECT COUNT(DISTINCT user_id) FROM votteryy_votes WHERE election_id = $1 AND status = 'valid')::integer as unique_voters
    `, [id]);
    
    const stats = statsResult.rows[0];
    const now = new Date();
    const startDate = new Date(election.start_date);
    const endDate = new Date(election.end_date);
    
    let timelineStatus = 'upcoming';
    if (now >= startDate && now <= endDate) timelineStatus = 'active';
    else if (now > endDate) timelineStatus = 'ended';
    
    const daysRemaining = timelineStatus === 'active' ? Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)) : 0;
    
    return respond(res, 200, {
      data: {
        election: { id: election.id, title: election.title, status: election.status },
        stats: {
          total_votes: stats.total_votes + stats.anonymous_votes,
          registered_votes: stats.total_votes,
          anonymous_votes: stats.anonymous_votes,
          unique_voters: stats.unique_voters,
          timeline_status: timelineStatus,
          days_remaining: daysRemaining
        }
      }
    });
  } catch (error) {
    console.error('Public API - getElectionStats:', error);
    return respond(res, 500, { error: { code: 'SERVER_ERROR', message: 'Failed to fetch stats.' } });
  }
};

// GET /api/v1/categories
export const getCategories = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, description, is_active
      FROM votteryy_categories
      WHERE is_active = true
      ORDER BY name
    `);
    
    return respond(res, 200, { data: { categories: result.rows } });
  } catch (error) {
    console.error('Public API - getCategories:', error);
    return respond(res, 500, { error: { code: 'SERVER_ERROR', message: 'Failed to fetch categories.' } });
  }
};