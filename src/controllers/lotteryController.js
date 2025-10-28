import pool from '../config/database.js';
import { asyncHandler, AppError } from '../utils/errorHandler.js';
import { formatResponse } from '../utils/helpers.js';
import { HTTP_STATUS, LOTTERY_REWARD_TYPES } from '../config/constants.js';
import crypto from 'crypto';

class LotteryController {
  /**
   * Configure lottery for an election
   */
  configureLottery = asyncHandler(async (req, res) => {
    const { electionId } = req.params;
    const { userId } = req.user;
    const {
      is_lotterized,
      reward_type,
      reward_amount,
      reward_description,
      winner_count,
      prize_pool_total,
      lottery_machine_visible,
      auto_trigger_at_end
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
      throw new AppError('Only election creator can configure lottery', HTTP_STATUS.FORBIDDEN);
    }

    // Validate reward type
    if (reward_type && !Object.values(LOTTERY_REWARD_TYPES).includes(reward_type)) {
      throw new AppError('Invalid reward type', HTTP_STATUS.BAD_REQUEST);
    }

    // Validate winner count
    if (winner_count && (winner_count < 1 || winner_count > 100)) {
      throw new AppError('Winner count must be between 1 and 100', HTTP_STATUS.BAD_REQUEST);
    }

    // Check if lottery config already exists
    const existingConfig = await pool.query(
      'SELECT id FROM votteryy_election_lottery_config WHERE election_id = $1',
      [electionId]
    );

    let result;
    if (existingConfig.rows.length > 0) {
      // Update existing config
      const query = `
        UPDATE votteryy_election_lottery_config
        SET 
          is_lotterized = $1,
          reward_type = $2,
          reward_amount = $3,
          reward_description = $4,
          winner_count = $5,
          prize_pool_total = $6,
          lottery_machine_visible = $7,
          auto_trigger_at_end = $8,
          updated_at = CURRENT_TIMESTAMP
        WHERE election_id = $9
        RETURNING *
      `;

      result = await pool.query(query, [
        is_lotterized ?? true,
        reward_type || null,
        reward_amount || null,
        reward_description || null,
        winner_count || 1,
        prize_pool_total || null,
        lottery_machine_visible ?? true,
        auto_trigger_at_end ?? true,
        electionId
      ]);
    } else {
      // Create new config
      const query = `
        INSERT INTO votteryy_election_lottery_config (
          election_id, is_lotterized, reward_type, reward_amount,
          reward_description, winner_count, prize_pool_total,
          lottery_machine_visible, auto_trigger_at_end
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;

      result = await pool.query(query, [
        electionId,
        is_lotterized ?? true,
        reward_type || null,
        reward_amount || null,
        reward_description || null,
        winner_count || 1,
        prize_pool_total || null,
        lottery_machine_visible ?? true,
        auto_trigger_at_end ?? true
      ]);
    }

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, result.rows[0], 'Lottery configured successfully')
    );
  });

  /**
   * Get lottery configuration
   */
  getLotteryConfig = asyncHandler(async (req, res) => {
    const { electionId } = req.params;

    const query = `
      SELECT * FROM votteryy_election_lottery_config
      WHERE election_id = $1
    `;

    const result = await pool.query(query, [electionId]);

    if (result.rows.length === 0) {
      return res.status(HTTP_STATUS.OK).json(
        formatResponse(true, { is_lotterized: false }, 'No lottery configured')
      );
    }

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, result.rows[0], 'Lottery configuration retrieved')
    );
  });

  /**
   * Select lottery winners using cryptographically secure random selection
   */
  selectWinners = asyncHandler(async (req, res) => {
    const { electionId } = req.params;
    const { userId } = req.user;

    // Verify election ownership
    const electionCheck = await pool.query(
      'SELECT creator_id, status, end_date FROM votteryyy_elections WHERE id = $1',
      [electionId]
    );

    if (electionCheck.rows.length === 0) {
      throw new AppError('Election not found', HTTP_STATUS.NOT_FOUND);
    }

    const election = electionCheck.rows[0];

    if (election.creator_id !== userId) {
      throw new AppError('Only election creator can select winners', HTTP_STATUS.FORBIDDEN);
    }

    // Check if election has ended
    if (election.status !== 'completed') {
      throw new AppError('Election must be completed before selecting winners', HTTP_STATUS.BAD_REQUEST);
    }

    // Get lottery configuration
    const configResult = await pool.query(
      'SELECT * FROM votteryy_election_lottery_config WHERE election_id = $1',
      [electionId]
    );

    if (configResult.rows.length === 0 || !configResult.rows[0].is_lotterized) {
      throw new AppError('Lottery is not configured for this election', HTTP_STATUS.BAD_REQUEST);
    }

    const config = configResult.rows[0];

    // Check if winners already selected
    const existingWinners = await pool.query(
      'SELECT COUNT(*) FROM votteryy_election_lottery_winners WHERE election_id = $1',
      [electionId]
    );

    if (parseInt(existingWinners.rows[0].count) > 0) {
      throw new AppError('Winners have already been selected for this election', HTTP_STATUS.CONFLICT);
    }

    // Get all voters (participants) for this election
    // NOTE: This assumes you have a votes table - adjust based on your actual voting table
    const participantsResult = await pool.query(`
      SELECT DISTINCT user_id 
      FROM votteryy_votes 
      WHERE election_id = $1
    `, [electionId]);

    const participants = participantsResult.rows;

    if (participants.length === 0) {
      throw new AppError('No participants found for lottery', HTTP_STATUS.BAD_REQUEST);
    }

    const winnerCount = Math.min(config.winner_count, participants.length);

    // Cryptographically secure random selection
    const selectedWinners = this.selectRandomWinners(participants, winnerCount);

    // Calculate prize per winner
    const prizePerWinner = config.prize_pool_total 
      ? (config.prize_pool_total / winnerCount).toFixed(2)
      : null;

    // Insert winners
    const insertPromises = selectedWinners.map(async (participant) => {
      const query = `
        INSERT INTO votteryy_election_lottery_winners (
          election_id, user_id, prize_amount, prize_description
        )
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;

      return pool.query(query, [
        electionId,
        participant.user_id,
        prizePerWinner || config.reward_amount,
        config.reward_description
      ]);
    });

    const results = await Promise.all(insertPromises);
    const winners = results.map(r => r.rows[0]);

    res.status(HTTP_STATUS.CREATED).json(
      formatResponse(true, {
        winners,
        total_winners: winners.length,
        prize_per_winner: prizePerWinner || config.reward_amount
      }, 'Lottery winners selected successfully')
    );
  });

  /**
   * Cryptographically secure random selection algorithm
   */
  selectRandomWinners(participants, count) {
    const shuffled = [...participants];
    
    // Fisher-Yates shuffle with crypto.randomBytes for secure randomness
    for (let i = shuffled.length - 1; i > 0; i--) {
      // Generate cryptographically secure random number
      const randomBytes = crypto.randomBytes(4);
      const randomNumber = randomBytes.readUInt32BE(0) / 0xFFFFFFFF;
      const j = Math.floor(randomNumber * (i + 1));
      
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    return shuffled.slice(0, count);
  }

  /**
   * Get lottery winners
   */
  getWinners = asyncHandler(async (req, res) => {
    const { electionId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const query = `
      SELECT 
        lw.*,
        ud.email,
        ud.username,
        COUNT(*) OVER() as total_count
      FROM votteryy_election_lottery_winners lw
      LEFT JOIN votteryy_user_details ud ON lw.user_id = ud.id
      WHERE lw.election_id = $1
      ORDER BY lw.draw_timestamp DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(query, [electionId, limit, offset]);

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, {
        winners: result.rows,
        total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
        page: parseInt(page),
        limit: parseInt(limit)
      }, 'Winners retrieved successfully')
    );
  });

  /**
   * Claim prize (for winner)
   */
  claimPrize = asyncHandler(async (req, res) => {
    const { winnerId } = req.params;
    const { userId } = req.user;

    // Verify winner ownership
    const winnerCheck = await pool.query(
      'SELECT * FROM votteryy_election_lottery_winners WHERE id = $1',
      [winnerId]
    );

    if (winnerCheck.rows.length === 0) {
      throw new AppError('Winner record not found', HTTP_STATUS.NOT_FOUND);
    }

    const winner = winnerCheck.rows[0];

    if (winner.user_id !== userId) {
      throw new AppError('You can only claim your own prize', HTTP_STATUS.FORBIDDEN);
    }

    if (winner.is_claimed) {
      throw new AppError('Prize has already been claimed', HTTP_STATUS.CONFLICT);
    }

    // Update claim status
    const query = `
      UPDATE votteryy_election_lottery_winners
      SET is_claimed = TRUE, claimed_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [winnerId]);

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, result.rows[0], 'Prize claimed successfully')
    );
  });

  /**
   * Get my lottery wins
   */
  getMyWins = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const query = `
      SELECT 
        lw.*,
        e.title as election_title,
        e.slug as election_slug,
        COUNT(*) OVER() as total_count
      FROM votteryy_election_lottery_winners lw
      JOIN votteryyy_elections e ON lw.election_id = e.id
      WHERE lw.user_id = $1
      ORDER BY lw.draw_timestamp DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(query, [userId, limit, offset]);

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, {
        wins: result.rows,
        total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
        page: parseInt(page),
        limit: parseInt(limit)
      }, 'My wins retrieved successfully')
    );
  });

  /**
   * Auto-trigger lottery at election end (called by cron job or election completion)
   */
  autoTriggerLottery = asyncHandler(async (req, res) => {
    const { electionId } = req.params;

    // Get lottery configuration
    const configResult = await pool.query(
      'SELECT * FROM votteryy_election_lottery_config WHERE election_id = $1',
      [electionId]
    );

    if (configResult.rows.length === 0) {
      throw new AppError('No lottery configuration found', HTTP_STATUS.NOT_FOUND);
    }

    const config = configResult.rows[0];

    if (!config.is_lotterized || !config.auto_trigger_at_end) {
      throw new AppError('Auto-trigger is not enabled', HTTP_STATUS.BAD_REQUEST);
    }

    // Check if election has ended
    const electionResult = await pool.query(
      'SELECT status FROM votteryyy_elections WHERE id = $1',
      [electionId]
    );

    if (electionResult.rows[0].status !== 'completed') {
      throw new AppError('Election is not yet completed', HTTP_STATUS.BAD_REQUEST);
    }

    // Trigger winner selection
    // (Reuse the selection logic)
    req.params.electionId = electionId;
    req.user = { userId: electionResult.rows[0].creator_id }; // System trigger
    
    await this.selectWinners(req, res);
  });
}

export default new LotteryController();