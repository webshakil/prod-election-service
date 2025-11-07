import pool from '../config/database.js';
import { generateUniqueSlug, validateDates, generateShareableUrl } from '../utils/helpers.js';
import { ELECTION_STATUS, CREATOR_TYPES } from '../config/constants.js';

class ElectionService {
  /**
   * Create a draft election (basic info only)
   */
  async createDraft(userId, creatorType, draftData) {
    const { title, description, organization_id } = draftData;

    const query = `
      INSERT INTO votteryy_election_drafts (
        creator_id, creator_type, organization_id, title, description, draft_data
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const values = [
      userId,
      creatorType,
      organization_id || null,
      title,
      description || null,
      JSON.stringify(draftData)
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Get draft by ID
   */
  async getDraft(draftId, userId) {
    const query = `
      SELECT * FROM votteryy_election_drafts
      WHERE id = $1 AND creator_id = $2
    `;

    const result = await pool.query(query, [draftId, userId]);
    return result.rows[0] || null;
  }

  /**
   * Update draft
   */
  async updateDraft(draftId, userId, updateData) {
    const draft = await this.getDraft(draftId, userId);
    if (!draft) return null;

    // Merge existing draft_data with new data
    const existingData = draft.draft_data || {};
    const mergedData = { ...existingData, ...updateData };

    const query = `
      UPDATE votteryy_election_drafts
      SET 
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        draft_data = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4 AND creator_id = $5
      RETURNING *
    `;

    const values = [
      updateData.title || null,
      updateData.description || null,
      JSON.stringify(mergedData),
      draftId,
      userId
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Publish election from draft - WITH VIDEO WATCH TIME AND LOTTERY FIELDS
   */
  async publishElectionFromDraft(draftId, userId, electionData) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Get draft
      const draftQuery = 'SELECT * FROM votteryy_election_drafts WHERE id = $1 AND creator_id = $2';
      const draftResult = await client.query(draftQuery, [draftId, userId]);
      
      if (draftResult.rows.length === 0) {
        throw new Error('Draft not found');
      }

      const draft = draftResult.rows[0];
      const draftData = draft.draft_data || {};

      // Extract structured data from request
      const { election, questions, regional_pricing, lottery_config } = electionData;
      
      // Merge draft data with election data
      const mergedData = { ...draftData, ...election };

      console.log('📦 Merged Data:', {
        category_id: mergedData.category_id,
        video_watch_required: mergedData.video_watch_required,
        minimum_watch_time: mergedData.minimum_watch_time,
        minimum_watch_percentage: mergedData.minimum_watch_percentage,
        lottery_enabled: lottery_config?.lottery_enabled
      });

      // Validate dates
      const startDateTime = `${mergedData.start_date} ${mergedData.start_time || '00:00:00'}`;
      const endDateTime = `${mergedData.end_date} ${mergedData.end_time || '23:59:59'}`;
      
      const dateValidation = validateDates(startDateTime, endDateTime);
      if (!dateValidation.valid) {
        throw new Error(dateValidation.message);
      }

      // Use provided slug or generate new one
      const slug = mergedData.slug || generateUniqueSlug(mergedData.title || draft.title);

      // Check if slug exists
      const slugCheck = await client.query(
        'SELECT id FROM votteryyy_elections WHERE slug = $1',
        [slug]
      );

      if (slugCheck.rows.length > 0) {
        throw new Error('Election slug already exists');
      }

      // 1. INSERT ELECTION - ALL FIELDS INCLUDING VIDEO WATCH AND LOTTERY
      const insertElectionQuery = `
        INSERT INTO votteryyy_elections (
          creator_id, creator_type, organization_id, 
          title, description, slug,
          topic_image_url, topic_video_url, logo_url,
          start_date, start_time, end_date, end_time, timezone,
          voting_type, voting_body_content,
          permission_type, allowed_countries,
          is_free, pricing_type, general_participation_fee, processing_fee_percentage,
          biometric_required, authentication_methods,
          show_live_results, vote_editing_allowed,
          category_id,
          video_watch_required, minimum_watch_time, minimum_watch_percentage,
          lottery_enabled, lottery_prize_funding_source, lottery_reward_type,
          lottery_total_prize_pool, lottery_prize_description, lottery_estimated_value,
          lottery_projected_revenue, lottery_revenue_share_percentage,
          lottery_winner_count, lottery_prize_distribution,
          custom_url, corporate_style,
          status, published_at, subscription_plan_id
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
          $31, $32, $33, $34, $35, $36, $37, $38, $39, $40,
          $41, $42, $43, CURRENT_TIMESTAMP, $44
        )
        RETURNING *
      `;

      const electionValues = [
        // Basic Info ($1-$9)
        userId,                                                    // $1
        draft.creator_type,                                        // $2
        draft.organization_id,                                     // $3
        mergedData.title || draft.title,                          // $4
        mergedData.description || draft.description,              // $5
        slug,                                                      // $6
        mergedData.topic_image_url || null,                       // $7
        mergedData.topic_video_url || null,                       // $8
        mergedData.logo_url || null,                              // $9
        
        // Scheduling ($10-$14)
        startDateTime,                                             // $10
        mergedData.start_time || '00:00:00',                      // $11
        endDateTime,                                               // $12
        mergedData.end_time || '23:59:59',                        // $13
        mergedData.timezone || 'UTC',                             // $14
        
        // Voting Config ($15-$16)
        mergedData.voting_type || 'plurality',                    // $15
        mergedData.voting_body_content || null,                   // $16
        
        // Access Control ($17-$18)
        mergedData.permission_type || 'public',                   // $17
        mergedData.allowed_countries || null,                     // $18
        
        // Pricing ($19-$22)
        mergedData.pricing_type === 'free',                       // $19
        mergedData.pricing_type || 'free',                        // $20
        parseFloat(mergedData.general_participation_fee) || 0,    // $21
        parseFloat(mergedData.processing_fee_percentage) || 0,    // $22
        
        // Biometric ($23-$24)
        mergedData.biometric_required || false,                   // $23
        mergedData.authentication_methods || ['passkey'],         // $24
        
        // Features ($25-$26)
        mergedData.show_live_results || false,                    // $25
        mergedData.vote_editing_allowed || false,                 // $26
        
        // Category ($27)
        mergedData.category_id ? parseInt(mergedData.category_id) : null, // $27
        
        // ✅ VIDEO WATCH TIME FIELDS ($28-$30)
        mergedData.video_watch_required || false,                 // $28
        mergedData.minimum_watch_time ? parseInt(mergedData.minimum_watch_time) : 0, // $29
        mergedData.minimum_watch_percentage ? parseFloat(mergedData.minimum_watch_percentage) : 0, // $30
        
        // ✅ LOTTERY FIELDS ($31-$40)
        lottery_config?.lottery_enabled || false,                 // $31
        lottery_config?.prize_funding_source || null,             // $32
        lottery_config?.reward_type || null,                      // $33
        lottery_config?.total_prize_pool ? parseFloat(lottery_config.total_prize_pool) : null, // $34
        lottery_config?.prize_description || null,                // $35
        lottery_config?.estimated_value ? parseFloat(lottery_config.estimated_value) : null, // $36
        lottery_config?.projected_revenue ? parseFloat(lottery_config.projected_revenue) : null, // $37
        lottery_config?.revenue_share_percentage ? parseFloat(lottery_config.revenue_share_percentage) : null, // $38
        lottery_config?.winner_count ? parseInt(lottery_config.winner_count) : 1, // $39
        lottery_config?.prize_distribution ? JSON.stringify(lottery_config.prize_distribution) : null, // $40
        
        // Branding & Status ($41-$44)
        mergedData.custom_url || null,                            // $41
        mergedData.corporate_style ? JSON.stringify(mergedData.corporate_style) : null, // $42
        'published',                                               // $43
        mergedData.subscription_plan_id || null                   // $44
      ];

      console.log('💾 Saving to database with values:', {
        category_id: electionValues[26],
        video_watch_required: electionValues[27],
        minimum_watch_time: electionValues[28],
        minimum_watch_percentage: electionValues[29],
        lottery_enabled: electionValues[30],
        lottery_winner_count: electionValues[38],
        lottery_prize_distribution: electionValues[39]
      });

      const electionResult = await client.query(insertElectionQuery, electionValues);
      const publishedElection = electionResult.rows[0];

      console.log('✅ Election saved with ID:', publishedElection.id);

      // 2. INSERT CATEGORY MAPPING (if category_id exists) - OPTIONAL
      // Uncomment if you have a separate mapping table
      // if (mergedData.category_id) {
      //   const categoryMappingQuery = `
      //     INSERT INTO votteryy_election_category_mapping (election_id, category_id)
      //     VALUES ($1, $2)
      //     ON CONFLICT (election_id, category_id) DO NOTHING
      //   `;
      //   await client.query(categoryMappingQuery, [publishedElection.id, mergedData.category_id]);
      // }

      // 3. INSERT REGIONAL PRICING (if applicable)
      if (regional_pricing && regional_pricing.length > 0) {
        console.log('💰 Saving regional pricing:', regional_pricing.length, 'regions');
        
        for (const region of regional_pricing) {
          const regionalPricingQuery = `
            INSERT INTO votteryy_election_regional_pricing (
              election_id, region_code, region_name, participation_fee, 
              currency, processing_fee_percentage
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (election_id, region_code) DO UPDATE
            SET participation_fee = EXCLUDED.participation_fee,
                currency = EXCLUDED.currency,
                processing_fee_percentage = EXCLUDED.processing_fee_percentage
          `;
          
          await client.query(regionalPricingQuery, [
            publishedElection.id,
            region.region_code,
            region.region_name,
            parseFloat(region.participation_fee),
            region.currency || 'USD',
            parseFloat(mergedData.processing_fee_percentage) || 0
          ]);
        }
      }

      // 4. INSERT QUESTIONS AND OPTIONS
      if (questions && questions.length > 0) {
        console.log('❓ Saving questions:', questions.length, 'questions');
        
        for (const question of questions) {
          // Insert question
          const questionInsertQuery = `
            INSERT INTO votteryy_election_questions (
              election_id, question_text, question_type, 
              question_order, is_required, max_selections
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
          `;
          
          const questionResult = await client.query(questionInsertQuery, [
            publishedElection.id,
            question.question_text,
            question.question_type,
            question.question_order,
            question.is_required !== undefined ? question.is_required : true,
            question.max_selections || 1
          ]);
          
          const questionId = questionResult.rows[0].id;
          
          // Insert options for this question (if they exist)
          if (question.options && question.options.length > 0) {
            for (const option of question.options) {
              const optionInsertQuery = `
                INSERT INTO votteryy_election_options (
                  question_id, option_text, option_order
                )
                VALUES ($1, $2, $3)
              `;
              
              await client.query(optionInsertQuery, [
                questionId,
                option.option_text,
                option.option_order
              ]);
            }
          }
        }
      }

      // 5. DELETE DRAFT
      await client.query('DELETE FROM votteryy_election_drafts WHERE id = $1', [draftId]);

      await client.query('COMMIT');

      console.log('🎉 Election published successfully!');

      // Generate shareable URL
      const shareableUrl = generateShareableUrl(publishedElection.slug, process.env.FRONTEND_URL);
      publishedElection.shareable_url = shareableUrl;

      return publishedElection;

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Publish election error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create election directly (without draft)
   */
  async createElection(userId, creatorType, electionData) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Validate dates
      const dateValidation = validateDates(electionData.start_date, electionData.end_date);
      if (!dateValidation.valid) {
        throw new Error(dateValidation.message);
      }

      // Generate slug
      const slug = generateUniqueSlug(electionData.title);

      // Check if slug exists
      const slugCheck = await client.query(
        'SELECT id FROM votteryyy_elections WHERE slug = $1',
        [slug]
      );

      if (slugCheck.rows.length > 0) {
        throw new Error('A similar election already exists');
      }

      const insertQuery = `
        INSERT INTO votteryyy_elections (
          creator_id, creator_type, organization_id, title, description, slug,
          topic_image_url, topic_video_url, logo_url,
          start_date, end_date, timezone,
          voting_type, voting_body_content,
          permission_type, allowed_countries,
          is_free, pricing_type, general_participation_fee, processing_fee_percentage,
          biometric_required, authentication_methods,
          custom_url, corporate_style,
          status, subscription_plan_id
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
        )
        RETURNING *
      `;

      const values = [
        userId,
        creatorType,
        electionData.organization_id || null,
        electionData.title,
        electionData.description || null,
        slug,
        electionData.topic_image_url || null,
        electionData.topic_video_url || null,
        electionData.logo_url || null,
        electionData.start_date,
        electionData.end_date,
        electionData.timezone || 'UTC',
        electionData.voting_type,
        electionData.voting_body_content || null,
        electionData.permission_type || 'public',
        electionData.allowed_countries || null,
        electionData.is_free !== false,
        electionData.pricing_type || 'free',
        electionData.general_participation_fee || 0,
        electionData.processing_fee_percentage || 0,
        electionData.biometric_required || false,
        electionData.authentication_methods || ['passkey'],
        electionData.custom_url || null,
        electionData.corporate_style ? JSON.stringify(electionData.corporate_style) : null,
        electionData.status || 'draft',
        electionData.subscription_plan_id || null
      ];

      const result = await client.query(insertQuery, values);
      const election = result.rows[0];

      // Insert regional pricing if applicable
      if (electionData.pricing_type === 'regional_fee' && electionData.regional_pricing) {
        for (const region of electionData.regional_pricing) {
          await client.query(`
            INSERT INTO votteryy_election_regional_pricing (
              election_id, region_code, region_name, participation_fee, currency, processing_fee_percentage
            )
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [
            election.id,
            region.region_code,
            region.region_name,
            region.participation_fee,
            region.currency || 'USD',
            electionData.processing_fee_percentage || 0
          ]);
        }
      }

      await client.query('COMMIT');

      // Generate shareable URL
      const shareableUrl = generateShareableUrl(election.slug, process.env.FRONTEND_URL);
      election.shareable_url = shareableUrl;

      return election;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get election by ID with full details
   */
  async getElectionById(electionId) {
    const client = await pool.connect();
    
    try {
      // 1. Get election with regional pricing
      const electionQuery = `
        SELECT 
          e.*,
          json_agg(
            DISTINCT jsonb_build_object(
              'region_code', erp.region_code,
              'region_name', erp.region_name,
              'participation_fee', erp.participation_fee,
              'currency', erp.currency
            )
          ) FILTER (WHERE erp.id IS NOT NULL) as regional_pricing
        FROM votteryyy_elections e
        LEFT JOIN votteryy_election_regional_pricing erp ON e.id = erp.election_id
        WHERE e.id = $1
        GROUP BY e.id
      `;

      const electionResult = await client.query(electionQuery, [electionId]);
      
      if (electionResult.rows.length === 0) return null;

      const election = electionResult.rows[0];

      // 2. Get questions with options
      const questionsQuery = `
        SELECT 
          q.*,
          json_agg(
            jsonb_build_object(
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

      const questionsResult = await client.query(questionsQuery, [election.id]);
      election.questions = questionsResult.rows;

      // 3. Format lottery config from direct columns (not from settings table)
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
      } else {
        election.lottery_config = null;
      }

      // 4. Generate shareable URL
      election.shareable_url = generateShareableUrl(election.slug, process.env.FRONTEND_URL);

      return election;

    } finally {
      client.release();
    }
  }

  /**
   * Get election by slug with full details
   */
  async getElectionBySlug(slug) {
    const client = await pool.connect();
    
    try {
      // 1. Get election with regional pricing
      const electionQuery = `
        SELECT 
          e.*,
          json_agg(
            DISTINCT jsonb_build_object(
              'region_code', erp.region_code,
              'region_name', erp.region_name,
              'participation_fee', erp.participation_fee,
              'currency', erp.currency
            )
          ) FILTER (WHERE erp.id IS NOT NULL) as regional_pricing
        FROM votteryyy_elections e
        LEFT JOIN votteryy_election_regional_pricing erp ON e.id = erp.election_id
        WHERE e.slug = $1
        GROUP BY e.id
      `;

      const electionResult = await client.query(electionQuery, [slug]);
      
      if (electionResult.rows.length === 0) return null;

      const election = electionResult.rows[0];

      // 2. Get questions with options
      const questionsQuery = `
        SELECT 
          q.*,
          json_agg(
            jsonb_build_object(
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

      const questionsResult = await client.query(questionsQuery, [election.id]);
      election.questions = questionsResult.rows;

      // 3. Format lottery config from direct columns
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
      } else {
        election.lottery_config = null;
      }

      // 4. Generate shareable URL
      election.shareable_url = generateShareableUrl(election.slug, process.env.FRONTEND_URL);

      return election;

    } finally {
      client.release();
    }
  }

  /**
   * Get user's elections WITH regional_pricing, lottery_config, questions
   */
  async getUserElections(userId, filters = {}) {
    const { status, page = 1, limit = 10, includeFullData = false } = filters;
    const offset = (page - 1) * limit;

    if (includeFullData) {
      const client = await pool.connect();
      
      try {
        let whereClause = 'e.creator_id = $1';
        const params = [userId];
        let paramCount = 1;

        if (status) {
          paramCount++;
          whereClause += ` AND e.status = $${paramCount}`;
          params.push(status);
        }

        const query = `
          SELECT 
            e.*,
            COUNT(*) OVER() as total_count,
            
            COALESCE(
              (
                SELECT json_agg(
                  jsonb_build_object(
                    'id', erp.id,
                    'region_code', erp.region_code,
                    'region_name', erp.region_name,
                    'participation_fee', erp.participation_fee,
                    'currency', erp.currency
                  )
                )
                FROM votteryy_election_regional_pricing erp
                WHERE erp.election_id = e.id
              ),
              '[]'::json
            ) as regional_pricing,
            
            COALESCE(
              (
                SELECT json_agg(
                  jsonb_build_object(
                    'id', q.id,
                    'question_text', q.question_text,
                    'question_type', q.question_type,
                    'question_order', q.question_order,
                    'question_image_url', q.question_image_url,
                    'is_required', q.is_required,
                    'max_selections', q.max_selections,
                    'options', (
                      SELECT json_agg(
                        jsonb_build_object(
                          'id', o.id,
                          'option_text', o.option_text,
                          'option_image_url', o.option_image_url,
                          'option_order', o.option_order
                        ) ORDER BY o.option_order
                      )
                      FROM votteryy_election_options o
                      WHERE o.question_id = q.id
                    )
                  ) ORDER BY q.question_order
                )
                FROM votteryy_election_questions q
                WHERE q.election_id = e.id
              ),
              '[]'::json
            ) as questions
            
          FROM votteryyy_elections e
          WHERE ${whereClause}
          ORDER BY e.created_at DESC
          LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
        `;

        params.push(limit, offset);

        const result = await client.query(query, params);

        // Format lottery_config from direct columns for each election
        result.rows.forEach(election => {
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
          } else {
            election.lottery_config = null;
          }
        });

        return {
          elections: result.rows,
          total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
          page: parseInt(page),
          limit: parseInt(limit)
        };

      } finally {
        client.release();
      }
    }

    // Simple query without full data
    let query = `
      SELECT 
        e.*,
        COUNT(*) OVER() as total_count
      FROM votteryyy_elections e
      WHERE e.creator_id = $1
    `;

    const params = [userId];
    let paramCount = 1;

    if (status) {
      paramCount++;
      query += ` AND e.status = $${paramCount}`;
      params.push(status);
    }

    query += ` ORDER BY e.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    return {
      elections: result.rows,
      total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
      page: parseInt(page),
      limit: parseInt(limit)
    };
  }

  /**
   * Update election
   */
  async updateElection(electionId, userId, updateData) {
    const election = await this.getElectionById(electionId);
    
    if (!election || election.creator_id !== userId) {
      return null;
    }

    const fields = [];
    const values = [];
    let paramCount = 0;

    const allowedFields = [
      'title', 'description', 'topic_image_url', 'topic_video_url', 'logo_url',
      'start_date', 'end_date', 'timezone', 'voting_type', 'voting_body_content',
      'permission_type', 'allowed_countries', 'is_free', 'pricing_type',
      'general_participation_fee', 'processing_fee_percentage', 'biometric_required',
      'authentication_methods', 'custom_url', 'corporate_style', 'status'
    ];

    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        paramCount++;
        fields.push(`${field} = $${paramCount}`);
        values.push(updateData[field]);
      }
    }

    if (fields.length === 0) {
      return election;
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(electionId, userId);

    const query = `
      UPDATE votteryyy_elections
      SET ${fields.join(', ')}
      WHERE id = $${paramCount + 1} AND creator_id = $${paramCount + 2}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Delete election
   */
  async deleteElection(electionId, userId) {
    const query = `
      DELETE FROM votteryyy_elections
      WHERE id = $1 AND creator_id = $2
      RETURNING *
    `;

    const result = await pool.query(query, [electionId, userId]);
    return result.rows[0] || null;
  }

  /**
   * Get user's drafts
   */
  async getUserDrafts(userId) {
    const query = `
      SELECT * FROM votteryy_election_drafts
      WHERE creator_id = $1
      ORDER BY updated_at DESC
    `;

    const result = await pool.query(query, [userId]);
    return result.rows;
  }

  /**
   * Delete draft
   */
  async deleteDraft(draftId, userId) {
    const query = `
      DELETE FROM votteryy_election_drafts
      WHERE id = $1 AND creator_id = $2
      RETURNING *
    `;

    const result = await pool.query(query, [draftId, userId]);
    return result.rows[0] || null;
  }

  /**
   * Get public elections WITH regional_pricing, lottery_config
   */
  async getPublicElections(filters = {}) {
    const { page = 1, limit = 10, status = 'published', includeFullData = false } = filters;
    const offset = (page - 1) * limit;

    if (includeFullData) {
      const client = await pool.connect();
      
      try {
        const query = `
          SELECT 
            e.*,
            COUNT(*) OVER() as total_count,
            
            COALESCE(
              (
                SELECT json_agg(
                  jsonb_build_object(
                    'id', erp.id,
                    'region_code', erp.region_code,
                    'region_name', erp.region_name,
                    'participation_fee', erp.participation_fee,
                    'currency', erp.currency
                  )
                )
                FROM votteryy_election_regional_pricing erp
                WHERE erp.election_id = e.id
              ),
              '[]'::json
            ) as regional_pricing
            
          FROM votteryyy_elections e
          WHERE e.status = $1 AND e.permission_type = 'public'
          ORDER BY e.created_at DESC
          LIMIT $2 OFFSET $3
        `;

        const result = await client.query(query, [status, limit, offset]);

        // Format lottery_config
        result.rows.forEach(election => {
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
          } else {
            election.lottery_config = null;
          }
        });

        return {
          elections: result.rows,
          total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
          page: parseInt(page),
          limit: parseInt(limit)
        };

      } finally {
        client.release();
      }
    }

    const query = `
      SELECT 
        e.*,
        COUNT(*) OVER() as total_count
      FROM votteryyy_elections e
      WHERE e.status = $1 AND e.permission_type = 'public'
      ORDER BY e.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(query, [status, limit, offset]);

    return {
      elections: result.rows,
      total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
      page: parseInt(page),
      limit: parseInt(limit)
    };
  }

  /**
   * Get ALL elections WITH regional_pricing, lottery_config, questions
   */
  async getAllElections(filters = {}) {
    const { page = 1, limit = 50, status, includeFullData = false } = filters;
    const offset = (page - 1) * limit;

    if (includeFullData) {
      const client = await pool.connect();
      
      try {
        let whereClause = '1=1';
        const params = [];
        let paramCount = 0;

        if (status && status !== 'all') {
          paramCount++;
          whereClause += ` AND e.status = $${paramCount}`;
          params.push(status);
        }

        const query = `
          SELECT 
            e.*,
            COUNT(*) OVER() as total_count,
            
            COALESCE(
              (
                SELECT json_agg(
                  jsonb_build_object(
                    'id', erp.id,
                    'region_code', erp.region_code,
                    'region_name', erp.region_name,
                    'participation_fee', erp.participation_fee,
                    'currency', erp.currency
                  )
                )
                FROM votteryy_election_regional_pricing erp
                WHERE erp.election_id = e.id
              ),
              '[]'::json
            ) as regional_pricing,
            
            COALESCE(
              (
                SELECT json_agg(
                  jsonb_build_object(
                    'id', q.id,
                    'question_text', q.question_text,
                    'question_type', q.question_type,
                    'question_order', q.question_order,
                    'question_image_url', q.question_image_url,
                    'is_required', q.is_required,
                    'max_selections', q.max_selections,
                    'options', (
                      SELECT json_agg(
                        jsonb_build_object(
                          'id', o.id,
                          'option_text', o.option_text,
                          'option_image_url', o.option_image_url,
                          'option_order', o.option_order
                        ) ORDER BY o.option_order
                      )
                      FROM votteryy_election_options o
                      WHERE o.question_id = q.id
                    )
                  ) ORDER BY q.question_order
                )
                FROM votteryy_election_questions q
                WHERE q.election_id = e.id
              ),
              '[]'::json
            ) as questions
            
          FROM votteryyy_elections e
          WHERE ${whereClause}
          ORDER BY e.created_at DESC
          LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
        `;

        params.push(limit, offset);

        const result = await client.query(query, params);

        // Format lottery_config
        result.rows.forEach(election => {
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
          } else {
            election.lottery_config = null;
          }
        });

        return {
          elections: result.rows,
          total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
          page: parseInt(page),
          limit: parseInt(limit)
        };

      } finally {
        client.release();
      }
    }

    // Simple query
    let query = `
      SELECT 
        e.*,
        COUNT(*) OVER() as total_count
      FROM votteryyy_elections e
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 0;

    if (status && status !== 'all') {
      paramCount++;
      query += ` AND e.status = $${paramCount}`;
      params.push(status);
    }

    query += ` ORDER BY e.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    return {
      elections: result.rows,
      total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
      page: parseInt(page),
      limit: parseInt(limit)
    };
  }
}

export default new ElectionService();
// import pool from '../config/database.js';
// import { generateUniqueSlug, validateDates, generateShareableUrl } from '../utils/helpers.js';
// import { ELECTION_STATUS, CREATOR_TYPES } from '../config/constants.js';

// class ElectionService {
//   /**
//    * Create a draft election (basic info only)
//    */
//   async createDraft(userId, creatorType, draftData) {
//     const { title, description, organization_id } = draftData;

//     const query = `
//       INSERT INTO votteryy_election_drafts (
//         creator_id, creator_type, organization_id, title, description, draft_data
//       )
//       VALUES ($1, $2, $3, $4, $5, $6)
//       RETURNING *
//     `;

//     const values = [
//       userId,
//       creatorType,
//       organization_id || null,
//       title,
//       description || null,
//       JSON.stringify(draftData)
//     ];

//     const result = await pool.query(query, values);
//     return result.rows[0];
//   }

//   /**
//    * Get draft by ID
//    */
//   async getDraft(draftId, userId) {
//     const query = `
//       SELECT * FROM votteryy_election_drafts
//       WHERE id = $1 AND creator_id = $2
//     `;

//     const result = await pool.query(query, [draftId, userId]);
//     return result.rows[0] || null;
//   }

//   /**
//    * Update draft
//    */
//   async updateDraft(draftId, userId, updateData) {
//     const draft = await this.getDraft(draftId, userId);
//     if (!draft) return null;

//     // Merge existing draft_data with new data
//     const existingData = draft.draft_data || {};
//     const mergedData = { ...existingData, ...updateData };

//     const query = `
//       UPDATE votteryy_election_drafts
//       SET 
//         title = COALESCE($1, title),
//         description = COALESCE($2, description),
//         draft_data = $3,
//         updated_at = CURRENT_TIMESTAMP
//       WHERE id = $4 AND creator_id = $5
//       RETURNING *
//     `;

//     const values = [
//       updateData.title || null,
//       updateData.description || null,
//       JSON.stringify(mergedData),
//       draftId,
//       userId
//     ];

//     const result = await pool.query(query, values);
//     return result.rows[0];
//   }

//   /**
//  * Publish election from draft
//  */
// async publishElectionFromDraft(draftId, userId, electionData) {
//   const client = await pool.connect();
  
//   try {
//     await client.query('BEGIN');

//     // Get draft
//     const draftQuery = 'SELECT * FROM votteryy_election_drafts WHERE id = $1 AND creator_id = $2';
//     const draftResult = await client.query(draftQuery, [draftId, userId]);
    
//     if (draftResult.rows.length === 0) {
//       throw new Error('Draft not found');
//     }

//     const draft = draftResult.rows[0];
//     const draftData = draft.draft_data || {};

//     // Extract structured data from request
//     const { election, questions, regional_pricing, lottery_config } = electionData;
    
//     // Merge draft data with election data
//     const mergedData = { ...draftData, ...election };

//     // Validate dates
//     const startDateTime = `${mergedData.start_date} ${mergedData.start_time || '00:00:00'}`;
//     const endDateTime = `${mergedData.end_date} ${mergedData.end_time || '23:59:59'}`;
    
//     const dateValidation = validateDates(startDateTime, endDateTime);
//     if (!dateValidation.valid) {
//       throw new Error(dateValidation.message);
//     }

//     // Use provided slug or generate new one
//     const slug = mergedData.slug || generateUniqueSlug(mergedData.title || draft.title);

//     // Check if slug exists
//     const slugCheck = await client.query(
//       'SELECT id FROM votteryyy_elections WHERE slug = $1',
//       [slug]
//     );

//     if (slugCheck.rows.length > 0) {
//       throw new Error('Election slug already exists');
//     }

//     // 1. INSERT ELECTION
//     const insertElectionQuery = `
//       INSERT INTO votteryyy_elections (
//         creator_id, creator_type, organization_id, title, description, slug,
//         topic_image_url, topic_video_url, logo_url,
//         start_date, start_time, end_date, end_time, timezone,
//         voting_type, voting_body_content,
//         permission_type, allowed_countries,
//         is_free, pricing_type, general_participation_fee, processing_fee_percentage,
//         biometric_required, authentication_methods,
//         show_live_results, vote_editing_allowed,
//         custom_url, corporate_style,
//         status, published_at, subscription_plan_id
//       )
//       VALUES (
//         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
//         $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, CURRENT_TIMESTAMP, $30
//       )
//       RETURNING *
//     `;

//     const electionValues = [
//       userId,                                                    // $1
//       draft.creator_type,                                        // $2
//       draft.organization_id,                                     // $3
//       mergedData.title || draft.title,                          // $4
//       mergedData.description || draft.description,              // $5
//       slug,                                                      // $6
//       mergedData.topic_image_url || null,                       // $7
//       mergedData.topic_video_url || null,                       // $8
//       mergedData.logo_url || null,                              // $9
//       startDateTime,                                             // $10
//       mergedData.start_time || '00:00:00',                      // $11
//       endDateTime,                                               // $12
//       mergedData.end_time || '23:59:59',                        // $13
//       mergedData.timezone || 'UTC',                             // $14
//       mergedData.voting_type || 'plurality',                    // $15
//       mergedData.voting_body_content || null,                   // $16
//       mergedData.permission_type || 'public',                   // $17
//       mergedData.allowed_countries || null,                     // $18
//       mergedData.pricing_type === 'free',                       // $19
//       mergedData.pricing_type || 'free',                        // $20
//       parseFloat(mergedData.general_participation_fee) || 0,    // $21
//       parseFloat(mergedData.processing_fee_percentage) || 0,    // $22
//       mergedData.biometric_required || false,                   // $23
//       mergedData.authentication_methods || ['passkey'],         // $24
//       mergedData.show_live_results || false,                    // $25
//       mergedData.vote_editing_allowed || false,                 // $26
//       mergedData.custom_url || null,                            // $27
//       mergedData.corporate_style ? JSON.stringify(mergedData.corporate_style) : null, // $28
//       'published',                                               // $29
//       mergedData.subscription_plan_id || null                   // $30
//     ];

//     const electionResult = await client.query(insertElectionQuery, electionValues);
//     const publishedElection = electionResult.rows[0];

//     // 2. INSERT CATEGORY MAPPING (if category_id exists)
//     if (mergedData.category_id) {
//       const categoryMappingQuery = `
//         INSERT INTO votteryy_election_category_mapping (election_id, category_id)
//         VALUES ($1, $2)
//         ON CONFLICT (election_id, category_id) DO NOTHING
//       `;
//       await client.query(categoryMappingQuery, [publishedElection.id, mergedData.category_id]);
//     }

//     // 3. INSERT REGIONAL PRICING (if applicable)
//     if (regional_pricing && regional_pricing.length > 0) {
//       for (const region of regional_pricing) {
//         const regionalPricingQuery = `
//           INSERT INTO votteryy_election_regional_pricing (
//             election_id, region_code, region_name, participation_fee, 
//             currency, processing_fee_percentage
//           )
//           VALUES ($1, $2, $3, $4, $5, $6)
//           ON CONFLICT (election_id, region_code) DO UPDATE
//           SET participation_fee = EXCLUDED.participation_fee,
//               currency = EXCLUDED.currency,
//               processing_fee_percentage = EXCLUDED.processing_fee_percentage
//         `;
        
//         await client.query(regionalPricingQuery, [
//           publishedElection.id,
//           region.region_code,
//           region.region_name,
//           parseFloat(region.participation_fee),
//           region.currency || 'USD',
//           parseFloat(mergedData.processing_fee_percentage) || 0
//         ]);
//       }
//     }

//     // 4. INSERT QUESTIONS AND OPTIONS
//     if (questions && questions.length > 0) {
//       for (const question of questions) {
//         // Insert question
//         const questionInsertQuery = `
//           INSERT INTO votteryy_election_questions (
//             election_id, question_text, question_type, 
//             question_order, is_required, max_selections
//           )
//           VALUES ($1, $2, $3, $4, $5, $6)
//           RETURNING id
//         `;
        
//         const questionResult = await client.query(questionInsertQuery, [
//           publishedElection.id,
//           question.question_text,
//           question.question_type,
//           question.question_order,
//           question.is_required !== undefined ? question.is_required : true,
//           question.max_selections || 1
//         ]);
        
//         const questionId = questionResult.rows[0].id;
        
//         // Insert options for this question (if they exist)
//         if (question.options && question.options.length > 0) {
//           for (const option of question.options) {
//             const optionInsertQuery = `
//               INSERT INTO votteryy_election_options (
//                 question_id, option_text, option_order
//               )
//               VALUES ($1, $2, $3)
//             `;
            
//             await client.query(optionInsertQuery, [
//               questionId,
//               option.option_text,
//               option.option_order
//             ]);
//           }
//         }
//       }
//     }

//     // 5. INSERT LOTTERY CONFIGURATION (if enabled)
//     if (lottery_config && lottery_config.is_lotterized) {
//       const lotterySettingsQuery = `
//         INSERT INTO votteryy_election_settings (
//           election_id, setting_key, setting_value
//         )
//         VALUES ($1, $2, $3)
//         ON CONFLICT (election_id, setting_key) DO UPDATE
//         SET setting_value = EXCLUDED.setting_value,
//             updated_at = CURRENT_TIMESTAMP
//       `;
      
//       await client.query(lotterySettingsQuery, [
//         publishedElection.id,
//         'lottery_config',
//         JSON.stringify(lottery_config)
//       ]);
//     }

//     // 6. DELETE DRAFT
//     await client.query('DELETE FROM votteryy_election_drafts WHERE id = $1', [draftId]);

//     await client.query('COMMIT');

//     // Generate shareable URL
//     const shareableUrl = generateShareableUrl(publishedElection.slug, process.env.FRONTEND_URL);
//     publishedElection.shareable_url = shareableUrl;

//     return publishedElection;

//   } catch (error) {
//     await client.query('ROLLBACK');
//     console.error('Publish election error:', error);
//     throw error;
//   } finally {
//     client.release();
//   }
// }

//   /**
//    * Create election directly (without draft)
//    */
//   async createElection(userId, creatorType, electionData) {
//     const client = await pool.connect();
    
//     try {
//       await client.query('BEGIN');

//       // Validate dates
//       const dateValidation = validateDates(electionData.start_date, electionData.end_date);
//       if (!dateValidation.valid) {
//         throw new Error(dateValidation.message);
//       }

//       // Generate slug
//       const slug = generateUniqueSlug(electionData.title);

//       // Check if slug exists
//       const slugCheck = await client.query(
//         'SELECT id FROM votteryyy_elections WHERE slug = $1',
//         [slug]
//       );

//       if (slugCheck.rows.length > 0) {
//         throw new Error('A similar election already exists');
//       }

//       const insertQuery = `
//         INSERT INTO votteryyy_elections (
//           creator_id, creator_type, organization_id, title, description, slug,
//           topic_image_url, topic_video_url, logo_url,
//           start_date, end_date, timezone,
//           voting_type, voting_body_content,
//           permission_type, allowed_countries,
//           is_free, pricing_type, general_participation_fee, processing_fee_percentage,
//           biometric_required, authentication_methods,
//           custom_url, corporate_style,
//           status, subscription_plan_id
//         )
//         VALUES (
//           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
//           $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
//         )
//         RETURNING *
//       `;

//       const values = [
//         userId,
//         creatorType,
//         electionData.organization_id || null,
//         electionData.title,
//         electionData.description || null,
//         slug,
//         electionData.topic_image_url || null,
//         electionData.topic_video_url || null,
//         electionData.logo_url || null,
//         electionData.start_date,
//         electionData.end_date,
//         electionData.timezone || 'UTC',
//         electionData.voting_type,
//         electionData.voting_body_content || null,
//         electionData.permission_type || 'public',
//         electionData.allowed_countries || null,
//         electionData.is_free !== false,
//         electionData.pricing_type || 'free',
//         electionData.general_participation_fee || 0,
//         electionData.processing_fee_percentage || 0,
//         electionData.biometric_required || false,
//         electionData.authentication_methods || ['passkey'],
//         electionData.custom_url || null,
//         electionData.corporate_style ? JSON.stringify(electionData.corporate_style) : null,
//         electionData.status || 'draft',
//         electionData.subscription_plan_id || null
//       ];

//       const result = await client.query(insertQuery, values);
//       const election = result.rows[0];

//       // Insert regional pricing if applicable
//       if (electionData.pricing_type === 'regional_fee' && electionData.regional_pricing) {
//         for (const region of electionData.regional_pricing) {
//           await client.query(`
//             INSERT INTO votteryy_election_regional_pricing (
//               election_id, region_code, region_name, participation_fee, currency, processing_fee_percentage
//             )
//             VALUES ($1, $2, $3, $4, $5, $6)
//           `, [
//             election.id,
//             region.region_code,
//             region.region_name,
//             region.participation_fee,
//             region.currency || 'USD',
//             electionData.processing_fee_percentage || 0
//           ]);
//         }
//       }

//       await client.query('COMMIT');

//       // Generate shareable URL
//       const shareableUrl = generateShareableUrl(election.slug, process.env.FRONTEND_URL);
//       election.shareable_url = shareableUrl;

//       return election;

//     } catch (error) {
//       await client.query('ROLLBACK');
//       throw error;
//     } finally {
//       client.release();
//     }
//   }

//   /**
//    * Get election by ID with full details
//    */
//   async getElectionById(electionId) {
//     const client = await pool.connect();
    
//     try {
//       // 1. Get election with regional pricing
//       const electionQuery = `
//         SELECT 
//           e.*,
//           json_agg(
//             DISTINCT jsonb_build_object(
//               'region_code', erp.region_code,
//               'region_name', erp.region_name,
//               'participation_fee', erp.participation_fee,
//               'currency', erp.currency
//             )
//           ) FILTER (WHERE erp.id IS NOT NULL) as regional_pricing
//         FROM votteryyy_elections e
//         LEFT JOIN votteryy_election_regional_pricing erp ON e.id = erp.election_id
//         WHERE e.id = $1
//         GROUP BY e.id
//       `;

//       const electionResult = await client.query(electionQuery, [electionId]);
      
//       if (electionResult.rows.length === 0) return null;

//       const election = electionResult.rows[0];

//       // 2. Get questions with options
//       const questionsQuery = `
//         SELECT 
//           q.*,
//           json_agg(
//             jsonb_build_object(
//               'id', o.id,
//               'option_text', o.option_text,
//               'option_image_url', o.option_image_url,
//               'option_order', o.option_order
//             ) ORDER BY o.option_order
//           ) FILTER (WHERE o.id IS NOT NULL) as options
//         FROM votteryy_election_questions q
//         LEFT JOIN votteryy_election_options o ON q.id = o.question_id
//         WHERE q.election_id = $1
//         GROUP BY q.id
//         ORDER BY q.question_order
//       `;

//       const questionsResult = await client.query(questionsQuery, [election.id]);
//       election.questions = questionsResult.rows;

//       // 3. Get lottery config from settings
//       const lotteryQuery = `
//         SELECT setting_value
//         FROM votteryy_election_settings
//         WHERE election_id = $1 AND setting_key = 'lottery_config'
//       `;

//       const lotteryResult = await client.query(lotteryQuery, [election.id]);
      
//       if (lotteryResult.rows.length > 0) {
//         election.lottery_config = JSON.parse(lotteryResult.rows[0].setting_value);
//       } else {
//         election.lottery_config = null;
//       }

//       // 4. Generate shareable URL
//       election.shareable_url = generateShareableUrl(election.slug, process.env.FRONTEND_URL);

//       return election;

//     } finally {
//       client.release();
//     }
//   }

//   /**
//    * Get election by slug with full details (questions, options, lottery)
//    */
//   async getElectionBySlug(slug) {
//     const client = await pool.connect();
    
//     try {
//       // 1. Get election with regional pricing
//       const electionQuery = `
//         SELECT 
//           e.*,
//           json_agg(
//             DISTINCT jsonb_build_object(
//               'region_code', erp.region_code,
//               'region_name', erp.region_name,
//               'participation_fee', erp.participation_fee,
//               'currency', erp.currency
//             )
//           ) FILTER (WHERE erp.id IS NOT NULL) as regional_pricing
//         FROM votteryyy_elections e
//         LEFT JOIN votteryy_election_regional_pricing erp ON e.id = erp.election_id
//         WHERE e.slug = $1
//         GROUP BY e.id
//       `;

//       const electionResult = await client.query(electionQuery, [slug]);
      
//       if (electionResult.rows.length === 0) return null;

//       const election = electionResult.rows[0];

//       // 2. Get questions with options
//       const questionsQuery = `
//         SELECT 
//           q.*,
//           json_agg(
//             jsonb_build_object(
//               'id', o.id,
//               'option_text', o.option_text,
//               'option_image_url', o.option_image_url,
//               'option_order', o.option_order
//             ) ORDER BY o.option_order
//           ) FILTER (WHERE o.id IS NOT NULL) as options
//         FROM votteryy_election_questions q
//         LEFT JOIN votteryy_election_options o ON q.id = o.question_id
//         WHERE q.election_id = $1
//         GROUP BY q.id
//         ORDER BY q.question_order
//       `;

//       const questionsResult = await client.query(questionsQuery, [election.id]);
//       election.questions = questionsResult.rows;

//       // 3. Get lottery config from settings
//       const lotteryQuery = `
//         SELECT setting_value
//         FROM votteryy_election_settings
//         WHERE election_id = $1 AND setting_key = 'lottery_config'
//       `;

//       const lotteryResult = await client.query(lotteryQuery, [election.id]);
      
//       if (lotteryResult.rows.length > 0) {
//         election.lottery_config = JSON.parse(lotteryResult.rows[0].setting_value);
//       } else {
//         election.lottery_config = null;
//       }

//       // 4. Generate shareable URL
//       election.shareable_url = generateShareableUrl(election.slug, process.env.FRONTEND_URL);

//       return election;

//     } finally {
//       client.release();
//     }
//   }

//   /**
//    * ✅ UPDATED: Get user's elections WITH regional_pricing, lottery_config, questions
//    */
//   async getUserElections(userId, filters = {}) {
//     const { status, page = 1, limit = 10, includeFullData = false } = filters;
//     const offset = (page - 1) * limit;

//     // ✅ NEW: If includeFullData is true, get complete data with regional_pricing, lottery_config, questions
//     if (includeFullData) {
//       const client = await pool.connect();
      
//       try {
//         let whereClause = 'e.creator_id = $1';
//         const params = [userId];
//         let paramCount = 1;

//         if (status) {
//           paramCount++;
//           whereClause += ` AND e.status = $${paramCount}`;
//           params.push(status);
//         }

//         // Query with regional_pricing, lottery_config, and questions
//         const query = `
//           SELECT 
//             e.*,
//             COUNT(*) OVER() as total_count,
            
//             -- ✅ Regional pricing as JSON array
//             COALESCE(
//               (
//                 SELECT json_agg(
//                   jsonb_build_object(
//                     'id', erp.id,
//                     'region_code', erp.region_code,
//                     'region_name', erp.region_name,
//                     'participation_fee', erp.participation_fee,
//                     'currency', erp.currency
//                   )
//                 )
//                 FROM votteryy_election_regional_pricing erp
//                 WHERE erp.election_id = e.id
//               ),
//               '[]'::json
//             ) as regional_pricing,
            
//             -- ✅ Lottery config as JSON object
//             (
//               SELECT es.setting_value::json
//               FROM votteryy_election_settings es
//               WHERE es.election_id = e.id AND es.setting_key = 'lottery_config'
//             ) as lottery_config,
            
//             -- ✅ Questions with options as JSON array
//             COALESCE(
//               (
//                 SELECT json_agg(
//                   jsonb_build_object(
//                     'id', q.id,
//                     'question_text', q.question_text,
//                     'question_type', q.question_type,
//                     'question_order', q.question_order,
//                     'question_image_url', q.question_image_url,
//                     'is_required', q.is_required,
//                     'max_selections', q.max_selections,
//                     'options', (
//                       SELECT json_agg(
//                         jsonb_build_object(
//                           'id', o.id,
//                           'option_text', o.option_text,
//                           'option_image_url', o.option_image_url,
//                           'option_order', o.option_order
//                         ) ORDER BY o.option_order
//                       )
//                       FROM votteryy_election_options o
//                       WHERE o.question_id = q.id
//                     )
//                   ) ORDER BY q.question_order
//                 )
//                 FROM votteryy_election_questions q
//                 WHERE q.election_id = e.id
//               ),
//               '[]'::json
//             ) as questions
            
//           FROM votteryyy_elections e
//           WHERE ${whereClause}
//           ORDER BY e.created_at DESC
//           LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
//         `;

//         params.push(limit, offset);

//         const result = await client.query(query, params);

//         console.log('✅ [Service] getUserElections with full data:', {
//           count: result.rows.length,
//           firstHasRegionalPricing: result.rows[0] ? !!result.rows[0].regional_pricing : false,
//           firstHasLottery: result.rows[0] ? !!result.rows[0].lottery_config : false,
//           firstHasQuestions: result.rows[0] ? !!result.rows[0].questions : false
//         });

//         return {
//           elections: result.rows,
//           total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
//           page: parseInt(page),
//           limit: parseInt(limit)
//         };

//       } finally {
//         client.release();
//       }
//     }

//     // ✅ OLD: Simple query without full data (backward compatibility)
//     let query = `
//       SELECT 
//         e.*,
//         COUNT(*) OVER() as total_count
//       FROM votteryyy_elections e
//       WHERE e.creator_id = $1
//     `;

//     const params = [userId];
//     let paramCount = 1;

//     if (status) {
//       paramCount++;
//       query += ` AND e.status = $${paramCount}`;
//       params.push(status);
//     }

//     query += ` ORDER BY e.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
//     params.push(limit, offset);

//     const result = await pool.query(query, params);

//     return {
//       elections: result.rows,
//       total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
//       page: parseInt(page),
//       limit: parseInt(limit)
//     };
//   }

//   /**
//    * Update election
//    */
//   async updateElection(electionId, userId, updateData) {
//     const election = await this.getElectionById(electionId);
    
//     if (!election || election.creator_id !== userId) {
//       return null;
//     }

//     const fields = [];
//     const values = [];
//     let paramCount = 0;

//     const allowedFields = [
//       'title', 'description', 'topic_image_url', 'topic_video_url', 'logo_url',
//       'start_date', 'end_date', 'timezone', 'voting_type', 'voting_body_content',
//       'permission_type', 'allowed_countries', 'is_free', 'pricing_type',
//       'general_participation_fee', 'processing_fee_percentage', 'biometric_required',
//       'authentication_methods', 'custom_url', 'corporate_style', 'status'
//     ];

//     for (const field of allowedFields) {
//       if (updateData[field] !== undefined) {
//         paramCount++;
//         fields.push(`${field} = $${paramCount}`);
//         values.push(updateData[field]);
//       }
//     }

//     if (fields.length === 0) {
//       return election;
//     }

//     fields.push(`updated_at = CURRENT_TIMESTAMP`);
//     values.push(electionId, userId);

//     const query = `
//       UPDATE votteryyy_elections
//       SET ${fields.join(', ')}
//       WHERE id = $${paramCount + 1} AND creator_id = $${paramCount + 2}
//       RETURNING *
//     `;

//     const result = await pool.query(query, values);
//     return result.rows[0];
//   }

//   /**
//    * Delete election
//    */
//   async deleteElection(electionId, userId) {
//     const query = `
//       DELETE FROM votteryyy_elections
//       WHERE id = $1 AND creator_id = $2
//       RETURNING *
//     `;

//     const result = await pool.query(query, [electionId, userId]);
//     return result.rows[0] || null;
//   }

//   /**
//    * Get user's drafts
//    */
//   async getUserDrafts(userId) {
//     const query = `
//       SELECT * FROM votteryy_election_drafts
//       WHERE creator_id = $1
//       ORDER BY updated_at DESC
//     `;

//     const result = await pool.query(query, [userId]);
//     return result.rows;
//   }

//   /**
//    * Delete draft
//    */
//   async deleteDraft(draftId, userId) {
//     const query = `
//       DELETE FROM votteryy_election_drafts
//       WHERE id = $1 AND creator_id = $2
//       RETURNING *
//     `;

//     const result = await pool.query(query, [draftId, userId]);
//     return result.rows[0] || null;
//   }

//   /**
//    * ✅ UPDATED: Get public elections WITH regional_pricing, lottery_config
//    */
//   async getPublicElections(filters = {}) {
//     const { page = 1, limit = 10, status = 'published', includeFullData = false } = filters;
//     const offset = (page - 1) * limit;

//     // ✅ NEW: If includeFullData is true, get complete data
//     if (includeFullData) {
//       const client = await pool.connect();
      
//       try {
//         const query = `
//           SELECT 
//             e.*,
//             COUNT(*) OVER() as total_count,
            
//             -- ✅ Regional pricing
//             COALESCE(
//               (
//                 SELECT json_agg(
//                   jsonb_build_object(
//                     'id', erp.id,
//                     'region_code', erp.region_code,
//                     'region_name', erp.region_name,
//                     'participation_fee', erp.participation_fee,
//                     'currency', erp.currency
//                   )
//                 )
//                 FROM votteryy_election_regional_pricing erp
//                 WHERE erp.election_id = e.id
//               ),
//               '[]'::json
//             ) as regional_pricing,
            
//             -- ✅ Lottery config
//             (
//               SELECT es.setting_value::json
//               FROM votteryy_election_settings es
//               WHERE es.election_id = e.id AND es.setting_key = 'lottery_config'
//             ) as lottery_config
            
//           FROM votteryyy_elections e
//           WHERE e.status = $1 AND e.permission_type = 'public'
//           ORDER BY e.created_at DESC
//           LIMIT $2 OFFSET $3
//         `;

//         const result = await client.query(query, [status, limit, offset]);

//         return {
//           elections: result.rows,
//           total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
//           page: parseInt(page),
//           limit: parseInt(limit)
//         };

//       } finally {
//         client.release();
//       }
//     }

//     // ✅ OLD: Simple query without full data
//     const query = `
//       SELECT 
//         e.*,
//         COUNT(*) OVER() as total_count
//       FROM votteryyy_elections e
//       WHERE e.status = $1 AND e.permission_type = 'public'
//       ORDER BY e.created_at DESC
//       LIMIT $2 OFFSET $3
//     `;

//     const result = await pool.query(query, [status, limit, offset]);

//     return {
//       elections: result.rows,
//       total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
//       page: parseInt(page),
//       limit: parseInt(limit)
//     };
//   }

//   /**
//    * ✅ UPDATED: Get ALL elections WITH regional_pricing, lottery_config, questions
//    */
//   async getAllElections(filters = {}) {
//     const { page = 1, limit = 50, status, includeFullData = false } = filters;
//     const offset = (page - 1) * limit;

//     // ✅ NEW: If includeFullData is true, get complete data with regional_pricing, lottery_config, questions
//     if (includeFullData) {
//       const client = await pool.connect();
      
//       try {
//         let whereClause = '1=1';
//         const params = [];
//         let paramCount = 0;

//         // Optional status filter
//         if (status && status !== 'all') {
//           paramCount++;
//           whereClause += ` AND e.status = $${paramCount}`;
//           params.push(status);
//         }

//         // Query with regional_pricing, lottery_config, and questions
//         const query = `
//           SELECT 
//             e.*,
//             COUNT(*) OVER() as total_count,
            
//             -- ✅ Regional pricing as JSON array
//             COALESCE(
//               (
//                 SELECT json_agg(
//                   jsonb_build_object(
//                     'id', erp.id,
//                     'region_code', erp.region_code,
//                     'region_name', erp.region_name,
//                     'participation_fee', erp.participation_fee,
//                     'currency', erp.currency
//                   )
//                 )
//                 FROM votteryy_election_regional_pricing erp
//                 WHERE erp.election_id = e.id
//               ),
//               '[]'::json
//             ) as regional_pricing,
            
//             -- ✅ Lottery config as JSON object
//             (
//               SELECT es.setting_value::json
//               FROM votteryy_election_settings es
//               WHERE es.election_id = e.id AND es.setting_key = 'lottery_config'
//             ) as lottery_config,
            
//             -- ✅ Questions with options as JSON array
//             COALESCE(
//               (
//                 SELECT json_agg(
//                   jsonb_build_object(
//                     'id', q.id,
//                     'question_text', q.question_text,
//                     'question_type', q.question_type,
//                     'question_order', q.question_order,
//                     'question_image_url', q.question_image_url,
//                     'is_required', q.is_required,
//                     'max_selections', q.max_selections,
//                     'options', (
//                       SELECT json_agg(
//                         jsonb_build_object(
//                           'id', o.id,
//                           'option_text', o.option_text,
//                           'option_image_url', o.option_image_url,
//                           'option_order', o.option_order
//                         ) ORDER BY o.option_order
//                       )
//                       FROM votteryy_election_options o
//                       WHERE o.question_id = q.id
//                     )
//                   ) ORDER BY q.question_order
//                 )
//                 FROM votteryy_election_questions q
//                 WHERE q.election_id = e.id
//               ),
//               '[]'::json
//             ) as questions
            
//           FROM votteryyy_elections e
//           WHERE ${whereClause}
//           ORDER BY e.created_at DESC
//           LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
//         `;

//         params.push(limit, offset);

//         const result = await client.query(query, params);

//         console.log('✅ [Service] getAllElections with full data:', {
//           count: result.rows.length,
//           firstHasRegionalPricing: result.rows[0] ? !!result.rows[0].regional_pricing : false,
//           firstHasLottery: result.rows[0] ? !!result.rows[0].lottery_config : false,
//           firstHasQuestions: result.rows[0] ? !!result.rows[0].questions : false
//         });

//         return {
//           elections: result.rows,
//           total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
//           page: parseInt(page),
//           limit: parseInt(limit)
//         };

//       } finally {
//         client.release();
//       }
//     }

//     // ✅ OLD: Simple query without full data (backward compatibility)
//     let query = `
//       SELECT 
//         e.*,
//         COUNT(*) OVER() as total_count
//       FROM votteryyy_elections e
//       WHERE 1=1
//     `;

//     const params = [];
//     let paramCount = 0;

//     // Optional status filter
//     if (status && status !== 'all') {
//       paramCount++;
//       query += ` AND e.status = $${paramCount}`;
//       params.push(status);
//     }

//     query += ` ORDER BY e.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
//     params.push(limit, offset);

//     const result = await pool.query(query, params);

//     return {
//       elections: result.rows,
//       total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
//       page: parseInt(page),
//       limit: parseInt(limit)
//     };
//   }
// }

// export default new ElectionService();
// import pool from '../config/database.js';
// import { generateUniqueSlug, validateDates, generateShareableUrl } from '../utils/helpers.js';
// import { ELECTION_STATUS, CREATOR_TYPES } from '../config/constants.js';

// class ElectionService {
//   /**
//    * Create a draft election (basic info only)
//    */
//   async createDraft(userId, creatorType, draftData) {
//     const { title, description, organization_id } = draftData;

//     const query = `
//       INSERT INTO votteryy_election_drafts (
//         creator_id, creator_type, organization_id, title, description, draft_data
//       )
//       VALUES ($1, $2, $3, $4, $5, $6)
//       RETURNING *
//     `;

//     const values = [
//       userId,
//       creatorType,
//       organization_id || null,
//       title,
//       description || null,
//       JSON.stringify(draftData)
//     ];

//     const result = await pool.query(query, values);
//     return result.rows[0];
//   }

//   /**
//    * Get draft by ID
//    */
//   async getDraft(draftId, userId) {
//     const query = `
//       SELECT * FROM votteryy_election_drafts
//       WHERE id = $1 AND creator_id = $2
//     `;

//     const result = await pool.query(query, [draftId, userId]);
//     return result.rows[0] || null;
//   }

//   /**
//    * Update draft
//    */
//   async updateDraft(draftId, userId, updateData) {
//     const draft = await this.getDraft(draftId, userId);
//     if (!draft) return null;

//     // Merge existing draft_data with new data
//     const existingData = draft.draft_data || {};
//     const mergedData = { ...existingData, ...updateData };

//     const query = `
//       UPDATE votteryy_election_drafts
//       SET 
//         title = COALESCE($1, title),
//         description = COALESCE($2, description),
//         draft_data = $3,
//         updated_at = CURRENT_TIMESTAMP
//       WHERE id = $4 AND creator_id = $5
//       RETURNING *
//     `;

//     const values = [
//       updateData.title || null,
//       updateData.description || null,
//       JSON.stringify(mergedData),
//       draftId,
//       userId
//     ];

//     const result = await pool.query(query, values);
//     return result.rows[0];
//   }

//   /**
//  * Publish election from draft
//  */
// async publishElectionFromDraft(draftId, userId, electionData) {
//   const client = await pool.connect();
  
//   try {
//     await client.query('BEGIN');

//     // Get draft
//     const draftQuery = 'SELECT * FROM votteryy_election_drafts WHERE id = $1 AND creator_id = $2';
//     const draftResult = await client.query(draftQuery, [draftId, userId]);
    
//     if (draftResult.rows.length === 0) {
//       throw new Error('Draft not found');
//     }

//     const draft = draftResult.rows[0];
//     const draftData = draft.draft_data || {};

//     // Extract structured data from request
//     const { election, questions, regional_pricing, lottery_config } = electionData;
    
//     // Merge draft data with election data
//     const mergedData = { ...draftData, ...election };

//     // Validate dates
//     const startDateTime = `${mergedData.start_date} ${mergedData.start_time || '00:00:00'}`;
//     const endDateTime = `${mergedData.end_date} ${mergedData.end_time || '23:59:59'}`;
    
//     const dateValidation = validateDates(startDateTime, endDateTime);
//     if (!dateValidation.valid) {
//       throw new Error(dateValidation.message);
//     }

//     // Use provided slug or generate new one
//     const slug = mergedData.slug || generateUniqueSlug(mergedData.title || draft.title);

//     // Check if slug exists
//     const slugCheck = await client.query(
//       'SELECT id FROM votteryyy_elections WHERE slug = $1',
//       [slug]
//     );

//     if (slugCheck.rows.length > 0) {
//       throw new Error('Election slug already exists');
//     }

//     // 1. INSERT ELECTION
//     const insertElectionQuery = `
//       INSERT INTO votteryyy_elections (
//         creator_id, creator_type, organization_id, title, description, slug,
//         topic_image_url, topic_video_url, logo_url,
//         start_date, start_time, end_date, end_time, timezone,
//         voting_type, voting_body_content,
//         permission_type, allowed_countries,
//         is_free, pricing_type, general_participation_fee, processing_fee_percentage,
//         biometric_required, authentication_methods,
//         show_live_results, vote_editing_allowed,
//         custom_url, corporate_style,
//         status, published_at, subscription_plan_id
//       )
//       VALUES (
//         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
//         $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, CURRENT_TIMESTAMP, $30
//       )
//       RETURNING *
//     `;

//     const electionValues = [
//       userId,                                                    // $1
//       draft.creator_type,                                        // $2
//       draft.organization_id,                                     // $3
//       mergedData.title || draft.title,                          // $4
//       mergedData.description || draft.description,              // $5
//       slug,                                                      // $6
//       mergedData.topic_image_url || null,                       // $7
//       mergedData.topic_video_url || null,                       // $8
//       mergedData.logo_url || null,                              // $9
//       startDateTime,                                             // $10
//       mergedData.start_time || '00:00:00',                      // $11
//       endDateTime,                                               // $12
//       mergedData.end_time || '23:59:59',                        // $13
//       mergedData.timezone || 'UTC',                             // $14
//       mergedData.voting_type || 'plurality',                    // $15
//       mergedData.voting_body_content || null,                   // $16
//       mergedData.permission_type || 'public',                   // $17
//       mergedData.allowed_countries || null,                     // $18
//       mergedData.pricing_type === 'free',                       // $19
//       mergedData.pricing_type || 'free',                        // $20
//       parseFloat(mergedData.general_participation_fee) || 0,    // $21
//       parseFloat(mergedData.processing_fee_percentage) || 0,    // $22
//       mergedData.biometric_required || false,                   // $23
//       mergedData.authentication_methods || ['passkey'],         // $24
//       mergedData.show_live_results || false,                    // $25
//       mergedData.vote_editing_allowed || false,                 // $26
//       mergedData.custom_url || null,                            // $27
//       mergedData.corporate_style ? JSON.stringify(mergedData.corporate_style) : null, // $28
//       'published',                                               // $29
//       mergedData.subscription_plan_id || null                   // $30
//     ];

//     const electionResult = await client.query(insertElectionQuery, electionValues);
//     const publishedElection = electionResult.rows[0];

//     // 2. INSERT CATEGORY MAPPING (if category_id exists)
//     if (mergedData.category_id) {
//       const categoryMappingQuery = `
//         INSERT INTO votteryy_election_category_mapping (election_id, category_id)
//         VALUES ($1, $2)
//         ON CONFLICT (election_id, category_id) DO NOTHING
//       `;
//       await client.query(categoryMappingQuery, [publishedElection.id, mergedData.category_id]);
//     }

//     // 3. INSERT REGIONAL PRICING (if applicable)
//     if (regional_pricing && regional_pricing.length > 0) {
//       for (const region of regional_pricing) {
//         const regionalPricingQuery = `
//           INSERT INTO votteryy_election_regional_pricing (
//             election_id, region_code, region_name, participation_fee, 
//             currency, processing_fee_percentage
//           )
//           VALUES ($1, $2, $3, $4, $5, $6)
//           ON CONFLICT (election_id, region_code) DO UPDATE
//           SET participation_fee = EXCLUDED.participation_fee,
//               currency = EXCLUDED.currency,
//               processing_fee_percentage = EXCLUDED.processing_fee_percentage
//         `;
        
//         await client.query(regionalPricingQuery, [
//           publishedElection.id,
//           region.region_code,
//           region.region_name,
//           parseFloat(region.participation_fee),
//           region.currency || 'USD',
//           parseFloat(mergedData.processing_fee_percentage) || 0
//         ]);
//       }
//     }

//     // 4. INSERT QUESTIONS AND OPTIONS
//     if (questions && questions.length > 0) {
//       for (const question of questions) {
//         // Insert question
//         const questionInsertQuery = `
//           INSERT INTO votteryy_election_questions (
//             election_id, question_text, question_type, 
//             question_order, is_required, max_selections
//           )
//           VALUES ($1, $2, $3, $4, $5, $6)
//           RETURNING id
//         `;
        
//         const questionResult = await client.query(questionInsertQuery, [
//           publishedElection.id,
//           question.question_text,
//           question.question_type,
//           question.question_order,
//           question.is_required !== undefined ? question.is_required : true,
//           question.max_selections || 1
//         ]);
        
//         const questionId = questionResult.rows[0].id;
        
//         // Insert options for this question (if they exist)
//         if (question.options && question.options.length > 0) {
//           for (const option of question.options) {
//             const optionInsertQuery = `
//               INSERT INTO votteryy_election_options (
//                 question_id, option_text, option_order
//               )
//               VALUES ($1, $2, $3)
//             `;
            
//             await client.query(optionInsertQuery, [
//               questionId,
//               option.option_text,
//               option.option_order
//             ]);
//           }
//         }
//       }
//     }

//     // 5. INSERT LOTTERY CONFIGURATION (if enabled)
//     if (lottery_config && lottery_config.is_lotterized) {
//       const lotterySettingsQuery = `
//         INSERT INTO votteryy_election_settings (
//           election_id, setting_key, setting_value
//         )
//         VALUES ($1, $2, $3)
//         ON CONFLICT (election_id, setting_key) DO UPDATE
//         SET setting_value = EXCLUDED.setting_value,
//             updated_at = CURRENT_TIMESTAMP
//       `;
      
//       await client.query(lotterySettingsQuery, [
//         publishedElection.id,
//         'lottery_config',
//         JSON.stringify(lottery_config)
//       ]);
//     }

//     // 6. DELETE DRAFT
//     await client.query('DELETE FROM votteryy_election_drafts WHERE id = $1', [draftId]);

//     await client.query('COMMIT');

//     // Generate shareable URL
//     const shareableUrl = generateShareableUrl(publishedElection.slug, process.env.FRONTEND_URL);
//     publishedElection.shareable_url = shareableUrl;

//     return publishedElection;

//   } catch (error) {
//     await client.query('ROLLBACK');
//     console.error('Publish election error:', error);
//     throw error;
//   } finally {
//     client.release();
//   }
// }

//   /**
//    * Create election directly (without draft)
//    */
//   async createElection(userId, creatorType, electionData) {
//     const client = await pool.connect();
    
//     try {
//       await client.query('BEGIN');

//       // Validate dates
//       const dateValidation = validateDates(electionData.start_date, electionData.end_date);
//       if (!dateValidation.valid) {
//         throw new Error(dateValidation.message);
//       }

//       // Generate slug
//       const slug = generateUniqueSlug(electionData.title);

//       // Check if slug exists
//       const slugCheck = await client.query(
//         'SELECT id FROM votteryyy_elections WHERE slug = $1',
//         [slug]
//       );

//       if (slugCheck.rows.length > 0) {
//         throw new Error('A similar election already exists');
//       }

//       const insertQuery = `
//         INSERT INTO votteryyy_elections (
//           creator_id, creator_type, organization_id, title, description, slug,
//           topic_image_url, topic_video_url, logo_url,
//           start_date, end_date, timezone,
//           voting_type, voting_body_content,
//           permission_type, allowed_countries,
//           is_free, pricing_type, general_participation_fee, processing_fee_percentage,
//           biometric_required, authentication_methods,
//           custom_url, corporate_style,
//           status, subscription_plan_id
//         )
//         VALUES (
//           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
//           $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
//         )
//         RETURNING *
//       `;

//       const values = [
//         userId,
//         creatorType,
//         electionData.organization_id || null,
//         electionData.title,
//         electionData.description || null,
//         slug,
//         electionData.topic_image_url || null,
//         electionData.topic_video_url || null,
//         electionData.logo_url || null,
//         electionData.start_date,
//         electionData.end_date,
//         electionData.timezone || 'UTC',
//         electionData.voting_type,
//         electionData.voting_body_content || null,
//         electionData.permission_type || 'public',
//         electionData.allowed_countries || null,
//         electionData.is_free !== false,
//         electionData.pricing_type || 'free',
//         electionData.general_participation_fee || 0,
//         electionData.processing_fee_percentage || 0,
//         electionData.biometric_required || false,
//         electionData.authentication_methods || ['passkey'],
//         electionData.custom_url || null,
//         electionData.corporate_style ? JSON.stringify(electionData.corporate_style) : null,
//         electionData.status || 'draft',
//         electionData.subscription_plan_id || null
//       ];

//       const result = await client.query(insertQuery, values);
//       const election = result.rows[0];

//       // Insert regional pricing if applicable
//       if (electionData.pricing_type === 'regional_fee' && electionData.regional_pricing) {
//         for (const region of electionData.regional_pricing) {
//           await client.query(`
//             INSERT INTO votteryy_election_regional_pricing (
//               election_id, region_code, region_name, participation_fee, currency, processing_fee_percentage
//             )
//             VALUES ($1, $2, $3, $4, $5, $6)
//           `, [
//             election.id,
//             region.region_code,
//             region.region_name,
//             region.participation_fee,
//             region.currency || 'USD',
//             electionData.processing_fee_percentage || 0
//           ]);
//         }
//       }

//       await client.query('COMMIT');

//       // Generate shareable URL
//       const shareableUrl = generateShareableUrl(election.slug, process.env.FRONTEND_URL);
//       election.shareable_url = shareableUrl;

//       return election;

//     } catch (error) {
//       await client.query('ROLLBACK');
//       throw error;
//     } finally {
//       client.release();
//     }
//   }

//   /**
//    * Get election by ID with full details
//    */
//   async getElectionById(electionId) {
//     const client = await pool.connect();
    
//     try {
//       // 1. Get election with regional pricing
//       const electionQuery = `
//         SELECT 
//           e.*,
//           json_agg(
//             DISTINCT jsonb_build_object(
//               'region_code', erp.region_code,
//               'region_name', erp.region_name,
//               'participation_fee', erp.participation_fee,
//               'currency', erp.currency
//             )
//           ) FILTER (WHERE erp.id IS NOT NULL) as regional_pricing
//         FROM votteryyy_elections e
//         LEFT JOIN votteryy_election_regional_pricing erp ON e.id = erp.election_id
//         WHERE e.id = $1
//         GROUP BY e.id
//       `;

//       const electionResult = await client.query(electionQuery, [electionId]);
      
//       if (electionResult.rows.length === 0) return null;

//       const election = electionResult.rows[0];

//       // 2. Get questions with options
//       const questionsQuery = `
//         SELECT 
//           q.*,
//           json_agg(
//             jsonb_build_object(
//               'id', o.id,
//               'option_text', o.option_text,
//               'option_image_url', o.option_image_url,
//               'option_order', o.option_order
//             ) ORDER BY o.option_order
//           ) FILTER (WHERE o.id IS NOT NULL) as options
//         FROM votteryy_election_questions q
//         LEFT JOIN votteryy_election_options o ON q.id = o.question_id
//         WHERE q.election_id = $1
//         GROUP BY q.id
//         ORDER BY q.question_order
//       `;

//       const questionsResult = await client.query(questionsQuery, [election.id]);
//       election.questions = questionsResult.rows;

//       // 3. Get lottery config from settings
//       const lotteryQuery = `
//         SELECT setting_value
//         FROM votteryy_election_settings
//         WHERE election_id = $1 AND setting_key = 'lottery_config'
//       `;

//       const lotteryResult = await client.query(lotteryQuery, [election.id]);
      
//       if (lotteryResult.rows.length > 0) {
//         election.lottery_config = JSON.parse(lotteryResult.rows[0].setting_value);
//       } else {
//         election.lottery_config = null;
//       }

//       // 4. Generate shareable URL
//       election.shareable_url = generateShareableUrl(election.slug, process.env.FRONTEND_URL);

//       return election;

//     } finally {
//       client.release();
//     }
//   }

//   /**
//    * Get election by slug with full details (questions, options, lottery)
//    */
//   async getElectionBySlug(slug) {
//     const client = await pool.connect();
    
//     try {
//       // 1. Get election with regional pricing
//       const electionQuery = `
//         SELECT 
//           e.*,
//           json_agg(
//             DISTINCT jsonb_build_object(
//               'region_code', erp.region_code,
//               'region_name', erp.region_name,
//               'participation_fee', erp.participation_fee,
//               'currency', erp.currency
//             )
//           ) FILTER (WHERE erp.id IS NOT NULL) as regional_pricing
//         FROM votteryyy_elections e
//         LEFT JOIN votteryy_election_regional_pricing erp ON e.id = erp.election_id
//         WHERE e.slug = $1
//         GROUP BY e.id
//       `;

//       const electionResult = await client.query(electionQuery, [slug]);
      
//       if (electionResult.rows.length === 0) return null;

//       const election = electionResult.rows[0];

//       // 2. Get questions with options
//       const questionsQuery = `
//         SELECT 
//           q.*,
//           json_agg(
//             jsonb_build_object(
//               'id', o.id,
//               'option_text', o.option_text,
//               'option_image_url', o.option_image_url,
//               'option_order', o.option_order
//             ) ORDER BY o.option_order
//           ) FILTER (WHERE o.id IS NOT NULL) as options
//         FROM votteryy_election_questions q
//         LEFT JOIN votteryy_election_options o ON q.id = o.question_id
//         WHERE q.election_id = $1
//         GROUP BY q.id
//         ORDER BY q.question_order
//       `;

//       const questionsResult = await client.query(questionsQuery, [election.id]);
//       election.questions = questionsResult.rows;

//       // 3. Get lottery config from settings
//       const lotteryQuery = `
//         SELECT setting_value
//         FROM votteryy_election_settings
//         WHERE election_id = $1 AND setting_key = 'lottery_config'
//       `;

//       const lotteryResult = await client.query(lotteryQuery, [election.id]);
      
//       if (lotteryResult.rows.length > 0) {
//         election.lottery_config = JSON.parse(lotteryResult.rows[0].setting_value);
//       } else {
//         election.lottery_config = null;
//       }

//       // 4. Generate shareable URL
//       election.shareable_url = generateShareableUrl(election.slug, process.env.FRONTEND_URL);

//       return election;

//     } finally {
//       client.release();
//     }
//   }

//   /**
//    * Get user's elections
//    */
//   async getUserElections(userId, filters = {}) {
//     const { status, page = 1, limit = 10 } = filters;
//     const offset = (page - 1) * limit;

//     let query = `
//       SELECT 
//         e.*,
//         COUNT(*) OVER() as total_count
//       FROM votteryyy_elections e
//       WHERE e.creator_id = $1
//     `;

//     const params = [userId];
//     let paramCount = 1;

//     if (status) {
//       paramCount++;
//       query += ` AND e.status = $${paramCount}`;
//       params.push(status);
//     }

//     query += ` ORDER BY e.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
//     params.push(limit, offset);

//     const result = await pool.query(query, params);

//     return {
//       elections: result.rows,
//       total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
//       page: parseInt(page),
//       limit: parseInt(limit)
//     };
//   }

//   /**
//    * Update election
//    */
//   async updateElection(electionId, userId, updateData) {
//     const election = await this.getElectionById(electionId);
    
//     if (!election || election.creator_id !== userId) {
//       return null;
//     }

//     const fields = [];
//     const values = [];
//     let paramCount = 0;

//     const allowedFields = [
//       'title', 'description', 'topic_image_url', 'topic_video_url', 'logo_url',
//       'start_date', 'end_date', 'timezone', 'voting_type', 'voting_body_content',
//       'permission_type', 'allowed_countries', 'is_free', 'pricing_type',
//       'general_participation_fee', 'processing_fee_percentage', 'biometric_required',
//       'authentication_methods', 'custom_url', 'corporate_style', 'status'
//     ];

//     for (const field of allowedFields) {
//       if (updateData[field] !== undefined) {
//         paramCount++;
//         fields.push(`${field} = $${paramCount}`);
//         values.push(updateData[field]);
//       }
//     }

//     if (fields.length === 0) {
//       return election;
//     }

//     fields.push(`updated_at = CURRENT_TIMESTAMP`);
//     values.push(electionId, userId);

//     const query = `
//       UPDATE votteryyy_elections
//       SET ${fields.join(', ')}
//       WHERE id = $${paramCount + 1} AND creator_id = $${paramCount + 2}
//       RETURNING *
//     `;

//     const result = await pool.query(query, values);
//     return result.rows[0];
//   }

//   /**
//    * Delete election
//    */
//   async deleteElection(electionId, userId) {
//     const query = `
//       DELETE FROM votteryyy_elections
//       WHERE id = $1 AND creator_id = $2
//       RETURNING *
//     `;

//     const result = await pool.query(query, [electionId, userId]);
//     return result.rows[0] || null;
//   }

//   /**
//    * Get user's drafts
//    */
//   async getUserDrafts(userId) {
//     const query = `
//       SELECT * FROM votteryy_election_drafts
//       WHERE creator_id = $1
//       ORDER BY updated_at DESC
//     `;

//     const result = await pool.query(query, [userId]);
//     return result.rows;
//   }

//   /**
//    * Delete draft
//    */
//   async deleteDraft(draftId, userId) {
//     const query = `
//       DELETE FROM votteryy_election_drafts
//       WHERE id = $1 AND creator_id = $2
//       RETURNING *
//     `;

//     const result = await pool.query(query, [draftId, userId]);
//     return result.rows[0] || null;
//   }

//   /**
//    * Get public elections
//    */
//   async getPublicElections(filters = {}) {
//     const { page = 1, limit = 10, status = 'published' } = filters;
//     const offset = (page - 1) * limit;

//     const query = `
//       SELECT 
//         e.*,
//         COUNT(*) OVER() as total_count
//       FROM votteryyy_elections e
//       WHERE e.status = $1 AND e.permission_type = 'public'
//       ORDER BY e.created_at DESC
//       LIMIT $2 OFFSET $3
//     `;

//     const result = await pool.query(query, [status, limit, offset]);

//     return {
//       elections: result.rows,
//       total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
//       page: parseInt(page),
//       limit: parseInt(limit)
//     };
//   }

//   /**
//    * ✅ NEW: Get ALL elections for any authenticated user (no creator filter, no permission filter)
//    */
//   async getAllElections(filters = {}) {
//     const { page = 1, limit = 50, status } = filters;
//     const offset = (page - 1) * limit;

//     let query = `
//       SELECT 
//         e.*,
//         COUNT(*) OVER() as total_count
//       FROM votteryyy_elections e
//       WHERE 1=1
//     `;

//     const params = [];
//     let paramCount = 0;

//     // Optional status filter
//     if (status && status !== 'all') {
//       paramCount++;
//       query += ` AND e.status = $${paramCount}`;
//       params.push(status);
//     }

//     query += ` ORDER BY e.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
//     params.push(limit, offset);

//     const result = await pool.query(query, params);

//     return {
//       elections: result.rows,
//       total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
//       page: parseInt(page),
//       limit: parseInt(limit)
//     };
//   }
// }

// export default new ElectionService();
//last workable code
// import pool from '../config/database.js';
// import { generateUniqueSlug, validateDates, generateShareableUrl } from '../utils/helpers.js';
// import { ELECTION_STATUS, CREATOR_TYPES } from '../config/constants.js';

// class ElectionService {
//   /**
//    * Create a draft election (basic info only)
//    */
//   async createDraft(userId, creatorType, draftData) {
//     const { title, description, organization_id } = draftData;

//     const query = `
//       INSERT INTO votteryy_election_drafts (
//         creator_id, creator_type, organization_id, title, description, draft_data
//       )
//       VALUES ($1, $2, $3, $4, $5, $6)
//       RETURNING *
//     `;

//     const values = [
//       userId,
//       creatorType,
//       organization_id || null,
//       title,
//       description || null,
//       JSON.stringify(draftData)
//     ];

//     const result = await pool.query(query, values);
//     return result.rows[0];
//   }

//   /**
//    * Get draft by ID
//    */
//   async getDraft(draftId, userId) {
//     const query = `
//       SELECT * FROM votteryy_election_drafts
//       WHERE id = $1 AND creator_id = $2
//     `;

//     const result = await pool.query(query, [draftId, userId]);
//     return result.rows[0] || null;
//   }

//   /**
//    * Update draft
//    */
//   async updateDraft(draftId, userId, updateData) {
//     const draft = await this.getDraft(draftId, userId);
//     if (!draft) return null;

//     // Merge existing draft_data with new data
//     const existingData = draft.draft_data || {};
//     const mergedData = { ...existingData, ...updateData };

//     const query = `
//       UPDATE votteryy_election_drafts
//       SET 
//         title = COALESCE($1, title),
//         description = COALESCE($2, description),
//         draft_data = $3,
//         updated_at = CURRENT_TIMESTAMP
//       WHERE id = $4 AND creator_id = $5
//       RETURNING *
//     `;

//     const values = [
//       updateData.title || null,
//       updateData.description || null,
//       JSON.stringify(mergedData),
//       draftId,
//       userId
//     ];

//     const result = await pool.query(query, values);
//     return result.rows[0];
//   }

//   /**
//  * Publish election from draft
//  */
// async publishElectionFromDraft(draftId, userId, electionData) {
//   const client = await pool.connect();
  
//   try {
//     await client.query('BEGIN');

//     // Get draft
//     const draftQuery = 'SELECT * FROM votteryy_election_drafts WHERE id = $1 AND creator_id = $2';
//     const draftResult = await client.query(draftQuery, [draftId, userId]);
    
//     if (draftResult.rows.length === 0) {
//       throw new Error('Draft not found');
//     }

//     const draft = draftResult.rows[0];
//     const draftData = draft.draft_data || {};

//     // Extract structured data from request
//     const { election, questions, regional_pricing, lottery_config } = electionData;
    
//     // Merge draft data with election data
//     const mergedData = { ...draftData, ...election };

//     // Validate dates
//     const startDateTime = `${mergedData.start_date} ${mergedData.start_time || '00:00:00'}`;
//     const endDateTime = `${mergedData.end_date} ${mergedData.end_time || '23:59:59'}`;
    
//     const dateValidation = validateDates(startDateTime, endDateTime);
//     if (!dateValidation.valid) {
//       throw new Error(dateValidation.message);
//     }

//     // Use provided slug or generate new one
//     const slug = mergedData.slug || generateUniqueSlug(mergedData.title || draft.title);

//     // Check if slug exists
//     const slugCheck = await client.query(
//       'SELECT id FROM votteryyy_elections WHERE slug = $1',
//       [slug]
//     );

//     if (slugCheck.rows.length > 0) {
//       throw new Error('Election slug already exists');
//     }

//     // 1. INSERT ELECTION
//     const insertElectionQuery = `
//       INSERT INTO votteryyy_elections (
//         creator_id, creator_type, organization_id, title, description, slug,
//         topic_image_url, topic_video_url, logo_url,
//         start_date, start_time, end_date, end_time, timezone,
//         voting_type, voting_body_content,
//         permission_type, allowed_countries,
//         is_free, pricing_type, general_participation_fee, processing_fee_percentage,
//         biometric_required, authentication_methods,
//         show_live_results, vote_editing_allowed,
//         custom_url, corporate_style,
//         status, published_at, subscription_plan_id
//       )
//       VALUES (
//         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
//         $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, CURRENT_TIMESTAMP, $30
//       )
//       RETURNING *
//     `;

//     const electionValues = [
//       userId,                                                    // $1
//       draft.creator_type,                                        // $2
//       draft.organization_id,                                     // $3
//       mergedData.title || draft.title,                          // $4
//       mergedData.description || draft.description,              // $5
//       slug,                                                      // $6
//       mergedData.topic_image_url || null,                       // $7
//       mergedData.topic_video_url || null,                       // $8
//       mergedData.logo_url || null,                              // $9
//       startDateTime,                                             // $10
//       mergedData.start_time || '00:00:00',                      // $11
//       endDateTime,                                               // $12
//       mergedData.end_time || '23:59:59',                        // $13
//       mergedData.timezone || 'UTC',                             // $14
//       mergedData.voting_type || 'plurality',                    // $15
//       mergedData.voting_body_content || null,                   // $16
//       mergedData.permission_type || 'public',                   // $17
//       mergedData.allowed_countries || null,                     // $18
//       mergedData.pricing_type === 'free',                       // $19
//       mergedData.pricing_type || 'free',                        // $20
//       parseFloat(mergedData.general_participation_fee) || 0,    // $21
//       parseFloat(mergedData.processing_fee_percentage) || 0,    // $22
//       mergedData.biometric_required || false,                   // $23
//       mergedData.authentication_methods || ['passkey'],         // $24
//       mergedData.show_live_results || false,                    // $25
//       mergedData.vote_editing_allowed || false,                 // $26
//       mergedData.custom_url || null,                            // $27
//       mergedData.corporate_style ? JSON.stringify(mergedData.corporate_style) : null, // $28
//       'published',                                               // $29
//       mergedData.subscription_plan_id || null                   // $30
//     ];

//     const electionResult = await client.query(insertElectionQuery, electionValues);
//     const publishedElection = electionResult.rows[0];

//     // 2. INSERT CATEGORY MAPPING (if category_id exists)
//     if (mergedData.category_id) {
//       const categoryMappingQuery = `
//         INSERT INTO votteryy_election_category_mapping (election_id, category_id)
//         VALUES ($1, $2)
//         ON CONFLICT (election_id, category_id) DO NOTHING
//       `;
//       await client.query(categoryMappingQuery, [publishedElection.id, mergedData.category_id]);
//     }

//     // 3. INSERT REGIONAL PRICING (if applicable)
//     if (regional_pricing && regional_pricing.length > 0) {
//       for (const region of regional_pricing) {
//         const regionalPricingQuery = `
//           INSERT INTO votteryy_election_regional_pricing (
//             election_id, region_code, region_name, participation_fee, 
//             currency, processing_fee_percentage
//           )
//           VALUES ($1, $2, $3, $4, $5, $6)
//           ON CONFLICT (election_id, region_code) DO UPDATE
//           SET participation_fee = EXCLUDED.participation_fee,
//               currency = EXCLUDED.currency,
//               processing_fee_percentage = EXCLUDED.processing_fee_percentage
//         `;
        
//         await client.query(regionalPricingQuery, [
//           publishedElection.id,
//           region.region_code,
//           region.region_name,
//           parseFloat(region.participation_fee),
//           region.currency || 'USD',
//           parseFloat(mergedData.processing_fee_percentage) || 0
//         ]);
//       }
//     }

//     // 4. INSERT QUESTIONS AND OPTIONS
//     if (questions && questions.length > 0) {
//       for (const question of questions) {
//         // Insert question
//         const questionInsertQuery = `
//           INSERT INTO votteryy_election_questions (
//             election_id, question_text, question_type, 
//             question_order, is_required, max_selections
//           )
//           VALUES ($1, $2, $3, $4, $5, $6)
//           RETURNING id
//         `;
        
//         const questionResult = await client.query(questionInsertQuery, [
//           publishedElection.id,
//           question.question_text,
//           question.question_type,
//           question.question_order,
//           question.is_required !== undefined ? question.is_required : true,
//           question.max_selections || 1
//         ]);
        
//         const questionId = questionResult.rows[0].id;
        
//         // Insert options for this question (if they exist)
//         if (question.options && question.options.length > 0) {
//           for (const option of question.options) {
//             const optionInsertQuery = `
//               INSERT INTO votteryy_election_options (
//                 question_id, option_text, option_order
//               )
//               VALUES ($1, $2, $3)
//             `;
            
//             await client.query(optionInsertQuery, [
//               questionId,
//               option.option_text,
//               option.option_order
//             ]);
//           }
//         }
//       }
//     }

//     // 5. INSERT LOTTERY CONFIGURATION (if enabled)
//     if (lottery_config && lottery_config.is_lotterized) {
//       const lotterySettingsQuery = `
//         INSERT INTO votteryy_election_settings (
//           election_id, setting_key, setting_value
//         )
//         VALUES ($1, $2, $3)
//         ON CONFLICT (election_id, setting_key) DO UPDATE
//         SET setting_value = EXCLUDED.setting_value,
//             updated_at = CURRENT_TIMESTAMP
//       `;
      
//       await client.query(lotterySettingsQuery, [
//         publishedElection.id,
//         'lottery_config',
//         JSON.stringify(lottery_config)
//       ]);
//     }

//     // 6. DELETE DRAFT
//     await client.query('DELETE FROM votteryy_election_drafts WHERE id = $1', [draftId]);

//     await client.query('COMMIT');

//     // Generate shareable URL
//     const shareableUrl = generateShareableUrl(publishedElection.slug, process.env.FRONTEND_URL);
//     publishedElection.shareable_url = shareableUrl;

//     return publishedElection;

//   } catch (error) {
//     await client.query('ROLLBACK');
//     console.error('Publish election error:', error);
//     throw error;
//   } finally {
//     client.release();
//   }
// }

//   /**
//    * Create election directly (without draft)
//    */
//   async createElection(userId, creatorType, electionData) {
//     const client = await pool.connect();
    
//     try {
//       await client.query('BEGIN');

//       // Validate dates
//       const dateValidation = validateDates(electionData.start_date, electionData.end_date);
//       if (!dateValidation.valid) {
//         throw new Error(dateValidation.message);
//       }

//       // Generate slug
//       const slug = generateUniqueSlug(electionData.title);

//       // Check if slug exists
//       const slugCheck = await client.query(
//         'SELECT id FROM votteryyy_elections WHERE slug = $1',
//         [slug]
//       );

//       if (slugCheck.rows.length > 0) {
//         throw new Error('A similar election already exists');
//       }

//       const insertQuery = `
//         INSERT INTO votteryyy_elections (
//           creator_id, creator_type, organization_id, title, description, slug,
//           topic_image_url, topic_video_url, logo_url,
//           start_date, end_date, timezone,
//           voting_type, voting_body_content,
//           permission_type, allowed_countries,
//           is_free, pricing_type, general_participation_fee, processing_fee_percentage,
//           biometric_required, authentication_methods,
//           custom_url, corporate_style,
//           status, subscription_plan_id
//         )
//         VALUES (
//           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
//           $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
//         )
//         RETURNING *
//       `;

//       const values = [
//         userId,
//         creatorType,
//         electionData.organization_id || null,
//         electionData.title,
//         electionData.description || null,
//         slug,
//         electionData.topic_image_url || null,
//         electionData.topic_video_url || null,
//         electionData.logo_url || null,
//         electionData.start_date,
//         electionData.end_date,
//         electionData.timezone || 'UTC',
//         electionData.voting_type,
//         electionData.voting_body_content || null,
//         electionData.permission_type || 'public',
//         electionData.allowed_countries || null,
//         electionData.is_free !== false,
//         electionData.pricing_type || 'free',
//         electionData.general_participation_fee || 0,
//         electionData.processing_fee_percentage || 0,
//         electionData.biometric_required || false,
//         electionData.authentication_methods || ['passkey'],
//         electionData.custom_url || null,
//         electionData.corporate_style ? JSON.stringify(electionData.corporate_style) : null,
//         electionData.status || 'draft',
//         electionData.subscription_plan_id || null
//       ];

//       const result = await client.query(insertQuery, values);
//       const election = result.rows[0];

//       // Insert regional pricing if applicable
//       if (electionData.pricing_type === 'regional_fee' && electionData.regional_pricing) {
//         for (const region of electionData.regional_pricing) {
//           await client.query(`
//             INSERT INTO votteryy_election_regional_pricing (
//               election_id, region_code, region_name, participation_fee, currency, processing_fee_percentage
//             )
//             VALUES ($1, $2, $3, $4, $5, $6)
//           `, [
//             election.id,
//             region.region_code,
//             region.region_name,
//             region.participation_fee,
//             region.currency || 'USD',
//             electionData.processing_fee_percentage || 0
//           ]);
//         }
//       }

//       await client.query('COMMIT');

//       // Generate shareable URL
//       const shareableUrl = generateShareableUrl(election.slug, process.env.FRONTEND_URL);
//       election.shareable_url = shareableUrl;

//       return election;

//     } catch (error) {
//       await client.query('ROLLBACK');
//       throw error;
//     } finally {
//       client.release();
//     }
//   }

//   /**
//    * Get election by ID with full details
//    */
//   async getElectionById(electionId) {
//     const client = await pool.connect();
    
//     try {
//       // 1. Get election with regional pricing
//       const electionQuery = `
//         SELECT 
//           e.*,
//           json_agg(
//             DISTINCT jsonb_build_object(
//               'region_code', erp.region_code,
//               'region_name', erp.region_name,
//               'participation_fee', erp.participation_fee,
//               'currency', erp.currency
//             )
//           ) FILTER (WHERE erp.id IS NOT NULL) as regional_pricing
//         FROM votteryyy_elections e
//         LEFT JOIN votteryy_election_regional_pricing erp ON e.id = erp.election_id
//         WHERE e.id = $1
//         GROUP BY e.id
//       `;

//       const electionResult = await client.query(electionQuery, [electionId]);
      
//       if (electionResult.rows.length === 0) return null;

//       const election = electionResult.rows[0];

//       // 2. Get questions with options
//       const questionsQuery = `
//         SELECT 
//           q.*,
//           json_agg(
//             jsonb_build_object(
//               'id', o.id,
//               'option_text', o.option_text,
//               'option_image_url', o.option_image_url,
//               'option_order', o.option_order
//             ) ORDER BY o.option_order
//           ) FILTER (WHERE o.id IS NOT NULL) as options
//         FROM votteryy_election_questions q
//         LEFT JOIN votteryy_election_options o ON q.id = o.question_id
//         WHERE q.election_id = $1
//         GROUP BY q.id
//         ORDER BY q.question_order
//       `;

//       const questionsResult = await client.query(questionsQuery, [election.id]);
//       election.questions = questionsResult.rows;

//       // 3. Get lottery config from settings
//       const lotteryQuery = `
//         SELECT setting_value
//         FROM votteryy_election_settings
//         WHERE election_id = $1 AND setting_key = 'lottery_config'
//       `;

//       const lotteryResult = await client.query(lotteryQuery, [election.id]);
      
//       if (lotteryResult.rows.length > 0) {
//         election.lottery_config = JSON.parse(lotteryResult.rows[0].setting_value);
//       } else {
//         election.lottery_config = null;
//       }

//       // 4. Generate shareable URL
//       election.shareable_url = generateShareableUrl(election.slug, process.env.FRONTEND_URL);

//       return election;

//     } finally {
//       client.release();
//     }
//   }

//   /**
//    * Get election by slug with full details (questions, options, lottery)
//    */
//   async getElectionBySlug(slug) {
//     const client = await pool.connect();
    
//     try {
//       // 1. Get election with regional pricing
//       const electionQuery = `
//         SELECT 
//           e.*,
//           json_agg(
//             DISTINCT jsonb_build_object(
//               'region_code', erp.region_code,
//               'region_name', erp.region_name,
//               'participation_fee', erp.participation_fee,
//               'currency', erp.currency
//             )
//           ) FILTER (WHERE erp.id IS NOT NULL) as regional_pricing
//         FROM votteryyy_elections e
//         LEFT JOIN votteryy_election_regional_pricing erp ON e.id = erp.election_id
//         WHERE e.slug = $1
//         GROUP BY e.id
//       `;

//       const electionResult = await client.query(electionQuery, [slug]);
      
//       if (electionResult.rows.length === 0) return null;

//       const election = electionResult.rows[0];

//       // 2. Get questions with options
//       const questionsQuery = `
//         SELECT 
//           q.*,
//           json_agg(
//             jsonb_build_object(
//               'id', o.id,
//               'option_text', o.option_text,
//               'option_image_url', o.option_image_url,
//               'option_order', o.option_order
//             ) ORDER BY o.option_order
//           ) FILTER (WHERE o.id IS NOT NULL) as options
//         FROM votteryy_election_questions q
//         LEFT JOIN votteryy_election_options o ON q.id = o.question_id
//         WHERE q.election_id = $1
//         GROUP BY q.id
//         ORDER BY q.question_order
//       `;

//       const questionsResult = await client.query(questionsQuery, [election.id]);
//       election.questions = questionsResult.rows;

//       // 3. Get lottery config from settings
//       const lotteryQuery = `
//         SELECT setting_value
//         FROM votteryy_election_settings
//         WHERE election_id = $1 AND setting_key = 'lottery_config'
//       `;

//       const lotteryResult = await client.query(lotteryQuery, [election.id]);
      
//       if (lotteryResult.rows.length > 0) {
//         election.lottery_config = JSON.parse(lotteryResult.rows[0].setting_value);
//       } else {
//         election.lottery_config = null;
//       }

//       // 4. Generate shareable URL
//       election.shareable_url = generateShareableUrl(election.slug, process.env.FRONTEND_URL);

//       return election;

//     } finally {
//       client.release();
//     }
//   }

//   /**
//    * Get user's elections
//    */
//   async getUserElections(userId, filters = {}) {
//     const { status, page = 1, limit = 10 } = filters;
//     const offset = (page - 1) * limit;

//     let query = `
//       SELECT 
//         e.*,
//         COUNT(*) OVER() as total_count
//       FROM votteryyy_elections e
//       WHERE e.creator_id = $1
//     `;

//     const params = [userId];
//     let paramCount = 1;

//     if (status) {
//       paramCount++;
//       query += ` AND e.status = $${paramCount}`;
//       params.push(status);
//     }

//     query += ` ORDER BY e.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
//     params.push(limit, offset);

//     const result = await pool.query(query, params);

//     return {
//       elections: result.rows,
//       total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
//       page: parseInt(page),
//       limit: parseInt(limit)
//     };
//   }

//   /**
//    * Update election
//    */
//   async updateElection(electionId, userId, updateData) {
//     const election = await this.getElectionById(electionId);
    
//     if (!election || election.creator_id !== userId) {
//       return null;
//     }

//     const fields = [];
//     const values = [];
//     let paramCount = 0;

//     const allowedFields = [
//       'title', 'description', 'topic_image_url', 'topic_video_url', 'logo_url',
//       'start_date', 'end_date', 'timezone', 'voting_type', 'voting_body_content',
//       'permission_type', 'allowed_countries', 'is_free', 'pricing_type',
//       'general_participation_fee', 'processing_fee_percentage', 'biometric_required',
//       'authentication_methods', 'custom_url', 'corporate_style', 'status'
//     ];

//     for (const field of allowedFields) {
//       if (updateData[field] !== undefined) {
//         paramCount++;
//         fields.push(`${field} = $${paramCount}`);
//         values.push(updateData[field]);
//       }
//     }

//     if (fields.length === 0) {
//       return election;
//     }

//     fields.push(`updated_at = CURRENT_TIMESTAMP`);
//     values.push(electionId, userId);

//     const query = `
//       UPDATE votteryyy_elections
//       SET ${fields.join(', ')}
//       WHERE id = $${paramCount + 1} AND creator_id = $${paramCount + 2}
//       RETURNING *
//     `;

//     const result = await pool.query(query, values);
//     return result.rows[0];
//   }

//   /**
//    * Delete election
//    */
//   async deleteElection(electionId, userId) {
//     const query = `
//       DELETE FROM votteryyy_elections
//       WHERE id = $1 AND creator_id = $2
//       RETURNING *
//     `;

//     const result = await pool.query(query, [electionId, userId]);
//     return result.rows[0] || null;
//   }

//   /**
//    * Get user's drafts
//    */
//   async getUserDrafts(userId) {
//     const query = `
//       SELECT * FROM votteryy_election_drafts
//       WHERE creator_id = $1
//       ORDER BY updated_at DESC
//     `;

//     const result = await pool.query(query, [userId]);
//     return result.rows;
//   }

//   /**
//    * Delete draft
//    */
//   async deleteDraft(draftId, userId) {
//     const query = `
//       DELETE FROM votteryy_election_drafts
//       WHERE id = $1 AND creator_id = $2
//       RETURNING *
//     `;

//     const result = await pool.query(query, [draftId, userId]);
//     return result.rows[0] || null;
//   }

//   /**
//    * Get public elections
//    */
//   async getPublicElections(filters = {}) {
//     const { page = 1, limit = 10, status = 'published' } = filters;
//     const offset = (page - 1) * limit;

//     const query = `
//       SELECT 
//         e.*,
//         COUNT(*) OVER() as total_count
//       FROM votteryyy_elections e
//       WHERE e.status = $1 AND e.permission_type = 'public'
//       ORDER BY e.created_at DESC
//       LIMIT $2 OFFSET $3
//     `;

//     const result = await pool.query(query, [status, limit, offset]);

//     return {
//       elections: result.rows,
//       total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
//       page: parseInt(page),
//       limit: parseInt(limit)
//     };
//   }
// }

// export default new ElectionService();
//last workable codes
// import pool from '../config/database.js';
// import { generateUniqueSlug, validateDates, generateShareableUrl } from '../utils/helpers.js';
// import { ELECTION_STATUS, CREATOR_TYPES } from '../config/constants.js';

// class ElectionService {
//   /**
//    * Create a draft election (basic info only)
//    */
//   async createDraft(userId, creatorType, draftData) {
//     const { title, description, organization_id } = draftData;

//     const query = `
//       INSERT INTO votteryy_election_drafts (
//         creator_id, creator_type, organization_id, title, description, draft_data
//       )
//       VALUES ($1, $2, $3, $4, $5, $6)
//       RETURNING *
//     `;

//     const values = [
//       userId,
//       creatorType,
//       organization_id || null,
//       title,
//       description || null,
//       JSON.stringify(draftData)
//     ];

//     const result = await pool.query(query, values);
//     return result.rows[0];
//   }

//   /**
//    * Get draft by ID
//    */
//   async getDraft(draftId, userId) {
//     const query = `
//       SELECT * FROM votteryy_election_drafts
//       WHERE id = $1 AND creator_id = $2
//     `;

//     const result = await pool.query(query, [draftId, userId]);
//     return result.rows[0] || null;
//   }

//   /**
//    * Update draft
//    */
//   async updateDraft(draftId, userId, updateData) {
//     const draft = await this.getDraft(draftId, userId);
//     if (!draft) return null;

//     // Merge existing draft_data with new data
//     const existingData = draft.draft_data || {};
//     const mergedData = { ...existingData, ...updateData };

//     const query = `
//       UPDATE votteryy_election_drafts
//       SET 
//         title = COALESCE($1, title),
//         description = COALESCE($2, description),
//         draft_data = $3,
//         updated_at = CURRENT_TIMESTAMP
//       WHERE id = $4 AND creator_id = $5
//       RETURNING *
//     `;

//     const values = [
//       updateData.title || null,
//       updateData.description || null,
//       JSON.stringify(mergedData),
//       draftId,
//       userId
//     ];

//     const result = await pool.query(query, values);
//     return result.rows[0];
//   }

//   /**
//    * Publish election from draft
//    */
//   /**
//  * Publish election from draft
//  */
// async publishElectionFromDraft(draftId, userId, electionData) {
//   const client = await pool.connect();
  
//   try {
//     await client.query('BEGIN');

//     // Get draft
//     const draftQuery = 'SELECT * FROM votteryy_election_drafts WHERE id = $1 AND creator_id = $2';
//     const draftResult = await client.query(draftQuery, [draftId, userId]);
    
//     if (draftResult.rows.length === 0) {
//       throw new Error('Draft not found');
//     }

//     const draft = draftResult.rows[0];
//     const draftData = draft.draft_data || {};

//     // Extract structured data from request
//     const { election, questions, regional_pricing, lottery_config } = electionData;
    
//     // Merge draft data with election data
//     const mergedData = { ...draftData, ...election };

//     // Validate dates
//     const startDateTime = `${mergedData.start_date} ${mergedData.start_time || '00:00:00'}`;
//     const endDateTime = `${mergedData.end_date} ${mergedData.end_time || '23:59:59'}`;
    
//     const dateValidation = validateDates(startDateTime, endDateTime);
//     if (!dateValidation.valid) {
//       throw new Error(dateValidation.message);
//     }

//     // Use provided slug or generate new one
//     const slug = mergedData.slug || generateUniqueSlug(mergedData.title || draft.title);

//     // Check if slug exists
//     const slugCheck = await client.query(
//       'SELECT id FROM votteryyy_elections WHERE slug = $1',
//       [slug]
//     );

//     if (slugCheck.rows.length > 0) {
//       throw new Error('Election slug already exists');
//     }

//     // 1. INSERT ELECTION
//     const insertElectionQuery = `
//       INSERT INTO votteryyy_elections (
//         creator_id, creator_type, organization_id, title, description, slug,
//         topic_image_url, topic_video_url, logo_url,
//         start_date, start_time, end_date, end_time, timezone,
//         voting_type, voting_body_content,
//         permission_type, allowed_countries,
//         is_free, pricing_type, general_participation_fee, processing_fee_percentage,
//         biometric_required, authentication_methods,
//         show_live_results, vote_editing_allowed,
//         custom_url, corporate_style,
//         status, published_at, subscription_plan_id
//       )
//       VALUES (
//         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
//         $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, CURRENT_TIMESTAMP, $30
//       )
//       RETURNING *
//     `;

//     const electionValues = [
//       userId,                                                    // $1
//       draft.creator_type,                                        // $2
//       draft.organization_id,                                     // $3
//       mergedData.title || draft.title,                          // $4
//       mergedData.description || draft.description,              // $5
//       slug,                                                      // $6
//       mergedData.topic_image_url || null,                       // $7
//       mergedData.topic_video_url || null,                       // $8
//       mergedData.logo_url || null,                              // $9
//       startDateTime,                                             // $10
//       mergedData.start_time || '00:00:00',                      // $11
//       endDateTime,                                               // $12
//       mergedData.end_time || '23:59:59',                        // $13
//       mergedData.timezone || 'UTC',                             // $14
//       mergedData.voting_type || 'plurality',                    // $15
//       mergedData.voting_body_content || null,                   // $16
//       mergedData.permission_type || 'public',                   // $17
//       mergedData.allowed_countries || null,                     // $18
//       mergedData.pricing_type === 'free',                       // $19
//       mergedData.pricing_type || 'free',                        // $20
//       parseFloat(mergedData.general_participation_fee) || 0,    // $21
//       parseFloat(mergedData.processing_fee_percentage) || 0,    // $22
//       mergedData.biometric_required || false,                   // $23
//       mergedData.authentication_methods || ['passkey'],         // $24
//       mergedData.show_live_results || false,                    // $25
//       mergedData.vote_editing_allowed || false,                 // $26
//       mergedData.custom_url || null,                            // $27
//       mergedData.corporate_style ? JSON.stringify(mergedData.corporate_style) : null, // $28
//       'published',                                               // $29
//       mergedData.subscription_plan_id || null                   // $30
//     ];

//     const electionResult = await client.query(insertElectionQuery, electionValues);
//     const publishedElection = electionResult.rows[0];

//     // 2. INSERT CATEGORY MAPPING (if category_id exists)
//     if (mergedData.category_id) {
//       const categoryMappingQuery = `
//         INSERT INTO votteryy_election_category_mapping (election_id, category_id)
//         VALUES ($1, $2)
//         ON CONFLICT (election_id, category_id) DO NOTHING
//       `;
//       await client.query(categoryMappingQuery, [publishedElection.id, mergedData.category_id]);
//     }

//     // 3. INSERT REGIONAL PRICING (if applicable)
//     if (regional_pricing && regional_pricing.length > 0) {
//       for (const region of regional_pricing) {
//         const regionalPricingQuery = `
//           INSERT INTO votteryy_election_regional_pricing (
//             election_id, region_code, region_name, participation_fee, 
//             currency, processing_fee_percentage
//           )
//           VALUES ($1, $2, $3, $4, $5, $6)
//           ON CONFLICT (election_id, region_code) DO UPDATE
//           SET participation_fee = EXCLUDED.participation_fee,
//               currency = EXCLUDED.currency,
//               processing_fee_percentage = EXCLUDED.processing_fee_percentage
//         `;
        
//         await client.query(regionalPricingQuery, [
//           publishedElection.id,
//           region.region_code,
//           region.region_name,
//           parseFloat(region.participation_fee),
//           region.currency || 'USD',
//           parseFloat(mergedData.processing_fee_percentage) || 0
//         ]);
//       }
//     }

//     // 4. INSERT QUESTIONS AND OPTIONS
//     if (questions && questions.length > 0) {
//       for (const question of questions) {
//         // Insert question
//         const questionInsertQuery = `
//           INSERT INTO votteryy_election_questions (
//             election_id, question_text, question_type, 
//             question_order, is_required, max_selections
//           )
//           VALUES ($1, $2, $3, $4, $5, $6)
//           RETURNING id
//         `;
        
//         const questionResult = await client.query(questionInsertQuery, [
//           publishedElection.id,
//           question.question_text,
//           question.question_type,
//           question.question_order,
//           question.is_required !== undefined ? question.is_required : true,
//           question.max_selections || 1
//         ]);
        
//         const questionId = questionResult.rows[0].id;
        
//         // Insert options for this question (if they exist)
//         if (question.options && question.options.length > 0) {
//           for (const option of question.options) {
//             const optionInsertQuery = `
//               INSERT INTO votteryy_election_options (
//                 question_id, option_text, option_order
//               )
//               VALUES ($1, $2, $3)
//             `;
            
//             await client.query(optionInsertQuery, [
//               questionId,
//               option.option_text,
//               option.option_order
//             ]);
//           }
//         }
//       }
//     }

//     // 5. INSERT LOTTERY CONFIGURATION (if enabled)
//     if (lottery_config && lottery_config.is_lotterized) {
//       const lotterySettingsQuery = `
//         INSERT INTO votteryy_election_settings (
//           election_id, setting_key, setting_value
//         )
//         VALUES ($1, $2, $3)
//         ON CONFLICT (election_id, setting_key) DO UPDATE
//         SET setting_value = EXCLUDED.setting_value,
//             updated_at = CURRENT_TIMESTAMP
//       `;
      
//       await client.query(lotterySettingsQuery, [
//         publishedElection.id,
//         'lottery_config',
//         JSON.stringify(lottery_config)
//       ]);
//     }

//     // 6. DELETE DRAFT
//     await client.query('DELETE FROM votteryy_election_drafts WHERE id = $1', [draftId]);

//     await client.query('COMMIT');

//     // Generate shareable URL
//     const shareableUrl = generateShareableUrl(publishedElection.slug, process.env.FRONTEND_URL);
//     publishedElection.shareable_url = shareableUrl;

//     return publishedElection;

//   } catch (error) {
//     await client.query('ROLLBACK');
//     console.error('Publish election error:', error);
//     throw error;
//   } finally {
//     client.release();
//   }
// }
//   /**
//    * Create election directly (without draft)
//    */
//   async createElection(userId, creatorType, electionData) {
//     const client = await pool.connect();
    
//     try {
//       await client.query('BEGIN');

//       // Validate dates
//       const dateValidation = validateDates(electionData.start_date, electionData.end_date);
//       if (!dateValidation.valid) {
//         throw new Error(dateValidation.message);
//       }

//       // Generate slug
//       const slug = generateUniqueSlug(electionData.title);

//       // Check if slug exists
//       const slugCheck = await client.query(
//         'SELECT id FROM votteryyy_elections WHERE slug = $1',
//         [slug]
//       );

//       if (slugCheck.rows.length > 0) {
//         throw new Error('A similar election already exists');
//       }

//       const insertQuery = `
//         INSERT INTO votteryyy_elections (
//           creator_id, creator_type, organization_id, title, description, slug,
//           topic_image_url, topic_video_url, logo_url,
//           start_date, end_date, timezone,
//           voting_type, voting_body_content,
//           permission_type, allowed_countries,
//           is_free, pricing_type, general_participation_fee, processing_fee_percentage,
//           biometric_required, authentication_methods,
//           custom_url, corporate_style,
//           status, subscription_plan_id
//         )
//         VALUES (
//           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
//           $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
//         )
//         RETURNING *
//       `;

//       const values = [
//         userId,
//         creatorType,
//         electionData.organization_id || null,
//         electionData.title,
//         electionData.description || null,
//         slug,
//         electionData.topic_image_url || null,
//         electionData.topic_video_url || null,
//         electionData.logo_url || null,
//         electionData.start_date,
//         electionData.end_date,
//         electionData.timezone || 'UTC',
//         electionData.voting_type,
//         electionData.voting_body_content || null,
//         electionData.permission_type || 'public',
//         electionData.allowed_countries || null,
//         electionData.is_free !== false,
//         electionData.pricing_type || 'free',
//         electionData.general_participation_fee || 0,
//         electionData.processing_fee_percentage || 0,
//         electionData.biometric_required || false,
//         electionData.authentication_methods || ['passkey'],
//         electionData.custom_url || null,
//         electionData.corporate_style ? JSON.stringify(electionData.corporate_style) : null,
//         electionData.status || 'draft',
//         electionData.subscription_plan_id || null
//       ];

//       const result = await client.query(insertQuery, values);
//       const election = result.rows[0];

//       // Insert regional pricing if applicable
//       if (electionData.pricing_type === 'regional_fee' && electionData.regional_pricing) {
//         for (const region of electionData.regional_pricing) {
//           await client.query(`
//             INSERT INTO votteryy_election_regional_pricing (
//               election_id, region_code, region_name, participation_fee, currency, processing_fee_percentage
//             )
//             VALUES ($1, $2, $3, $4, $5, $6)
//           `, [
//             election.id,
//             region.region_code,
//             region.region_name,
//             region.participation_fee,
//             region.currency || 'USD',
//             electionData.processing_fee_percentage || 0
//           ]);
//         }
//       }

//       await client.query('COMMIT');

//       // Generate shareable URL
//       const shareableUrl = generateShareableUrl(election.slug, process.env.FRONTEND_URL);
//       election.shareable_url = shareableUrl;

//       return election;

//     } catch (error) {
//       await client.query('ROLLBACK');
//       throw error;
//     } finally {
//       client.release();
//     }
//   }

//   /**
//    * Get election by ID
//    */
//   async getElectionById(electionId) {
//     const query = `
//       SELECT 
//         e.*,
//         json_agg(
//           DISTINCT jsonb_build_object(
//             'region_code', erp.region_code,
//             'region_name', erp.region_name,
//             'participation_fee', erp.participation_fee,
//             'currency', erp.currency
//           )
//         ) FILTER (WHERE erp.id IS NOT NULL) as regional_pricing
//       FROM votteryyy_elections e
//       LEFT JOIN votteryy_election_regional_pricing erp ON e.id = erp.election_id
//       WHERE e.id = $1
//       GROUP BY e.id
//     `;

//     const result = await pool.query(query, [electionId]);
    
//     if (result.rows.length === 0) return null;

//     const election = result.rows[0];
//     election.shareable_url = generateShareableUrl(election.slug, process.env.FRONTEND_URL);
    
//     return election;
//   }

//   /**
//    * Get election by slug
//    */
//   async getElectionBySlug(slug) {
//     const query = `
//       SELECT 
//         e.*,
//         json_agg(
//           DISTINCT jsonb_build_object(
//             'region_code', erp.region_code,
//             'region_name', erp.region_name,
//             'participation_fee', erp.participation_fee,
//             'currency', erp.currency
//           )
//         ) FILTER (WHERE erp.id IS NOT NULL) as regional_pricing
//       FROM votteryyy_elections e
//       LEFT JOIN votteryy_election_regional_pricing erp ON e.id = erp.election_id
//       WHERE e.slug = $1
//       GROUP BY e.id
//     `;

//     const result = await pool.query(query, [slug]);
    
//     if (result.rows.length === 0) return null;

//     const election = result.rows[0];
//     election.shareable_url = generateShareableUrl(election.slug, process.env.FRONTEND_URL);
    
//     return election;
//   }

//   /**
//    * Get user's elections
//    */
//   async getUserElections(userId, filters = {}) {
//     const { status, page = 1, limit = 10 } = filters;
//     const offset = (page - 1) * limit;

//     let query = `
//       SELECT 
//         e.*,
//         COUNT(*) OVER() as total_count
//       FROM votteryyy_elections e
//       WHERE e.creator_id = $1
//     `;

//     const params = [userId];
//     let paramCount = 1;

//     if (status) {
//       paramCount++;
//       query += ` AND e.status = $${paramCount}`;
//       params.push(status);
//     }

//     query += ` ORDER BY e.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
//     params.push(limit, offset);

//     const result = await pool.query(query, params);

//     return {
//       elections: result.rows,
//       total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
//       page: parseInt(page),
//       limit: parseInt(limit)
//     };
//   }

//   /**
//    * Update election
//    */
//   async updateElection(electionId, userId, updateData) {
//     const election = await this.getElectionById(electionId);
    
//     if (!election || election.creator_id !== userId) {
//       return null;
//     }

//     const fields = [];
//     const values = [];
//     let paramCount = 0;

//     const allowedFields = [
//       'title', 'description', 'topic_image_url', 'topic_video_url', 'logo_url',
//       'start_date', 'end_date', 'timezone', 'voting_type', 'voting_body_content',
//       'permission_type', 'allowed_countries', 'is_free', 'pricing_type',
//       'general_participation_fee', 'processing_fee_percentage', 'biometric_required',
//       'authentication_methods', 'custom_url', 'corporate_style', 'status'
//     ];

//     for (const field of allowedFields) {
//       if (updateData[field] !== undefined) {
//         paramCount++;
//         fields.push(`${field} = $${paramCount}`);
//         values.push(updateData[field]);
//       }
//     }

//     if (fields.length === 0) {
//       return election;
//     }

//     fields.push(`updated_at = CURRENT_TIMESTAMP`);
//     values.push(electionId, userId);

//     const query = `
//       UPDATE votteryyy_elections
//       SET ${fields.join(', ')}
//       WHERE id = $${paramCount + 1} AND creator_id = $${paramCount + 2}
//       RETURNING *
//     `;

//     const result = await pool.query(query, values);
//     return result.rows[0];
//   }

//   /**
//    * Delete election
//    */
//   async deleteElection(electionId, userId) {
//     const query = `
//       DELETE FROM votteryyy_elections
//       WHERE id = $1 AND creator_id = $2
//       RETURNING *
//     `;

//     const result = await pool.query(query, [electionId, userId]);
//     return result.rows[0] || null;
//   }

//   /**
//    * Get user's drafts
//    */
//   async getUserDrafts(userId) {
//     const query = `
//       SELECT * FROM votteryy_election_drafts
//       WHERE creator_id = $1
//       ORDER BY updated_at DESC
//     `;

//     const result = await pool.query(query, [userId]);
//     return result.rows;
//   }

//   /**
//    * Delete draft
//    */
//   async deleteDraft(draftId, userId) {
//     const query = `
//       DELETE FROM votteryy_election_drafts
//       WHERE id = $1 AND creator_id = $2
//       RETURNING *
//     `;

//     const result = await pool.query(query, [draftId, userId]);
//     return result.rows[0] || null;
//   }

//   /**
//    * Get public elections
//    */
//   async getPublicElections(filters = {}) {
//     const { page = 1, limit = 10, status = 'published' } = filters;
//     const offset = (page - 1) * limit;

//     const query = `
//       SELECT 
//         e.*,
//         COUNT(*) OVER() as total_count
//       FROM votteryyy_elections e
//       WHERE e.status = $1 AND e.permission_type = 'public'
//       ORDER BY e.created_at DESC
//       LIMIT $2 OFFSET $3
//     `;

//     const result = await pool.query(query, [status, limit, offset]);

//     return {
//       elections: result.rows,
//       total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
//       page: parseInt(page),
//       limit: parseInt(limit)
//     };
//   }
// }

// export default new ElectionService();
// import pool from '../config/database.js';
// import { generateUniqueSlug, validateDates, generateShareableUrl } from '../utils/helpers.js';
// import { ELECTION_STATUS, CREATOR_TYPES } from '../config/constants.js';

// class ElectionService {
//   /**
//    * Create a draft election (basic info only)
//    */
//   async createDraft(userId, creatorType, draftData) {
//     const { title, description, organization_id } = draftData;

//     const query = `
//       INSERT INTO votteryy_election_drafts (
//         creator_id, creator_type, organization_id, title, description, draft_data
//       )
//       VALUES ($1, $2, $3, $4, $5, $6)
//       RETURNING *
//     `;

//     const values = [
//       userId,
//       creatorType,
//       organization_id || null,
//       title,
//       description || null,
//       JSON.stringify(draftData)
//     ];

//     const result = await pool.query(query, values);
//     return result.rows[0];
//   }

//   /**
//    * Get draft by ID
//    */
//   async getDraft(draftId, userId) {
//     const query = `
//       SELECT * FROM votteryy_election_drafts
//       WHERE id = $1 AND creator_id = $2
//     `;

//     const result = await pool.query(query, [draftId, userId]);
//     return result.rows[0] || null;
//   }

//   /**
//    * Update draft
//    */
//   async updateDraft(draftId, userId, updateData) {
//     const draft = await this.getDraft(draftId, userId);
//     if (!draft) return null;

//     // Merge existing draft_data with new data
//     const existingData = draft.draft_data || {};
//     const mergedData = { ...existingData, ...updateData };

//     const query = `
//       UPDATE votteryy_election_drafts
//       SET 
//         title = COALESCE($1, title),
//         description = COALESCE($2, description),
//         draft_data = $3,
//         updated_at = CURRENT_TIMESTAMP
//       WHERE id = $4 AND creator_id = $5
//       RETURNING *
//     `;

//     const values = [
//       updateData.title || null,
//       updateData.description || null,
//       JSON.stringify(mergedData),
//       draftId,
//       userId
//     ];

//     const result = await pool.query(query, values);
//     return result.rows[0];
//   }

//   /**
//    * Publish election from draft
//    */
//   async publishElectionFromDraft(draftId, userId, electionData) {
//     const client = await pool.connect();
    
//     try {
//       await client.query('BEGIN');

//       // Get draft
//       const draftQuery = 'SELECT * FROM votteryy_election_drafts WHERE id = $1 AND creator_id = $2';
//       const draftResult = await client.query(draftQuery, [draftId, userId]);
      
//       if (draftResult.rows.length === 0) {
//         throw new Error('Draft not found');
//       }

//       const draft = draftResult.rows[0];
//       const draftData = draft.draft_data || {};

//       // Merge draft data with election data
//       const mergedData = { ...draftData, ...electionData };

//       // Validate dates
//       const dateValidation = validateDates(mergedData.start_date, mergedData.end_date);
//       if (!dateValidation.valid) {
//         throw new Error(dateValidation.message);
//       }

//       // Generate slug
//       const slug = generateUniqueSlug(mergedData.title || draft.title);

//       // Insert election
//       const insertQuery = `
//         INSERT INTO votteryyy_elections (
//           creator_id, creator_type, organization_id, title, description, slug,
//           topic_image_url, topic_video_url, logo_url,
//           start_date, end_date, timezone,
//           voting_type, voting_body_content,
//           permission_type, allowed_countries,
//           is_free, pricing_type, general_participation_fee, processing_fee_percentage,
//           biometric_required, authentication_methods,
//           custom_url, corporate_style,
//           status, subscription_plan_id
//         )
//         VALUES (
//           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
//           $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
//         )
//         RETURNING *
//       `;

//       const values = [
//         userId,
//         draft.creator_type,
//         draft.organization_id,
//         mergedData.title || draft.title,
//         mergedData.description || draft.description,
//         slug,
//         mergedData.topic_image_url || null,
//         mergedData.topic_video_url || null,
//         mergedData.logo_url || null,
//         mergedData.start_date,
//         mergedData.end_date,
//         mergedData.timezone || 'UTC',
//         mergedData.voting_type,
//         mergedData.voting_body_content || null,
//         mergedData.permission_type || 'public',
//         mergedData.allowed_countries || null,
//         mergedData.is_free !== false,
//         mergedData.pricing_type || 'free',
//         mergedData.general_participation_fee || 0,
//         mergedData.processing_fee_percentage || 0,
//         mergedData.biometric_required || false,
//         mergedData.authentication_methods || ['passkey'],
//         mergedData.custom_url || null,
//         mergedData.corporate_style ? JSON.stringify(mergedData.corporate_style) : null,
//         'published',
//         mergedData.subscription_plan_id || null
//       ];

//       const electionResult = await client.query(insertQuery, values);
//       const election = electionResult.rows[0];

//       // Insert regional pricing if applicable
//       if (mergedData.pricing_type === 'regional_fee' && mergedData.regional_pricing) {
//         for (const region of mergedData.regional_pricing) {
//           await client.query(`
//             INSERT INTO votteryy_election_regional_pricing (
//               election_id, region_code, region_name, participation_fee, currency, processing_fee_percentage
//             )
//             VALUES ($1, $2, $3, $4, $5, $6)
//           `, [
//             election.id,
//             region.region_code,
//             region.region_name,
//             region.participation_fee,
//             region.currency || 'USD',
//             mergedData.processing_fee_percentage || 0
//           ]);
//         }
//       }

//       // Delete draft
//       await client.query('DELETE FROM votteryy_election_drafts WHERE id = $1', [draftId]);

//       await client.query('COMMIT');

//       // Generate shareable URL
//       const shareableUrl = generateShareableUrl(election.slug, process.env.FRONTEND_URL);
//       election.shareable_url = shareableUrl;

//       return election;

//     } catch (error) {
//       await client.query('ROLLBACK');
//       throw error;
//     } finally {
//       client.release();
//     }
//   }

//   /**
//    * Create election directly (without draft)
//    */
//   async createElection(userId, creatorType, electionData) {
//     const client = await pool.connect();
    
//     try {
//       await client.query('BEGIN');

//       // Validate dates
//       const dateValidation = validateDates(electionData.start_date, electionData.end_date);
//       if (!dateValidation.valid) {
//         throw new Error(dateValidation.message);
//       }

//       // Generate slug
//       const slug = generateUniqueSlug(electionData.title);

//       // Check if slug exists
//       const slugCheck = await client.query(
//         'SELECT id FROM votteryyy_elections WHERE slug = $1',
//         [slug]
//       );

//       if (slugCheck.rows.length > 0) {
//         throw new Error('A similar election already exists');
//       }

//       const insertQuery = `
//         INSERT INTO votteryyy_elections (
//           creator_id, creator_type, organization_id, title, description, slug,
//           topic_image_url, topic_video_url, logo_url,
//           start_date, end_date, timezone,
//           voting_type, voting_body_content,
//           permission_type, allowed_countries,
//           is_free, pricing_type, general_participation_fee, processing_fee_percentage,
//           biometric_required, authentication_methods,
//           custom_url, corporate_style,
//           status, subscription_plan_id
//         )
//         VALUES (
//           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
//           $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
//         )
//         RETURNING *
//       `;

//       const values = [
//         userId,
//         creatorType,
//         electionData.organization_id || null,
//         electionData.title,
//         electionData.description || null,
//         slug,
//         electionData.topic_image_url || null,
//         electionData.topic_video_url || null,
//         electionData.logo_url || null,
//         electionData.start_date,
//         electionData.end_date,
//         electionData.timezone || 'UTC',
//         electionData.voting_type,
//         electionData.voting_body_content || null,
//         electionData.permission_type || 'public',
//         electionData.allowed_countries || null,
//         electionData.is_free !== false,
//         electionData.pricing_type || 'free',
//         electionData.general_participation_fee || 0,
//         electionData.processing_fee_percentage || 0,
//         electionData.biometric_required || false,
//         electionData.authentication_methods || ['passkey'],
//         electionData.custom_url || null,
//         electionData.corporate_style ? JSON.stringify(electionData.corporate_style) : null,
//         electionData.status || 'draft',
//         electionData.subscription_plan_id || null
//       ];

//       const result = await client.query(insertQuery, values);
//       const election = result.rows[0];

//       // Insert regional pricing if applicable
//       if (electionData.pricing_type === 'regional_fee' && electionData.regional_pricing) {
//         for (const region of electionData.regional_pricing) {
//           await client.query(`
//             INSERT INTO votteryy_election_regional_pricing (
//               election_id, region_code, region_name, participation_fee, currency, processing_fee_percentage
//             )
//             VALUES ($1, $2, $3, $4, $5, $6)
//           `, [
//             election.id,
//             region.region_code,
//             region.region_name,
//             region.participation_fee,
//             region.currency || 'USD',
//             electionData.processing_fee_percentage || 0
//           ]);
//         }
//       }

//       await client.query('COMMIT');

//       // Generate shareable URL
//       const shareableUrl = generateShareableUrl(election.slug, process.env.FRONTEND_URL);
//       election.shareable_url = shareableUrl;

//       return election;

//     } catch (error) {
//       await client.query('ROLLBACK');
//       throw error;
//     } finally {
//       client.release();
//     }
//   }

//   /**
//    * Get election by ID
//    */
//   async getElectionById(electionId) {
//     const query = `
//       SELECT 
//         e.*,
//         json_agg(
//           DISTINCT jsonb_build_object(
//             'region_code', erp.region_code,
//             'region_name', erp.region_name,
//             'participation_fee', erp.participation_fee,
//             'currency', erp.currency
//           )
//         ) FILTER (WHERE erp.id IS NOT NULL) as regional_pricing
//       FROM votteryyy_elections e
//       LEFT JOIN votteryy_election_regional_pricing erp ON e.id = erp.election_id
//       WHERE e.id = $1
//       GROUP BY e.id
//     `;

//     const result = await pool.query(query, [electionId]);
    
//     if (result.rows.length === 0) return null;

//     const election = result.rows[0];
//     election.shareable_url = generateShareableUrl(election.slug, process.env.FRONTEND_URL);
    
//     return election;
//   }

//   /**
//    * Get election by slug
//    */
//   async getElectionBySlug(slug) {
//     const query = `
//       SELECT 
//         e.*,
//         json_agg(
//           DISTINCT jsonb_build_object(
//             'region_code', erp.region_code,
//             'region_name', erp.region_name,
//             'participation_fee', erp.participation_fee,
//             'currency', erp.currency
//           )
//         ) FILTER (WHERE erp.id IS NOT NULL) as regional_pricing
//       FROM votteryyy_elections e
//       LEFT JOIN votteryy_election_regional_pricing erp ON e.id = erp.election_id
//       WHERE e.slug = $1
//       GROUP BY e.id
//     `;

//     const result = await pool.query(query, [slug]);
    
//     if (result.rows.length === 0) return null;

//     const election = result.rows[0];
//     election.shareable_url = generateShareableUrl(election.slug, process.env.FRONTEND_URL);
    
//     return election;
//   }

//   /**
//    * Get user's elections
//    */
//   async getUserElections(userId, filters = {}) {
//     const { status, page = 1, limit = 10 } = filters;
//     const offset = (page - 1) * limit;

//     let query = `
//       SELECT 
//         e.*,
//         COUNT(*) OVER() as total_count
//       FROM votteryyy_elections e
//       WHERE e.creator_id = $1
//     `;

//     const params = [userId];
//     let paramCount = 1;

//     if (status) {
//       paramCount++;
//       query += ` AND e.status = $${paramCount}`;
//       params.push(status);
//     }

//     query += ` ORDER BY e.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
//     params.push(limit, offset);

//     const result = await pool.query(query, params);

//     return {
//       elections: result.rows,
//       total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
//       page: parseInt(page),
//       limit: parseInt(limit)
//     };
//   }

//   /**
//    * Update election
//    */
//   async updateElection(electionId, userId, updateData) {
//     const election = await this.getElectionById(electionId);
    
//     if (!election || election.creator_id !== userId) {
//       return null;
//     }

//     const fields = [];
//     const values = [];
//     let paramCount = 0;

//     const allowedFields = [
//       'title', 'description', 'topic_image_url', 'topic_video_url', 'logo_url',
//       'start_date', 'end_date', 'timezone', 'voting_type', 'voting_body_content',
//       'permission_type', 'allowed_countries', 'is_free', 'pricing_type',
//       'general_participation_fee', 'processing_fee_percentage', 'biometric_required',
//       'authentication_methods', 'custom_url', 'corporate_style', 'status'
//     ];

//     for (const field of allowedFields) {
//       if (updateData[field] !== undefined) {
//         paramCount++;
//         fields.push(`${field} = $${paramCount}`);
//         values.push(updateData[field]);
//       }
//     }

//     if (fields.length === 0) {
//       return election;
//     }

//     fields.push(`updated_at = CURRENT_TIMESTAMP`);
//     values.push(electionId, userId);

//     const query = `
//       UPDATE votteryyy_elections
//       SET ${fields.join(', ')}
//       WHERE id = $${paramCount + 1} AND creator_id = $${paramCount + 2}
//       RETURNING *
//     `;

//     const result = await pool.query(query, values);
//     return result.rows[0];
//   }

//   /**
//    * Delete election
//    */
//   async deleteElection(electionId, userId) {
//     const query = `
//       DELETE FROM votteryyy_elections
//       WHERE id = $1 AND creator_id = $2
//       RETURNING *
//     `;

//     const result = await pool.query(query, [electionId, userId]);
//     return result.rows[0] || null;
//   }

//   /**
//    * Get user's drafts
//    */
//   async getUserDrafts(userId) {
//     const query = `
//       SELECT * FROM votteryy_election_drafts
//       WHERE creator_id = $1
//       ORDER BY updated_at DESC
//     `;

//     const result = await pool.query(query, [userId]);
//     return result.rows;
//   }

//   /**
//    * Delete draft
//    */
//   async deleteDraft(draftId, userId) {
//     const query = `
//       DELETE FROM votteryy_election_drafts
//       WHERE id = $1 AND creator_id = $2
//       RETURNING *
//     `;

//     const result = await pool.query(query, [draftId, userId]);
//     return result.rows[0] || null;
//   }

//   /**
//    * Get public elections
//    */
//   async getPublicElections(filters = {}) {
//     const { page = 1, limit = 10, status = 'published' } = filters;
//     const offset = (page - 1) * limit;

//     const query = `
//       SELECT 
//         e.*,
//         COUNT(*) OVER() as total_count
//       FROM votteryyy_elections e
//       WHERE e.status = $1 AND e.permission_type = 'public'
//       ORDER BY e.created_at DESC
//       LIMIT $2 OFFSET $3
//     `;

//     const result = await pool.query(query, [status, limit, offset]);

//     return {
//       elections: result.rows,
//       total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
//       page: parseInt(page),
//       limit: parseInt(limit)
//     };
//   }
// }

// export default new ElectionService();