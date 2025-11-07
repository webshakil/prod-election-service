export const CREATOR_TYPES = {
  INDIVIDUAL: 'individual',
  ORGANIZATION: 'organization',
  CONTENT_CREATOR: 'content_creator'
};

export const VOTING_TYPES = {
  PLURALITY: 'plurality',
  RANKED_CHOICE: 'ranked_choice',
  APPROVAL: 'approval'
};

export const PERMISSION_TYPES = {
  PUBLIC: 'public',
  COUNTRY_SPECIFIC: 'country_specific',
  ORGANIZATION_ONLY: 'organization_only'
};

export const PRICING_TYPES = {
  FREE: 'free',
  GENERAL_FEE: 'general_fee',
  REGIONAL_FEE: 'regional_fee'
};

export const ELECTION_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

export const QUESTION_TYPES = {
  MULTIPLE_CHOICE: 'multiple_choice',
  OPEN_TEXT: 'open_text',
  IMAGE_BASED: 'image_based'
};

export const ORGANIZATION_ROLES = {
  OWNER: 'owner',
  MANAGER: 'manager',
  MEMBER: 'member',
  VIEWER: 'viewer'
};

export const SUBSCRIPTION_TYPES = {
  FREE: 'Free',
  MONTHLY: 'Monthly',
  ANNUAL: 'Annual',
  CONTENT_CREATOR: 'Content Creator',
  ORGANIZATION: 'Organization'
};

export const REGIONAL_ZONES = {
  REGION_1: {
    code: 'region_1_us_canada',
    name: 'US & Canada',
    countries: ['US', 'CA']
  },
  REGION_2: {
    code: 'region_2_western_europe',
    name: 'Western Europe',
    countries: ['GB', 'FR', 'DE', 'IT', 'ES', 'NL', 'BE', 'CH', 'AT', 'SE', 'NO', 'DK', 'FI']
  },
  REGION_3: {
    code: 'region_3_eastern_europe',
    name: 'Eastern Europe & Russia',
    countries: ['RU', 'PL', 'UA', 'CZ', 'RO', 'HU', 'GR', 'BG']
  },
  REGION_4: {
    code: 'region_4_africa',
    name: 'Africa',
    countries: ['ZA', 'NG', 'EG', 'KE', 'GH', 'ET', 'TZ', 'UG', 'DZ', 'MA']
  },
  REGION_5: {
    code: 'region_5_latin_america',
    name: 'Latin America & Caribbean',
    countries: ['BR', 'MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'CU', 'DO']
  },
  REGION_6: {
    code: 'region_6_middle_east_asia',
    name: 'Middle East, Asia, Eurasia, Melanesia, Micronesia & Polynesia',
    countries: ['IN', 'PK', 'BD', 'ID', 'PH', 'VN', 'TH', 'MY', 'SA', 'AE', 'TR', 'IR', 'IQ']
  },
  REGION_7: {
    code: 'region_7_australasia',
    name: 'Australasia (Australia, NZ, Taiwan, South Korea, Japan, Singapore)',
    countries: ['AU', 'NZ', 'TW', 'KR', 'JP', 'SG']
  },
  REGION_8: {
    code: 'region_8_china',
    name: 'China, Macau & Hong Kong',
    countries: ['CN', 'HK', 'MO']
  }
};

export const AUTHENTICATION_METHODS = {
  PASSKEY: 'passkey',
  OAUTH: 'oauth',
  MAGIC_LINK: 'magic_link',
  EMAIL_PASSWORD: 'email_password'
};

export const FREE_TIER_LIMITS = {
  MAX_ELECTIONS_PER_MONTH: 5,
  MAX_VOTERS_PER_ELECTION: 100,
  FEATURES: [
    'Basic voting',
    'Up to 5 elections/month',
    'Limited to 100 voters',
    'Basic analytics',
    'No monetization'
  ]
};

export const PAID_TIER_FEATURES = {
  INDIVIDUAL: [
    'Unlimited elections',
    'Unlimited voters',
    'Custom branding',
    'Participation fees',
    'Gamified Election Prices',
    'Advanced analytics',
    'Regional pricing',
    'Biometric voting',
    'Multi-language support'
  ],
  CONTENT_CREATOR: [
    'All Individual features',
    'Vottery icon embedding',
    'Branded voting URLs',
    'One-time voter links',
    'Revenue tracking',
    'Content integration tools'
  ],
  ORGANIZATION: [
    'Team management',
    'Role assignments',
    'Organization branding',
    'Multi-member access',
    'Advanced permissions',
    'Organization analytics'
  ]
};

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500
};

