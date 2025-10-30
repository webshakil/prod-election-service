import { AppError } from '../utils/errorHandler.js';
import { HTTP_STATUS, ERROR_MESSAGES } from '../config/constants.js';

/**
 * User data will come from frontend localStorage in request body or headers
 * Format: { userId, email, roles, subscriptionType, isSubscribed }
 * NO TOKEN HANDLING - Kong gateway will handle that later
 */
export const extractUserData = (req, res, next) => {
  try {
    // Check in custom header first
    let userData = req.headers['x-user-data'];
    
    if (userData) {
      // Parse if it's a JSON string
      userData = typeof userData === 'string' ? JSON.parse(userData) : userData;
    } else if (req.body.userData) {
      // Check in request body
      userData = req.body.userData;
    }

    if (!userData || !userData.userId) {
      throw new AppError(ERROR_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED);
    }

    // Attach user data to request
    req.user = {
      userId: userData.userId,
      //userId: userData.id,
      email: userData.email,
      phone: userData.phone || null,
      username: userData.username || null,
      roles: userData.roles || ['Voter'],
      subscriptionType: userData.subscriptionType || 'Free',
      isSubscribed: userData.isSubscribed || false
    };

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      next(new AppError(ERROR_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED));
    }
  }
};

/**
 * Determine creator type based on roles
 */
export const determineCreatorType = (req, res, next) => {
  const roles = req.user.roles || [];
  
  let creatorType = 'individual';
  
  // Check for Content Creator roles
  if (roles.includes('Content_Creator') || roles.includes('Content_Creator_Subscribed')) {
    creatorType = 'content_creator';
  } 
  // Check for Organization roles
  else if (
    roles.includes('Organization_Owner') || 
    roles.includes('Organization_Manager') ||
    roles.includes('Organization_Creator') ||
    roles.includes('Organization_Team_Member')
  ) {
    creatorType = 'organization';
  }

  req.user.creatorType = creatorType;
  next();
};

/**
 * Role-based access control middleware
 * Based on Vottery role hierarchy from documentation
 */

// ============================================
// ADMIN ROLES (Platform Level)
// ============================================

/**
 * Manager: Highest level - Full platform control
 * Can assign/remove admin roles, system configuration
 */
export const requireManager = (req, res, next) => {
  if (!req.user || !req.user.roles) {
    return next(new AppError(ERROR_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED));
  }

  if (req.user.roles.includes('Manager')) {
    return next();
  }

  return next(new AppError('Manager role required', HTTP_STATUS.FORBIDDEN));
};

/**
 * Admin: System administration
 * User management, content moderation
 */
export const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.roles) {
    return next(new AppError(ERROR_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED));
  }

  const adminRoles = ['Manager', 'Admin'];
  const hasAdminRole = req.user.roles.some(role => adminRoles.includes(role));

  if (hasAdminRole) {
    return next();
  }

  return next(new AppError('Admin role required', HTTP_STATUS.FORBIDDEN));
};

/**
 * Moderator: Content moderation and community management
 */
export const requireModerator = (req, res, next) => {
  if (!req.user || !req.user.roles) {
    return next(new AppError(ERROR_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED));
  }

  const moderatorRoles = ['Manager', 'Admin', 'Moderator'];
  const hasModeratorRole = req.user.roles.some(role => moderatorRoles.includes(role));

  if (hasModeratorRole) {
    return next();
  }

  return next(new AppError('Moderator role required', HTTP_STATUS.FORBIDDEN));
};

/**
 * Auditor: Audit log access and compliance checking
 */
export const requireAuditor = (req, res, next) => {
  if (!req.user || !req.user.roles) {
    return next(new AppError(ERROR_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED));
  }

  const auditorRoles = ['Manager', 'Admin', 'Auditor'];
  const hasAuditorRole = req.user.roles.some(role => auditorRoles.includes(role));

  if (hasAuditorRole) {
    return next();
  }

  return next(new AppError('Auditor role required', HTTP_STATUS.FORBIDDEN));
};

// ============================================
// USER ROLES (Individual Level)
// ============================================

/**
 * Voter: Base role - Always present, always free
 * Can vote, verify votes, participate in lotteries
 */
export const requireVoter = (req, res, next) => {
  if (!req.user || !req.user.roles) {
    return next(new AppError(ERROR_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED));
  }

  // Everyone should have Voter role
  if (req.user.roles.includes('Voter')) {
    return next();
  }

  return next(new AppError('Voter role required', HTTP_STATUS.FORBIDDEN));
};

/**
 * Individual Creator (Free or Subscribed)
 * Can create elections based on subscription tier
 */
export const requireCreator = (req, res, next) => {
  if (!req.user || !req.user.roles) {
    return next(new AppError(ERROR_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED));
  }

  const creatorRoles = [
    'Creator_Free',
    'Creator_Subscribed',
    'Individual_Creator',
    'Content_Creator',
    'Content_Creator_Subscribed'
  ];

  const hasCreatorRole = req.user.roles.some(role => creatorRoles.includes(role));

  if (hasCreatorRole) {
    return next();
  }

  return next(new AppError('Creator role required', HTTP_STATUS.FORBIDDEN));
};

/**
 * Subscribed Creator: Paid subscription required
 * Unlimited elections, custom branding, monetization
 */
