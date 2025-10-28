import pool from '../config/database.js';
import { asyncHandler, AppError } from '../utils/errorHandler.js';
import { formatResponse } from '../utils/helpers.js';
import { HTTP_STATUS, ERROR_MESSAGES } from '../config/constants.js';
import { getFileUrl } from '../middleware/uploadMiddleware.js';

class QuestionController {
  /**
   * Add question to election
   */
  addQuestion = asyncHandler(async (req, res) => {
    const { electionId } = req.params;
    const { userId } = req.user;
    const { question_text, question_type, question_order, is_required, max_selections, options } = req.body;

    // Verify election belongs to user
    const electionCheck = await pool.query(
      'SELECT id FROM votteryyy_elections WHERE id = $1 AND creator_id = $2',
      [electionId, userId]
    );

    if (electionCheck.rows.length === 0) {
      throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Handle question image upload
      let questionImageUrl = null;
      if (req.file) {
        questionImageUrl = getFileUrl(req.file.filename, 'images');
      }

      // Insert question
      const questionQuery = `
        INSERT INTO votteryy_election_questions (
          election_id, question_text, question_type, question_image_url,
          question_order, is_required, max_selections
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const questionValues = [
        electionId,
        question_text,
        question_type,
        questionImageUrl,
        question_order || 1,
        is_required !== false,
        max_selections || 1
      ];

      const questionResult = await client.query(questionQuery, questionValues);
      const question = questionResult.rows[0];

      // Insert options if provided (for multiple_choice or image_based)
      if (options && Array.isArray(options) && options.length > 0) {
        for (let i = 0; i < options.length; i++) {
          const option = options[i];
          await client.query(`
            INSERT INTO votteryy_election_options (
              question_id, option_text, option_image_url, option_order
            )
            VALUES ($1, $2, $3, $4)
          `, [
            question.id,
            option.option_text || '',
            option.option_image_url || null,
            option.option_order || i + 1
          ]);
        }
      }

      await client.query('COMMIT');

      // Get question with options
      const fullQuestion = await this.getQuestionWithOptions(question.id);

      res.status(HTTP_STATUS.CREATED).json(
        formatResponse(true, fullQuestion, 'Question added successfully')
      );

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  /**
   * Get all questions for an election
   */
  getElectionQuestions = asyncHandler(async (req, res) => {
    const { electionId } = req.params;

    const query = `
      SELECT 
        q.*,
        json_agg(
          json_build_object(
            'id', o.id,
            'option_text', o.option_text,
            'option_image_url', o.option_image_url,
            'option_order', o.option_order
          ) ORDER BY o.option_order
        ) FILTER (WHERE o.id IS NOT NULL) as options
      FROM votteryy_election_questions q
      LEFT JOIN votteryy_election_options o ON q.id = o.question_id
      WHERE q.election_id = $1
      GROUP BY q.id
      ORDER BY q.question_order
    `;

    const result = await pool.query(query, [electionId]);

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, result.rows, 'Questions retrieved successfully')
    );
  });

  /**
   * Get single question by ID
   */
  getQuestion = asyncHandler(async (req, res) => {
    const { questionId } = req.params;

    const question = await this.getQuestionWithOptions(questionId);

    if (!question) {
      throw new AppError('Question not found', HTTP_STATUS.NOT_FOUND);
    }

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, question, 'Question retrieved successfully')
    );
  });

  /**
   * Update question
   */
  updateQuestion = asyncHandler(async (req, res) => {
    const { questionId } = req.params;
    const { userId } = req.user;
    const updateData = req.body;

    // Verify question belongs to user's election
    const verifyQuery = `
      SELECT q.* FROM votteryy_election_questions q
      JOIN votteryyy_elections e ON q.election_id = e.id
      WHERE q.id = $1 AND e.creator_id = $2
    `;

    const verifyResult = await pool.query(verifyQuery, [questionId, userId]);

    if (verifyResult.rows.length === 0) {
      throw new AppError('Question not found', HTTP_STATUS.NOT_FOUND);
    }

    // Handle image upload
    if (req.file) {
      updateData.question_image_url = getFileUrl(req.file.filename, 'images');
    }

    const fields = [];
    const values = [];
    let paramCount = 0;

    const allowedFields = [
      'question_text', 'question_type', 'question_image_url',
      'question_order', 'is_required', 'max_selections'
    ];

    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        paramCount++;
        fields.push(`${field} = $${paramCount}`);
        values.push(updateData[field]);
      }
    }

    if (fields.length === 0) {
      const question = await this.getQuestionWithOptions(questionId);
      return res.status(HTTP_STATUS.OK).json(
        formatResponse(true, question, 'No changes made')
      );
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(questionId);

    const query = `
      UPDATE votteryy_election_questions
      SET ${fields.join(', ')}
      WHERE id = $${paramCount + 1}
      RETURNING *
    `;

    await pool.query(query, values);

    const updatedQuestion = await this.getQuestionWithOptions(questionId);

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, updatedQuestion, 'Question updated successfully')
    );
  });

  /**
   * Delete question
   */
  deleteQuestion = asyncHandler(async (req, res) => {
    const { questionId } = req.params;
    const { userId } = req.user;

    // Verify question belongs to user's election
    const verifyQuery = `
      SELECT q.* FROM votteryy_election_questions q
      JOIN votteryyy_elections e ON q.election_id = e.id
      WHERE q.id = $1 AND e.creator_id = $2
    `;

    const verifyResult = await pool.query(verifyQuery, [questionId, userId]);

    if (verifyResult.rows.length === 0) {
      throw new AppError('Question not found', HTTP_STATUS.NOT_FOUND);
    }

    // Delete question (options will be deleted via CASCADE)
    await pool.query('DELETE FROM votteryy_election_questions WHERE id = $1', [questionId]);

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, null, 'Question deleted successfully')
    );
  });

  /**
   * Add option to question
   */
  addOption = asyncHandler(async (req, res) => {
    const { questionId } = req.params;
    const { userId } = req.user;
    const { option_text, option_order } = req.body;

    // Verify question belongs to user's election
    const verifyQuery = `
      SELECT q.* FROM votteryy_election_questions q
      JOIN votteryyy_elections e ON q.election_id = e.id
      WHERE q.id = $1 AND e.creator_id = $2
    `;

    const verifyResult = await pool.query(verifyQuery, [questionId, userId]);

    if (verifyResult.rows.length === 0) {
      throw new AppError('Question not found', HTTP_STATUS.NOT_FOUND);
    }

    // Handle option image upload
    let optionImageUrl = null;
    if (req.file) {
      optionImageUrl = getFileUrl(req.file.filename, 'images');
    }

    const query = `
      INSERT INTO votteryy_election_options (
        question_id, option_text, option_image_url, option_order
      )
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const result = await pool.query(query, [
      questionId,
      option_text,
      optionImageUrl,
      option_order || 1
    ]);

    res.status(HTTP_STATUS.CREATED).json(
      formatResponse(true, result.rows[0], 'Option added successfully')
    );
  });

  /**
   * Update option
   */
  updateOption = asyncHandler(async (req, res) => {
    const { optionId } = req.params;
    const { userId } = req.user;
    const { option_text, option_order } = req.body;

    // Verify option belongs to user's election
    const verifyQuery = `
      SELECT o.* FROM votteryy_election_options o
      JOIN votteryy_election_questions q ON o.question_id = q.id
      JOIN votteryyy_elections e ON q.election_id = e.id
      WHERE o.id = $1 AND e.creator_id = $2
    `;

    const verifyResult = await pool.query(verifyQuery, [optionId, userId]);

    if (verifyResult.rows.length === 0) {
      throw new AppError('Option not found', HTTP_STATUS.NOT_FOUND);
    }

    // Handle image upload
    let optionImageUrl = verifyResult.rows[0].option_image_url;
    if (req.file) {
      optionImageUrl = getFileUrl(req.file.filename, 'images');
    }

    const query = `
      UPDATE votteryy_election_options
      SET 
        option_text = COALESCE($1, option_text),
        option_image_url = COALESCE($2, option_image_url),
        option_order = COALESCE($3, option_order)
      WHERE id = $4
      RETURNING *
    `;

    const result = await pool.query(query, [option_text, optionImageUrl, option_order, optionId]);

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, result.rows[0], 'Option updated successfully')
    );
  });

  /**
   * Delete option
   */
  deleteOption = asyncHandler(async (req, res) => {
    const { optionId } = req.params;
    const { userId } = req.user;

    // Verify option belongs to user's election
    const verifyQuery = `
      SELECT o.* FROM votteryy_election_options o
      JOIN votteryy_election_questions q ON o.question_id = q.id
      JOIN votteryyy_elections e ON q.election_id = e.id
      WHERE o.id = $1 AND e.creator_id = $2
    `;

    const verifyResult = await pool.query(verifyQuery, [optionId, userId]);

    if (verifyResult.rows.length === 0) {
      throw new AppError('Option not found', HTTP_STATUS.NOT_FOUND);
    }

    await pool.query('DELETE FROM votteryy_election_options WHERE id = $1', [optionId]);

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, null, 'Option deleted successfully')
    );
  });

  /**
   * Helper: Get question with all options
   */
  async getQuestionWithOptions(questionId) {
    const query = `
      SELECT 
        q.*,
        json_agg(
          json_build_object(
            'id', o.id,
            'option_text', o.option_text,
            'option_image_url', o.option_image_url,
            'option_order', o.option_order
          ) ORDER BY o.option_order
        ) FILTER (WHERE o.id IS NOT NULL) as options
      FROM votteryy_election_questions q
      LEFT JOIN votteryy_election_options o ON q.id = o.question_id
      WHERE q.id = $1
      GROUP BY q.id
    `;

    const result = await pool.query(query, [questionId]);
    return result.rows[0] || null;
  }
}

export default new QuestionController();