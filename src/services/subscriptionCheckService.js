import pool from '../config/database.js';
import { FREE_TIER_LIMITS } from '../config/constants.js';

class SubscriptionCheckService {
  /**
   * Get user's subscription details
   */
  async getUserSubscription(userId) {
    const query = `
      SELECT 
        us.id,
        us.user_id,
        us.plan_id,
        us.status,
        us.start_date,
        us.end_date,
        us.auto_renew,
        us.payment_type,
        sp.plan_name,
        sp.plan_type,
        sp.price,
        sp.max_elections,
        sp.max_voters_per_election,
        sp.processing_fee_percentage,
        sp.processing_fee_mandatory,
        sp.what_included,
        sp.what_excluded
      FROM votteryy_user_subscriptions us
      JOIN votteryy_subscription_plans sp ON us.plan_id = sp.id
      WHERE us.user_id = $1 
        AND us.status = 'active'
        AND (us.end_date IS NULL OR us.end_date > NOW())
      ORDER BY us.created_at DESC
      LIMIT 1
    `;

    const result = await pool.query(query, [userId]);
    return result.rows[0] || null;
  }

  /**
   * Count user's elections in current month
   */
  async getCurrentMonthElectionCount(userId) {
    const currentMonthStart = new Date();
    currentMonthStart.setDate(1);
    currentMonthStart.setHours(0, 0, 0, 0);

    const query = `
      SELECT COUNT(*) as total
      FROM votteryy_elections
      WHERE creator_id = $1 
        AND created_at >= $2
        AND status != 'cancelled'
    `;

    const result = await pool.query(query, [userId, currentMonthStart]);
    return parseInt(result.rows[0].total);
  }

  /**
   * Check eligibility for election creation
   */
  async checkEligibility(userId, isSubscribed = false) {
    try {
      const subscription = await this.getUserSubscription(userId);
      const currentCount = await this.getCurrentMonthElectionCount(userId);

      // Free user
      if (!isSubscribed || !subscription) {
        const remaining = FREE_TIER_LIMITS.MAX_ELECTIONS_PER_MONTH - currentCount;
        
        return {
          canCreate: remaining > 0,
          subscriptionType: 'Free',
          planName: 'Free Plan',
          currentElectionsCount: currentCount,
          maxElections: FREE_TIER_LIMITS.MAX_ELECTIONS_PER_MONTH,
          remainingElections: Math.max(0, remaining),
          canCreatePaidElections: false,
          processingFeePercentage: 0,
          features: FREE_TIER_LIMITS.FEATURES,
          message: remaining > 0 
            ? `You can create ${remaining} more free elections this month`
            : 'Free tier limit reached. Please upgrade to create more elections.'
        };
      }

      // Subscribed user
      const maxElections = subscription.max_elections;
      const hasLimit = maxElections !== null && maxElections !== undefined;
      
      let canCreate = true;
      let remaining = 'Unlimited';
      let message = 'You have full access to create elections';

      if (hasLimit) {
        remaining = maxElections - currentCount;
        canCreate = remaining > 0;
        message = canCreate 
          ? `You can create ${remaining} more elections`
          : `Plan limit of ${maxElections} elections reached`;
      }

      return {
        canCreate,
        subscriptionType: subscription.plan_type,
        planName: subscription.plan_name,
        billingCycle: subscription.plan_type === 'pay_as_you_go' ? 'Usage-based' : subscription.billing_cycle || 'N/A',
        paymentType: subscription.payment_type || 'recurring',
        currentElectionsCount: currentCount,
        maxElections: hasLimit ? maxElections : 'Unlimited',
        remainingElections: remaining,
        canCreatePaidElections: true,
        processingFeePercentage: subscription.processing_fee_percentage || 0,
        processingFeeMandatory: subscription.processing_fee_mandatory || false,
        maxVotersPerElection: subscription.max_voters_per_election || 'Unlimited',
        features: JSON.parse(subscription.what_included || '[]'),
        message
      };

    } catch (error) {
      console.error('Error checking eligibility:', error);
      throw error;
    }
  }

  /**
   * Get processing fee for user's plan
   */
  async getProcessingFee(userId) {
    const subscription = await this.getUserSubscription(userId);
    
    if (!subscription) {
      return {
        percentage: 0,
        mandatory: false
      };
    }

    return {
      percentage: subscription.processing_fee_percentage || 0,
      mandatory: subscription.processing_fee_mandatory || false
    };
  }