export const requireSubscribedCreator = (req, res, next) => {
  if (!req.user || !req.user.roles) {
    return next(new AppError(ERROR_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED));
  }

  const subscribedRoles = [
    'Creator_Subscribed',
    'Content_Creator_Subscribed'
  ];

  const hasSubscribedRole = req.user.roles.some(role => subscribedRoles.includes(role));

  if (hasSubscribedRole || req.user.isSubscribed) {
    return next();
  }

  return next(new AppError('Active subscription required', HTTP_STATUS.FORBIDDEN));
};

/**
 * Content Creator: Special subscription type
 * All Creator features + content integration tools
 */
export const requireContentCreator = (req, res, next) => {
  if (!req.user || !req.user.roles) {
    return next(new AppError(ERROR_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED));
  }

  const contentCreatorRoles = ['Content_Creator', 'Content_Creator_Subscribed'];
  const hasContentCreatorRole = req.user.roles.some(role => contentCreatorRoles.includes(role));

  if (hasContentCreatorRole) {
    return next();
  }

  return next(new AppError('Content Creator role required', HTTP_STATUS.FORBIDDEN));
};

// ============================================
// ORGANIZATION ROLES
// ============================================

/**
 * Organization Creator: Can create organization elections
 */
export const requireOrganizationCreator = (req, res, next) => {
  if (!req.user || !req.user.roles) {
    return next(new AppError(ERROR_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED));
  }

  const orgRoles = [
    'Organization_Creator',
    'Organization_Owner',
    'Organization_Manager'
  ];

  const hasOrgRole = req.user.roles.some(role => orgRoles.includes(role));

  if (hasOrgRole) {
    return next();
  }

  return next(new AppError('Organization role required', HTTP_STATUS.FORBIDDEN));
};

/**
 * Organization Owner: Full organization control
 * Can manage team, permissions, finances
 */
export const requireOrganizationOwner = (req, res, next) => {
  if (!req.user || !req.user.roles) {
    return next(new AppError(ERROR_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED));
  }

  if (req.user.roles.includes('Organization_Owner')) {
    return next();
  }

  return next(new AppError('Organization Owner role required', HTTP_STATUS.FORBIDDEN));
};

/**
 * Organization Manager: Team management
 * Can manage members, limited financial access
 */
export const requireOrganizationManager = (req, res, next) => {
  if (!req.user || !req.user.roles) {
    return next(new AppError(ERROR_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED));
  }

  const managerRoles = ['Organization_Owner', 'Organization_Manager'];
  const hasManagerRole = req.user.roles.some(role => managerRoles.includes(role));

  if (hasManagerRole) {
    return next();
  }

  return next(new AppError('Organization Manager role required', HTTP_STATUS.FORBIDDEN));
};

/**
 * Sponsor: Can create prize pools and fund elections
 * Independent role, can be combined with any other role
 */
export const requireSponsor = (req, res, next) => {
  if (!req.user || !req.user.roles) {
    return next(new AppError(ERROR_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED));
  }

  if (req.user.roles.includes('Sponsor')) {
    return next();
  }

  return next(new AppError('Sponsor role required', HTTP_STATUS.FORBIDDEN));
};

// ============================================
// FLEXIBLE ROLE CHECKING
// ============================================

/**
 * Check if user has ANY of the specified roles
 */
export const requireAnyRole = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user || !req.user.roles) {
      return next(new AppError(ERROR_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED));
    }

    const userRoles = req.user.roles || [];
    const hasRole = allowedRoles.some(role => userRoles.includes(role));

    if (hasRole) {
      return next();
    }

    return next(new AppError(`One of these roles required: ${allowedRoles.join(', ')}`, HTTP_STATUS.FORBIDDEN));
  };
};

/**
 * Check if user has ALL of the specified roles
 */
export const requireAllRoles = (requiredRoles = []) => {
  return (req, res, next) => {
    if (!req.user || !req.user.roles) {
      return next(new AppError(ERROR_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED));
    }

    const userRoles = req.user.roles || [];
    const hasAllRoles = requiredRoles.every(role => userRoles.includes(role));

    if (hasAllRoles) {
      return next();
    }

    return next(new AppError(`All of these roles required: ${requiredRoles.join(', ')}`, HTTP_STATUS.FORBIDDEN));
  };
};

/**
 * Check if user has specific role
 */
export const hasRole = (req, roleName) => {
  if (!req.user || !req.user.roles) {
    return false;
  }
  return req.user.roles.includes(roleName);
};

/**
 * Check if user is subscribed
 */
export const isSubscribed = (req) => {
  return req.user && req.user.isSubscribed === true;
};

/**
 * Check if user can create elections
 */
export const canCreateElections = (req) => {
  if (!req.user || !req.user.roles) {
    return false;
  }

  const creatorRoles = [
    'Creator_Free',
    'Creator_Subscribed',
    'Individual_Creator',
    'Content_Creator',
    'Content_Creator_Subscribed',
    'Organization_Creator',
    'Organization_Owner',
    'Organization_Manager'
  ];

  return req.user.roles.some(role => creatorRoles.includes(role));
};

export default {
  extractUserData,
  determineCreatorType,
  requireManager,
  requireAdmin,
  requireModerator,
  requireAuditor,
  requireVoter,
  requireCreator,
  requireSubscribedCreator,
  requireContentCreator,
  requireOrganizationCreator,
  requireOrganizationOwner,
  requireOrganizationManager,
  requireSponsor,
  requireAnyRole,
  requireAllRoles,
  hasRole,
  isSubscribed,
  canCreateElections
};