export const ERROR_MESSAGES = {
  UNAUTHORIZED: 'Unauthorized access',
  FORBIDDEN: 'You do not have permission to perform this action',
  NOT_FOUND: 'Resource not found',
  INVALID_INPUT: 'Invalid input data',
  SUBSCRIPTION_REQUIRED: 'Active subscription required',
  ELECTION_LIMIT_REACHED: 'Election creation limit reached for your plan',
  INVALID_DATES: 'End date must be after start date',
  SLUG_EXISTS: 'This slug is already taken',
  DRAFT_NOT_FOUND: 'Draft not found',
  ELECTION_NOT_FOUND: 'Election not found'
};
export const LOTTERY_REWARD_TYPES = {
  MONETARY: 'monetary',
  NON_MONETARY: 'non_monetary',
  PROJECTED_REVENUE: 'projected_revenue'
};

export default {
  CREATOR_TYPES,
  VOTING_TYPES,
  PERMISSION_TYPES,
  PRICING_TYPES,
  ELECTION_STATUS,
  QUESTION_TYPES,
  ORGANIZATION_ROLES,
  SUBSCRIPTION_TYPES,
  REGIONAL_ZONES,
  AUTHENTICATION_METHODS,
  FREE_TIER_LIMITS,
  PAID_TIER_FEATURES,
  HTTP_STATUS,
  ERROR_MESSAGES,
  LOTTERY_REWARD_TYPES
};
// export const CREATOR_TYPES = {
//   INDIVIDUAL: 'individual',
//   ORGANIZATION: 'organization',
//   CONTENT_CREATOR: 'content_creator'
// };

// export const VOTING_TYPES = {
//   PLURALITY: 'plurality',
//   RANKED_CHOICE: 'ranked_choice',
//   APPROVAL: 'approval'
// };

// export const PERMISSION_TYPES = {
//   PUBLIC: 'public',
//   COUNTRY_SPECIFIC: 'country_specific',
//   ORGANIZATION_ONLY: 'organization_only'
// };

// export const PRICING_TYPES = {
//   FREE: 'free',
//   GENERAL_FEE: 'general_fee',
//   REGIONAL_FEE: 'regional_fee'
// };

// export const ELECTION_STATUS = {
//   DRAFT: 'draft',
//   PUBLISHED: 'published',
//   ACTIVE: 'active',
//   COMPLETED: 'completed',
//   CANCELLED: 'cancelled'
// };

// export const QUESTION_TYPES = {
//   MULTIPLE_CHOICE: 'multiple_choice',
//   OPEN_TEXT: 'open_text',
//   IMAGE_BASED: 'image_based'
// };

// export const ORGANIZATION_ROLES = {
//   OWNER: 'owner',
//   MANAGER: 'manager',
//   MEMBER: 'member',
//   VIEWER: 'viewer'
// };

// export const SUBSCRIPTION_TYPES = {
//   FREE: 'Free',
//   MONTHLY: 'Monthly',
//   ANNUAL: 'Annual',
//   CONTENT_CREATOR: 'Content Creator',
//   ORGANIZATION: 'Organization'
// };