  /**
   * Validate if user can create paid election
   */
  async canCreatePaidElection(userId) {
    const subscription = await this.getUserSubscription(userId);
    return subscription !== null;
  }
}

export default new SubscriptionCheckService();
//last workable codes
// import pool from '../config/database.js';
// import { FREE_TIER_LIMITS } from '../config/constants.js';

// class SubscriptionCheckService {
//   /**
//    * Get user's subscription details with payment info
//    */
//   async getUserSubscription(userId) {
//     const query = `
//       SELECT 
//         us.id as subscription_id,
//         us.user_id,
//         us.plan_id,
//         us.status,
//         us.start_date,
//         us.end_date,
//         us.auto_renew,
//         us.gateway_used,
//         sp.plan_name,
//         sp.plan_type,
//         sp.price,
//         sp.max_elections,
//         sp.max_voters_per_election,
//         sp.processing_fee_percentage,
//         sp.processing_fee_fixed_amount,
//         sp.processing_fee_mandatory,
//         sp.processing_fee_enabled,
//         sp.processing_fee_type,
//         sp.what_included,
//         sp.what_excluded,
//         sp.billing_cycle,
//         p.amount as paid_amount,
//         p.currency,
//         p.payment_method
//       FROM votteryy_user_subscriptions us
//       JOIN votteryy_subscription_plans sp ON us.plan_id = sp.id
//       LEFT JOIN LATERAL (
//         SELECT amount, currency, payment_method
//         FROM votteryy_payments
//         WHERE subscription_id = us.id
//           AND status = 'succeeded'
//         ORDER BY created_at DESC
//         LIMIT 1
//       ) p ON true
//       WHERE us.user_id = $1 
//         AND us.status = 'active'
//         AND us.end_date > NOW()
//       ORDER BY us.created_at DESC
//       LIMIT 1
//     `;

//     try {
//       const result = await pool.query(query, [userId]);
      
//       if (result.rows[0]) {
//         console.log('✅ Found active subscription:', {
//           plan_name: result.rows[0].plan_name,
//           plan_type: result.rows[0].plan_type,
//           price: result.rows[0].price,
//           paid_amount: result.rows[0].paid_amount,
//           processing_fee: result.rows[0].processing_fee_percentage,
//           max_elections: result.rows[0].max_elections
//         });
//       } else {
//         console.log('❌ No active subscription found for userId:', userId);
//       }
      
//       return result.rows[0] || null;
//     } catch (error) {
//       console.error('Error fetching subscription:', error);
//       return null;
//     }
//   }

//   /**
//    * Count user's elections (handles missing table gracefully)
//    */
//   async getCurrentMonthElectionCount(userId) {
//     try {
//       const currentMonthStart = new Date();
//       currentMonthStart.setDate(1);
//       currentMonthStart.setHours(0, 0, 0, 0);

//       // Check if table exists first
//       const tableCheckQuery = `
//         SELECT EXISTS (
//           SELECT FROM information_schema.tables 
//           WHERE table_name = 'votteryy_elections'
//         );
//       `;
      
//       const tableExists = await pool.query(tableCheckQuery);
      
//       if (!tableExists.rows[0].exists) {
//         console.log('⚠️ Elections table does not exist yet, returning 0');
//         return 0;
//       }

//       // Try to count elections
//       const query = `
//         SELECT COUNT(*) as total
//         FROM votteryy_elections
//         WHERE creator_id = $1 
//           AND created_at >= $2
//       `;
      
//       const result = await pool.query(query, [userId, currentMonthStart]);
//       console.log('📊 Elections count this month:', result.rows[0].total);
//       return parseInt(result.rows[0].total);
      
//     } catch (error) {
//       // If any error (column doesn't exist, etc), return 0
//       console.log('⚠️ Could not count elections (table/column may not exist):', error.message);
//       return 0;
//     }
//   }

//   /**
//    * Parse features safely from database
//    */
//   parseFeatures(featuresData) {
//     if (!featuresData) {
//       return [];
//     }

//     if (Array.isArray(featuresData)) {
//       return featuresData;
//     }

//     if (typeof featuresData === 'string') {
//       try {
//         const parsed = JSON.parse(featuresData);
//         return Array.isArray(parsed) ? parsed : [featuresData];
//       } catch (e) {
//         // Plain text, split by delimiters
//         return featuresData
//           .split(/[,\n;]/)
//           .map(f => f.trim())
//           .filter(f => f.length > 0);
//       }
//     }

//     return [];
//   }

//   /**
//    * Check eligibility for election creation
//    */
//   async checkEligibility(userId, isSubscribed = false) {
//     try {
//       console.log('🎯 Checking eligibility for userId:', userId);
      
