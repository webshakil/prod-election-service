import pool from '../config/database.js';
import { asyncHandler, AppError } from '../utils/errorHandler.js';
import { formatResponse, generateSlug } from '../utils/helpers.js';
import { HTTP_STATUS } from '../config/constants.js';
import { Parser } from 'json2csv';

class CloneExportController {
  
  // ✅ NEW: Helper method to check votes from BOTH tables
  async checkElectionVotes(electionId) {
    const query = `
      SELECT 
        COALESCE(
          (SELECT COUNT(*) FROM votteryy_votes WHERE election_id = $1 AND status = 'valid'),
          0
        )::integer as normal_votes,
        COALESCE(
          (SELECT COUNT(*) FROM votteryyy_anonymous_votes WHERE election_id = $1),
          0
        )::integer as anonymous_votes
    `;
    
    const result = await pool.query(query, [electionId]);
    const normalVotes = parseInt(result.rows[0]?.normal_votes) || 0;
    const anonymousVotes = parseInt(result.rows[0]?.anonymous_votes) || 0;
    
    return {
      normalVotes,
      anonymousVotes,
      totalVotes: normalVotes + anonymousVotes,
      hasVotes: (normalVotes + anonymousVotes) > 0
    };
  }

  /**
   * Clone an election with all its questions and options
   */
  cloneElection = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { userId } = req.user;
    const { new_title } = req.body;

    // ✅ NEW: Check if election has votes before cloning
    const voteCheck = await this.checkElectionVotes(id);
    if (voteCheck.hasVotes) {
      throw new AppError(
        `Cannot clone election: ${voteCheck.totalVotes} votes have been cast (${voteCheck.normalVotes} normal + ${voteCheck.anonymousVotes} anonymous). Elections with votes cannot be cloned.`,
        HTTP_STATUS.FORBIDDEN
      );
    }

    // Get original election
    const electionResult = await pool.query(
      'SELECT * FROM votteryyy_elections WHERE id = $1',
      [id]
    );

    if (electionResult.rows.length === 0) {
      throw new AppError('Election not found', HTTP_STATUS.NOT_FOUND);
    }

    const original = electionResult.rows[0];