// export const REGIONAL_ZONES = {
//   REGION_1: {
//     code: 'region_1_us_canada',
//     name: 'US & Canada',
//     countries: ['US', 'CA']
//   },
//   REGION_2: {
//     code: 'region_2_western_europe',
//     name: 'Western Europe',
//     countries: ['GB', 'FR', 'DE', 'IT', 'ES', 'NL', 'BE', 'CH', 'AT', 'SE', 'NO', 'DK', 'FI']
//   },
//   REGION_3: {
//     code: 'region_3_eastern_europe',
//     name: 'Eastern Europe & Russia',
//     countries: ['RU', 'PL', 'UA', 'CZ', 'RO', 'HU', 'GR', 'BG']
//   },
//   REGION_4: {
//     code: 'region_4_africa',
//     name: 'Africa',
//     countries: ['ZA', 'NG', 'EG', 'KE', 'GH', 'ET', 'TZ', 'UG', 'DZ', 'MA']
//   },
//   REGION_5: {
//     code: 'region_5_latin_america',
//     name: 'Latin America & Caribbean',
//     countries: ['BR', 'MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'CU', 'DO']
//   },
//   REGION_6: {
//     code: 'region_6_middle_east_asia',
//     name: 'Middle East, Asia, Eurasia, Melanesia, Micronesia & Polynesia',
//     countries: ['IN', 'PK', 'BD', 'ID', 'PH', 'VN', 'TH', 'MY', 'SA', 'AE', 'TR', 'IR', 'IQ']
//   },
//   REGION_7: {
//     code: 'region_7_australasia',
//     name: 'Australasia (Australia, NZ, Taiwan, South Korea, Japan, Singapore)',
//     countries: ['AU', 'NZ', 'TW', 'KR', 'JP', 'SG']
//   },
//   REGION_8: {
//     code: 'region_8_china',
//     name: 'China, Macau & Hong Kong',
//     countries: ['CN', 'HK', 'MO']
//   }
// };

// export const AUTHENTICATION_METHODS = {
//   PASSKEY: 'passkey',
//   OAUTH: 'oauth',
//   MAGIC_LINK: 'magic_link',
//   EMAIL_PASSWORD: 'email_password'
// };

// export const FREE_TIER_LIMITS = {
//   MAX_ELECTIONS_PER_MONTH: 5,
//   MAX_VOTERS_PER_ELECTION: 100,
//   FEATURES: [
//     'Basic voting',
//     'Up to 5 elections/month',
//     'Limited to 100 voters',
//     'Basic analytics',
//     'No monetization'
//   ]
// };

// export const PAID_TIER_FEATURES = {
//   INDIVIDUAL: [
//     'Unlimited elections',
//     'Unlimited voters',
//     'Custom branding',
//     'Participation fees',
//     'Gamify Prizes',
//     'Advanced analytics',
//     'Regional pricing',
//     'Biometric voting',
//     'Multi-language support'
//   ],
//   CONTENT_CREATOR: [
//     'All Individual features',
//     'Vottery icon embedding',
//     'Branded voting URLs',
//     'One-time voter links',
//     'Revenue tracking',
//     'Content integration tools'
//   ],
//   ORGANIZATION: [
//     'Team management',
//     'Role assignments',
//     'Organization branding',
//     'Multi-member access',
//     'Advanced permissions',
//     'Organization analytics'
//   ]
// };

// export const HTTP_STATUS = {
//   OK: 200,
//   CREATED: 201,
//   NO_CONTENT: 204,
//   BAD_REQUEST: 400,
//   UNAUTHORIZED: 401,
//   FORBIDDEN: 403,
//   NOT_FOUND: 404,
//   CONFLICT: 409,
//   UNPROCESSABLE_ENTITY: 422,
//   INTERNAL_SERVER_ERROR: 500
// };

// export const ERROR_MESSAGES = {
//   UNAUTHORIZED: 'Unauthorized access',
//   FORBIDDEN: 'You do not have permission to perform this action',
//   NOT_FOUND: 'Resource not found',
//   INVALID_INPUT: 'Invalid input data',
//   SUBSCRIPTION_REQUIRED: 'Active subscription required',
//   ELECTION_LIMIT_REACHED: 'Election creation limit reached for your plan',
//   INVALID_DATES: 'End date must be after start date',
//   SLUG_EXISTS: 'This slug is already taken',
//   DRAFT_NOT_FOUND: 'Draft not found',
//   ELECTION_NOT_FOUND: 'Election not found'
// };

// export default {
//   CREATOR_TYPES,
//   VOTING_TYPES,
//   PERMISSION_TYPES,
//   PRICING_TYPES,
//   ELECTION_STATUS,
//   QUESTION_TYPES,
//   ORGANIZATION_ROLES,
//   SUBSCRIPTION_TYPES,
//   REGIONAL_ZONES,
//   AUTHENTICATION_METHODS,
//   FREE_TIER_LIMITS,
//   PAID_TIER_FEATURES,
//   HTTP_STATUS,
//   ERROR_MESSAGES
// };