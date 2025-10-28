import pool from '../config/database.js';
import { AppError } from '../utils/errorHandler.js';
import { HTTP_STATUS, ERROR_MESSAGES, FREE_TIER_LIMITS } from '../config/constants.js';

/**
 * Check if user can create elections based on subscription
 */
export const checkElectionCreationEligibility = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const isSubscribed = req.user.isSubscribed;

    // Get user's subscription details
    const subscriptionQuery = `
      SELECT 
        us.id,
        us.plan_id,
        us.status,
        us.start_date,
        us.end_date,
        sp.plan_name,
        sp.plan_type,
        sp.max_elections,
        sp.max_voters_per_election,
        sp.processing_fee_percentage,
        sp.processing_fee_mandatory
      FROM votteryy_user_subscriptions us
      JOIN votteryy_subscription_plans sp ON us.plan_id = sp.id
      WHERE us.user_id = $1 
        AND us.status = 'active'
      ORDER BY us.created_at DESC
      LIMIT 1
    `;

    const subscriptionResult = await pool.query(subscriptionQuery, [userId]);

    // Count current month elections
    const currentMonthStart = new Date();
    currentMonthStart.setDate(1);
    currentMonthStart.setHours(0, 0, 0, 0);

    const electionsCountQuery = `
      SELECT COUNT(*) as total
      FROM votteryyy_elections
      WHERE creator_id = $1 
        AND created_at >= $2
        AND status != 'cancelled'
    `;

    const countResult = await pool.query(electionsCountQuery, [userId, currentMonthStart]);
    const currentElectionsCount = parseInt(countResult.rows[0].total);

    let eligibilityData = {
      canCreate: false,
      subscriptionType: 'Free',
      planName: 'Free Plan',
      currentElectionsCount,
      maxElections: FREE_TIER_LIMITS.MAX_ELECTIONS_PER_MONTH,
      remainingElections: 0,
      canCreatePaidElections: false,
      processingFeePercentage: 0,
      features: FREE_TIER_LIMITS.FEATURES,
      message: ''
    };

    // If no active subscription (Free user)
    if (!isSubscribed || subscriptionResult.rows.length === 0) {
      const remaining = FREE_TIER_LIMITS.MAX_ELECTIONS_PER_MONTH - currentElectionsCount;
      
      eligibilityData.canCreate = remaining > 0;
      eligibilityData.remainingElections = remaining;
      eligibilityData.message = remaining > 0 
        ? `You can create ${remaining} more elections this month`
        : 'You have reached your free tier limit. Please upgrade to create more elections.';

      if (!eligibilityData.canCreate) {
        return next(new AppError(eligibilityData.message, HTTP_STATUS.FORBIDDEN));
      }
    } else {
      // Subscribed user
      const subscription = subscriptionResult.rows[0];
      
      eligibilityData = {
        canCreate: true,
        subscriptionType: subscription.plan_type,
        planName: subscription.plan_name,
        currentElectionsCount,
        maxElections: subscription.max_elections || 'Unlimited',
        remainingElections: subscription.max_elections 
          ? subscription.max_elections - currentElectionsCount 
          : 'Unlimited',
        canCreatePaidElections: true,
        processingFeePercentage: subscription.processing_fee_percentage || 0,
        processingFeeMandatory: subscription.processing_fee_mandatory || false,
        maxVotersPerElection: subscription.max_voters_per_election || 'Unlimited',
        features: ['Unlimited elections', 'Custom branding', 'Advanced analytics', 'Monetization'],
        message: 'You have full access to create elections'
      };

      // Check if reached limit for paid subscription
      if (subscription.max_elections && currentElectionsCount >= subscription.max_elections) {
        eligibilityData.canCreate = false;
        eligibilityData.message = `You have reached your plan limit of ${subscription.max_elections} elections.`;
        return next(new AppError(eligibilityData.message, HTTP_STATUS.FORBIDDEN));
      }
    }

    // Attach eligibility data to request
    req.eligibility = eligibilityData;
    next();

  } catch (error) {
    console.error('Error checking eligibility:', error);
    next(new AppError('Failed to check subscription eligibility', HTTP_STATUS.INTERNAL_SERVER_ERROR));
  }
};

/**
 * Get subscription information for display
 */
export const getSubscriptionInfo = async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const query = `
      SELECT 
        us.id,
        us.plan_id,
        us.status,
        us.start_date,
        us.end_date,
        sp.plan_name,
        sp.plan_type,
        sp.price,
        sp.max_elections,
        sp.max_voters_per_election,
        sp.processing_fee_percentage,
        sp.what_included,
        sp.what_excluded
      FROM votteryy_user_subscriptions us
      JOIN votteryy_subscription_plans sp ON us.plan_id = sp.id
      WHERE us.user_id = $1 
        AND us.status = 'active'
      ORDER BY us.created_at DESC
      LIMIT 1
    `;

    const result = await pool.query(query, [userId]);

    if (result.rows.length > 0) {
      req.subscriptionInfo = result.rows[0];
    } else {
      req.subscriptionInfo = null;
    }

    next();
  } catch (error) {
    console.error('Error fetching subscription info:', error);
    next(error);
  }
};

export default {
  checkElectionCreationEligibility,
  getSubscriptionInfo
};