//       const subscription = await this.getUserSubscription(userId);
//       const currentCount = await this.getCurrentMonthElectionCount(userId);

//       // USER HAS ACTIVE SUBSCRIPTION
//       if (subscription) {
//         console.log('✅ User has active subscription:', subscription.plan_name);
        
//         const maxElections = subscription.max_elections;
//         const hasLimit = maxElections !== null && maxElections !== undefined;
        
//         let canCreate = true;
//         let remaining = 'Unlimited';
//         let message = `You have full access with your ${subscription.plan_name}`;

//         if (hasLimit) {
//           remaining = maxElections - currentCount;
//           canCreate = remaining > 0;
//           message = canCreate 
//             ? `You can create ${remaining} more elections with your ${subscription.plan_name}`
//             : `${subscription.plan_name} limit of ${maxElections} elections reached`;
//         }

//         // Determine processing fee
//         let processingFee = 0;
//         if (subscription.processing_fee_enabled) {
//           if (subscription.processing_fee_type === 'percentage' && subscription.processing_fee_percentage) {
//             processingFee = parseFloat(subscription.processing_fee_percentage);
//           } else if (subscription.processing_fee_type === 'fixed' && subscription.processing_fee_fixed_amount) {
//             processingFee = parseFloat(subscription.processing_fee_fixed_amount);
//           } else if (subscription.processing_fee_percentage) {
//             processingFee = parseFloat(subscription.processing_fee_percentage);
//           }
//         }

//         return {
//           canCreate,
//           subscriptionType: subscription.plan_type,
//           planName: subscription.plan_name,
//           billingCycle: subscription.billing_cycle,
//           amount: subscription.paid_amount || subscription.price,
//           currency: subscription.currency || 'USD',
//           currentElectionsCount: currentCount,
//           maxElections: hasLimit ? maxElections : 'Unlimited',
//           remainingElections: remaining,
//           canCreatePaidElections: true,
//           processingFeePercentage: processingFee,
//           processingFeeMandatory: subscription.processing_fee_mandatory || false,
//           maxVotersPerElection: subscription.max_voters_per_election || 'Unlimited',
//           features: this.parseFeatures(subscription.what_included),
//           gatewayUsed: subscription.gateway_used,
//           message
//         };
//       }

//       // FREE USER (NO SUBSCRIPTION)
//       console.log('ℹ️ User has no active subscription, using free tier');
      
//       const remaining = FREE_TIER_LIMITS.MAX_ELECTIONS_PER_MONTH - currentCount;
      
//       return {
//         canCreate: remaining > 0,
//         subscriptionType: 'Free',
//         planName: 'Free Plan',
//         billingCycle: 'N/A',
//         amount: 0,
//         currency: 'USD',
//         currentElectionsCount: currentCount,
//         maxElections: FREE_TIER_LIMITS.MAX_ELECTIONS_PER_MONTH,
//         remainingElections: Math.max(0, remaining),
//         canCreatePaidElections: false,
//         processingFeePercentage: 0,
//         processingFeeMandatory: false,
//         maxVotersPerElection: FREE_TIER_LIMITS.MAX_VOTERS_PER_ELECTION,
//         features: FREE_TIER_LIMITS.FEATURES,
//         gatewayUsed: null,
//         message: remaining > 0 
//           ? `You can create ${remaining} more elections with your Free plan`
//           : 'Free tier limit reached. Please upgrade to create more elections.'
//       };

//     } catch (error) {
//       console.error('❌ Error checking eligibility:', error);
//       throw error;
//     }
//   }

//   /**
//    * Get processing fee for user's plan
//    */
//   async getProcessingFee(userId) {
//     const subscription = await this.getUserSubscription(userId);
    
//     if (!subscription || !subscription.processing_fee_enabled) {
//       return {
//         percentage: 0,
//         fixed: 0,
//         type: 'none',
//         mandatory: false
//       };
//     }

//     return {
//       percentage: parseFloat(subscription.processing_fee_percentage || 0),
//       fixed: parseFloat(subscription.processing_fee_fixed_amount || 0),
//       type: subscription.processing_fee_type || 'percentage',
//       mandatory: subscription.processing_fee_mandatory || false
//     };
//   }

//   /**
//    * Validate if user can create paid election
//    */
//   async canCreatePaidElection(userId) {
//     const subscription = await this.getUserSubscription(userId);
//     return subscription !== null;
//   }
// }

// export default new SubscriptionCheckService();