    // Verify access (either creator or public election)
    if (original.creator_id !== userId && original.permission_type !== 'public') {
      throw new AppError('You do not have permission to clone this election', HTTP_STATUS.FORBIDDEN);
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Create cloned election
      const title = new_title || `${original.title} (Copy)`;
      const slug = generateSlug(title);

      const cloneQuery = `
        INSERT INTO votteryyy_elections (
          creator_id, creator_type, organization_id, title, description, slug,
          voting_type, voting_body_content, permission_type, allowed_countries,
          is_free, pricing_type, general_participation_fee, processing_fee_percentage,
          biometric_required, authentication_methods, corporate_style,
          show_live_results, vote_editing_allowed, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, 'draft')
        RETURNING *
      `;

      const cloneResult = await client.query(cloneQuery, [
        userId, // New creator
        original.creator_type,
        original.organization_id,
        title,
        original.description,
        slug,
        original.voting_type,
        original.voting_body_content,
        original.permission_type,
        original.allowed_countries,
        original.is_free,
        original.pricing_type,
        original.general_participation_fee,
        original.processing_fee_percentage,
        original.biometric_required,
        original.authentication_methods,
        original.corporate_style,
        original.show_live_results,
        original.vote_editing_allowed
      ]);

      const clonedElection = cloneResult.rows[0];

      // Clone regional pricing
      const pricingResult = await client.query(
        'SELECT * FROM votteryy_election_regional_pricing WHERE election_id = $1',
        [id]
      );

      for (const pricing of pricingResult.rows) {
        await client.query(`
          INSERT INTO votteryy_election_regional_pricing (
            election_id, region_code, region_name, participation_fee,
            currency, processing_fee_percentage
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          clonedElection.id,
          pricing.region_code,
          pricing.region_name,
          pricing.participation_fee,
          pricing.currency,
          pricing.processing_fee_percentage
        ]);
      }

      // Clone questions
      const questionsResult = await client.query(
        'SELECT * FROM votteryy_election_questions WHERE election_id = $1 ORDER BY question_order',
        [id]
      );

      for (const question of questionsResult.rows) {
        const questionResult = await client.query(`
          INSERT INTO votteryy_election_questions (
            election_id, question_text, question_type, question_image_url,
            question_order, is_required, max_selections
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `, [
          clonedElection.id,
          question.question_text,
          question.question_type,
          question.question_image_url,
          question.question_order,
          question.is_required,
          question.max_selections
        ]);

        const newQuestionId = questionResult.rows[0].id;

        // Clone options for this question
        const optionsResult = await client.query(
          'SELECT * FROM votteryy_election_options WHERE question_id = $1 ORDER BY option_order',
          [question.id]
        );

        for (const option of optionsResult.rows) {
          await client.query(`
            INSERT INTO votteryy_election_options (
              question_id, option_text, option_image_url, option_order
            )
            VALUES ($1, $2, $3, $4)
          `, [
            newQuestionId,
            option.option_text,
            option.option_image_url,
            option.option_order
          ]);
        }
      }

      // Clone lottery config if exists
      const lotteryResult = await client.query(
        'SELECT * FROM votteryy_election_lottery_config WHERE election_id = $1',
        [id]
      );

      if (lotteryResult.rows.length > 0) {
        const lottery = lotteryResult.rows[0];
        await client.query(`
          INSERT INTO votteryy_election_lottery_config (
            election_id, is_lotterized, reward_type, reward_amount,
            reward_description, winner_count, prize_pool_total,
            lottery_machine_visible, auto_trigger_at_end
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          clonedElection.id,
          lottery.is_lotterized,
          lottery.reward_type,
          lottery.reward_amount,
          lottery.reward_description,
          lottery.winner_count,
          lottery.prize_pool_total,
          lottery.lottery_machine_visible,
          lottery.auto_trigger_at_end
        ]);
      }

      await client.query('COMMIT');

      res.status(HTTP_STATUS.CREATED).json(
        formatResponse(true, clonedElection, 'Election cloned successfully')
      );

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  /**
   * Export election data as JSON
   */
  exportElectionJSON = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { userId } = req.user;

    // Get election with all related data
    const electionResult = await pool.query(
      'SELECT * FROM votteryyy_elections WHERE id = $1',
      [id]
    );

    if (electionResult.rows.length === 0) {
      throw new AppError('Election not found', HTTP_STATUS.NOT_FOUND);
    }

    const election = electionResult.rows[0];

    // Verify access
    if (election.creator_id !== userId) {
      throw new AppError('You do not have permission to export this election', HTTP_STATUS.FORBIDDEN);
    }

    // Get questions
    const questionsResult = await pool.query(
      'SELECT * FROM votteryy_election_questions WHERE election_id = $1 ORDER BY question_order',
      [id]
    );

    // Get options for each question
    const questions = await Promise.all(
      questionsResult.rows.map(async (question) => {
        const optionsResult = await pool.query(
          'SELECT * FROM votteryy_election_options WHERE question_id = $1 ORDER BY option_order',
          [question.id]
        );
        return {
          ...question,
          options: optionsResult.rows
        };
      })
    );

    // Get regional pricing
    const pricingResult = await pool.query(
      'SELECT * FROM votteryy_election_regional_pricing WHERE election_id = $1',
      [id]
    );

    // Get lottery config
    const lotteryResult = await pool.query(
      'SELECT * FROM votteryy_election_lottery_config WHERE election_id = $1',
      [id]
    );

    // Get vote count (if votes table exists)
    const voteCountResult = await pool.query(
      'SELECT COUNT(*) as vote_count FROM votteryy_votes WHERE election_id = $1',
      [id]
    ).catch(() => ({ rows: [{ vote_count: 0 }] }));

    const exportData = {
      election,
      questions,
      regional_pricing: pricingResult.rows,
      lottery_config: lotteryResult.rows[0] || null,
      statistics: {
        total_questions: questions.length,
        total_votes: parseInt(voteCountResult.rows[0].vote_count),
        total_options: questions.reduce((sum, q) => sum + q.options.length, 0)
      },
      exported_at: new Date().toISOString(),
      exported_by: userId
    };

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, exportData, 'Election data exported successfully')
    );
  });

  /**
   * Export election data as CSV
   */
  exportElectionCSV = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { userId } = req.user;

    // Get election
    const electionResult = await pool.query(
      'SELECT * FROM votteryyy_elections WHERE id = $1',
      [id]
    );

    if (electionResult.rows.length === 0) {
      throw new AppError('Election not found', HTTP_STATUS.NOT_FOUND);
    }

    const election = electionResult.rows[0];

    // Verify access
    if (election.creator_id !== userId) {
      throw new AppError('You do not have permission to export this election', HTTP_STATUS.FORBIDDEN);
    }

    // Get questions with options
    const questionsResult = await pool.query(`
      SELECT 
        q.id as question_id,
        q.question_text,
        q.question_type,
        q.question_order,
        q.is_required,
        q.max_selections,
        o.id as option_id,
        o.option_text,
        o.option_order
      FROM votteryy_election_questions q
      LEFT JOIN votteryy_election_options o ON q.id = o.question_id
      WHERE q.election_id = $1
      ORDER BY q.question_order, o.option_order
    `, [id]);

    // Prepare CSV data
    const csvData = questionsResult.rows.map(row => ({
      election_title: election.title,
      election_status: election.status,
      voting_type: election.voting_type,
      question_id: row.question_id,
      question_text: row.question_text,
      question_type: row.question_type,
      question_order: row.question_order,
      is_required: row.is_required,
      max_selections: row.max_selections,
      option_id: row.option_id,
      option_text: row.option_text,
      option_order: row.option_order
    }));

    const parser = new Parser();
    const csv = parser.parse(csvData);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="election-${id}-${Date.now()}.csv"`);
    res.status(HTTP_STATUS.OK).send(csv);
  });

  /**
   * Export questions only
   */
  exportQuestions = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { userId } = req.user;
    const { format = 'json' } = req.query;

    // Verify access
    const electionResult = await pool.query(
      'SELECT creator_id FROM votteryyy_elections WHERE id = $1',
      [id]
    );

    if (electionResult.rows.length === 0) {
      throw new AppError('Election not found', HTTP_STATUS.NOT_FOUND);
    }

    if (electionResult.rows[0].creator_id !== userId) {
      throw new AppError('You do not have permission to export questions', HTTP_STATUS.FORBIDDEN);
    }

    // Get questions with options
    const questionsResult = await pool.query(
      'SELECT * FROM votteryy_election_questions WHERE election_id = $1 ORDER BY question_order',
      [id]
    );

    const questions = await Promise.all(
      questionsResult.rows.map(async (question) => {
        const optionsResult = await pool.query(
          'SELECT * FROM votteryy_election_options WHERE question_id = $1 ORDER BY option_order',
          [question.id]
        );
        return {
          ...question,
          options: optionsResult.rows
        };
      })
    );

    if (format === 'csv') {
      const flatData = questions.flatMap(q => 
        q.options.map(o => ({
          question_id: q.id,
          question_text: q.question_text,
          question_type: q.question_type,
          question_order: q.question_order,
          option_id: o.id,
          option_text: o.option_text,
          option_order: o.option_order
        }))
      );

      const parser = new Parser();
      const csv = parser.parse(flatData);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="questions-${id}-${Date.now()}.csv"`);
      return res.status(HTTP_STATUS.OK).send(csv);
    }

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, questions, 'Questions exported successfully')
    );
  });

  /**
   * Generate unique voting ID for voter
   */
  generateVotingId = asyncHandler(async (req, res) => {
    const { electionId } = req.params;
    const { userId } = req.user;

    // Verify election exists
    const electionResult = await pool.query(
      'SELECT id, status FROM votteryyy_elections WHERE id = $1',
      [electionId]
    );

    if (electionResult.rows.length === 0) {
      throw new AppError('Election not found', HTTP_STATUS.NOT_FOUND);
    }

    // Generate unique voting ID
    const votingId = `VID-${electionId}-${userId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Optionally store in database for tracking
    // await pool.query('INSERT INTO voting_ids ...');

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, {
        voting_id: votingId,
        election_id: parseInt(electionId),
        user_id: userId,
        generated_at: new Date().toISOString()
      }, 'Voting ID generated successfully')
    );
  });
}

export default new CloneExportController();
//last working code
// import pool from '../config/database.js';
// import { asyncHandler, AppError } from '../utils/errorHandler.js';
// import { formatResponse, generateSlug } from '../utils/helpers.js';
// import { HTTP_STATUS } from '../config/constants.js';
// import { Parser } from 'json2csv';

// class CloneExportController {
//   /**
//    * Clone an election with all its questions and options
//    */
//   cloneElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;
//     const { new_title } = req.body;

//     // Get original election
//     const electionResult = await pool.query(
//       'SELECT * FROM votteryyy_elections WHERE id = $1',
//       [id]
//     );

//     if (electionResult.rows.length === 0) {
//       throw new AppError('Election not found', HTTP_STATUS.NOT_FOUND);
//     }

//     const original = electionResult.rows[0];

//     // Verify access (either creator or public election)
//     if (original.creator_id !== userId && original.permission_type !== 'public') {
//       throw new AppError('You do not have permission to clone this election', HTTP_STATUS.FORBIDDEN);
//     }

//     const client = await pool.connect();

//     try {
//       await client.query('BEGIN');

//       // Create cloned election
//       const title = new_title || `${original.title} (Copy)`;
//       const slug = generateSlug(title);

//       const cloneQuery = `
//         INSERT INTO votteryyy_elections (
//           creator_id, creator_type, organization_id, title, description, slug,
//           voting_type, voting_body_content, permission_type, allowed_countries,
//           is_free, pricing_type, general_participation_fee, processing_fee_percentage,
//           biometric_required, authentication_methods, corporate_style,
//           show_live_results, vote_editing_allowed, status
//         )
//         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, 'draft')
//         RETURNING *
//       `;

//       const cloneResult = await client.query(cloneQuery, [
//         userId, // New creator
//         original.creator_type,
//         original.organization_id,
//         title,
//         original.description,
//         slug,
//         original.voting_type,
//         original.voting_body_content,
//         original.permission_type,
//         original.allowed_countries,
//         original.is_free,
//         original.pricing_type,
//         original.general_participation_fee,
//         original.processing_fee_percentage,
//         original.biometric_required,
//         original.authentication_methods,
//         original.corporate_style,
//         original.show_live_results,
//         original.vote_editing_allowed
//       ]);

//       const clonedElection = cloneResult.rows[0];

//       // Clone regional pricing
//       const pricingResult = await client.query(
//         'SELECT * FROM votteryy_election_regional_pricing WHERE election_id = $1',
//         [id]
//       );

//       for (const pricing of pricingResult.rows) {
//         await client.query(`
//           INSERT INTO votteryy_election_regional_pricing (
//             election_id, region_code, region_name, participation_fee,
//             currency, processing_fee_percentage
//           )
//           VALUES ($1, $2, $3, $4, $5, $6)
//         `, [
//           clonedElection.id,
//           pricing.region_code,
//           pricing.region_name,
//           pricing.participation_fee,
//           pricing.currency,
//           pricing.processing_fee_percentage
//         ]);
//       }

//       // Clone questions
//       const questionsResult = await client.query(
//         'SELECT * FROM votteryy_election_questions WHERE election_id = $1 ORDER BY question_order',
//         [id]
//       );

//       for (const question of questionsResult.rows) {
//         const questionResult = await client.query(`
//           INSERT INTO votteryy_election_questions (
//             election_id, question_text, question_type, question_image_url,
//             question_order, is_required, max_selections
//           )
//           VALUES ($1, $2, $3, $4, $5, $6, $7)
//           RETURNING id
//         `, [
//           clonedElection.id,
//           question.question_text,
//           question.question_type,
//           question.question_image_url,
//           question.question_order,
//           question.is_required,
//           question.max_selections
//         ]);

//         const newQuestionId = questionResult.rows[0].id;

//         // Clone options for this question
//         const optionsResult = await client.query(
//           'SELECT * FROM votteryy_election_options WHERE question_id = $1 ORDER BY option_order',
//           [question.id]
//         );

//         for (const option of optionsResult.rows) {
//           await client.query(`
//             INSERT INTO votteryy_election_options (
//               question_id, option_text, option_image_url, option_order
//             )
//             VALUES ($1, $2, $3, $4)
//           `, [
//             newQuestionId,
//             option.option_text,
//             option.option_image_url,
//             option.option_order
//           ]);
//         }
//       }

//       // Clone lottery config if exists
//       const lotteryResult = await client.query(
//         'SELECT * FROM votteryy_election_lottery_config WHERE election_id = $1',
//         [id]
//       );

//       if (lotteryResult.rows.length > 0) {
//         const lottery = lotteryResult.rows[0];
//         await client.query(`
//           INSERT INTO votteryy_election_lottery_config (
//             election_id, is_lotterized, reward_type, reward_amount,
//             reward_description, winner_count, prize_pool_total,
//             lottery_machine_visible, auto_trigger_at_end
//           )
//           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
//         `, [
//           clonedElection.id,
//           lottery.is_lotterized,
//           lottery.reward_type,
//           lottery.reward_amount,
//           lottery.reward_description,
//           lottery.winner_count,
//           lottery.prize_pool_total,
//           lottery.lottery_machine_visible,
//           lottery.auto_trigger_at_end
//         ]);
//       }

//       await client.query('COMMIT');

//       res.status(HTTP_STATUS.CREATED).json(
//         formatResponse(true, clonedElection, 'Election cloned successfully')
//       );

//     } catch (error) {
//       await client.query('ROLLBACK');
//       throw error;
//     } finally {
//       client.release();
//     }
//   });

//   /**
//    * Export election data as JSON
//    */
//   exportElectionJSON = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;

//     // Get election with all related data
//     const electionResult = await pool.query(
//       'SELECT * FROM votteryyy_elections WHERE id = $1',
//       [id]
//     );

//     if (electionResult.rows.length === 0) {
//       throw new AppError('Election not found', HTTP_STATUS.NOT_FOUND);
//     }

//     const election = electionResult.rows[0];

//     // Verify access
//     if (election.creator_id !== userId) {
//       throw new AppError('You do not have permission to export this election', HTTP_STATUS.FORBIDDEN);
//     }

//     // Get questions
//     const questionsResult = await pool.query(
//       'SELECT * FROM votteryy_election_questions WHERE election_id = $1 ORDER BY question_order',
//       [id]
//     );

//     // Get options for each question
//     const questions = await Promise.all(
//       questionsResult.rows.map(async (question) => {
//         const optionsResult = await pool.query(
//           'SELECT * FROM votteryy_election_options WHERE question_id = $1 ORDER BY option_order',
//           [question.id]
//         );
//         return {
//           ...question,
//           options: optionsResult.rows
//         };
//       })
//     );

//     // Get regional pricing
//     const pricingResult = await pool.query(
//       'SELECT * FROM votteryy_election_regional_pricing WHERE election_id = $1',
//       [id]
//     );

//     // Get lottery config
//     const lotteryResult = await pool.query(
//       'SELECT * FROM votteryy_election_lottery_config WHERE election_id = $1',
//       [id]
//     );

//     // Get vote count (if votes table exists)
//     const voteCountResult = await pool.query(
//       'SELECT COUNT(*) as vote_count FROM votteryy_votes WHERE election_id = $1',
//       [id]
//     ).catch(() => ({ rows: [{ vote_count: 0 }] }));

//     const exportData = {
//       election,
//       questions,
//       regional_pricing: pricingResult.rows,
//       lottery_config: lotteryResult.rows[0] || null,
//       statistics: {
//         total_questions: questions.length,
//         total_votes: parseInt(voteCountResult.rows[0].vote_count),
//         total_options: questions.reduce((sum, q) => sum + q.options.length, 0)
//       },
//       exported_at: new Date().toISOString(),
//       exported_by: userId
//     };

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, exportData, 'Election data exported successfully')
//     );
//   });

//   /**
//    * Export election data as CSV
//    */
//   exportElectionCSV = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;

//     // Get election
//     const electionResult = await pool.query(
//       'SELECT * FROM votteryyy_elections WHERE id = $1',
//       [id]
//     );

//     if (electionResult.rows.length === 0) {
//       throw new AppError('Election not found', HTTP_STATUS.NOT_FOUND);
//     }

//     const election = electionResult.rows[0];

//     // Verify access
//     if (election.creator_id !== userId) {
//       throw new AppError('You do not have permission to export this election', HTTP_STATUS.FORBIDDEN);
//     }

//     // Get questions with options
//     const questionsResult = await pool.query(`
//       SELECT 
//         q.id as question_id,
//         q.question_text,
//         q.question_type,
//         q.question_order,
//         q.is_required,
//         q.max_selections,
//         o.id as option_id,
//         o.option_text,
//         o.option_order
//       FROM votteryy_election_questions q
//       LEFT JOIN votteryy_election_options o ON q.id = o.question_id
//       WHERE q.election_id = $1
//       ORDER BY q.question_order, o.option_order
//     `, [id]);

//     // Prepare CSV data
//     const csvData = questionsResult.rows.map(row => ({
//       election_title: election.title,
//       election_status: election.status,
//       voting_type: election.voting_type,
//       question_id: row.question_id,
//       question_text: row.question_text,
//       question_type: row.question_type,
//       question_order: row.question_order,
//       is_required: row.is_required,
//       max_selections: row.max_selections,
//       option_id: row.option_id,
//       option_text: row.option_text,
//       option_order: row.option_order
//     }));

//     const parser = new Parser();
//     const csv = parser.parse(csvData);

//     res.setHeader('Content-Type', 'text/csv');
//     res.setHeader('Content-Disposition', `attachment; filename="election-${id}-${Date.now()}.csv"`);
//     res.status(HTTP_STATUS.OK).send(csv);
//   });

//   /**
//    * Export questions only
//    */
//   exportQuestions = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;
//     const { format = 'json' } = req.query;

//     // Verify access
//     const electionResult = await pool.query(
//       'SELECT creator_id FROM votteryyy_elections WHERE id = $1',
//       [id]
//     );

//     if (electionResult.rows.length === 0) {
//       throw new AppError('Election not found', HTTP_STATUS.NOT_FOUND);
//     }

//     if (electionResult.rows[0].creator_id !== userId) {
//       throw new AppError('You do not have permission to export questions', HTTP_STATUS.FORBIDDEN);
//     }

//     // Get questions with options
//     const questionsResult = await pool.query(
//       'SELECT * FROM votteryy_election_questions WHERE election_id = $1 ORDER BY question_order',
//       [id]
//     );

//     const questions = await Promise.all(
//       questionsResult.rows.map(async (question) => {
//         const optionsResult = await pool.query(
//           'SELECT * FROM votteryy_election_options WHERE question_id = $1 ORDER BY option_order',
//           [question.id]
//         );
//         return {
//           ...question,
//           options: optionsResult.rows
//         };
//       })
//     );

//     if (format === 'csv') {
//       const flatData = questions.flatMap(q => 
//         q.options.map(o => ({
//           question_id: q.id,
//           question_text: q.question_text,
//           question_type: q.question_type,
//           question_order: q.question_order,
//           option_id: o.id,
//           option_text: o.option_text,
//           option_order: o.option_order
//         }))
//       );

//       const parser = new Parser();
//       const csv = parser.parse(flatData);

//       res.setHeader('Content-Type', 'text/csv');
//       res.setHeader('Content-Disposition', `attachment; filename="questions-${id}-${Date.now()}.csv"`);
//       return res.status(HTTP_STATUS.OK).send(csv);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, questions, 'Questions exported successfully')
//     );
//   });

//   /**
//    * Generate unique voting ID for voter
//    */
//   generateVotingId = asyncHandler(async (req, res) => {
//     const { electionId } = req.params;
//     const { userId } = req.user;

//     // Verify election exists
//     const electionResult = await pool.query(
//       'SELECT id, status FROM votteryyy_elections WHERE id = $1',
//       [electionId]
//     );

//     if (electionResult.rows.length === 0) {
//       throw new AppError('Election not found', HTTP_STATUS.NOT_FOUND);
//     }

//     // Generate unique voting ID
//     const votingId = `VID-${electionId}-${userId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

//     // Optionally store in database for tracking
//     // await pool.query('INSERT INTO voting_ids ...');

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, {
//         voting_id: votingId,
//         election_id: parseInt(electionId),
//         user_id: userId,
//         generated_at: new Date().toISOString()
//       }, 'Voting ID generated successfully')
//     );
//   });
// }

// export default new CloneExportController();