import slugify from 'slugify';

export const generateSlug = (text) => {
  return slugify(text, {
    lower: true,
    strict: true,
    remove: /[*+~.()'"!:@]/g
  });
};

export const generateUniqueSlug = (text, suffix = '') => {
  const baseSlug = generateSlug(text);
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  return suffix ? `${baseSlug}-${suffix}` : `${baseSlug}-${randomStr}-${timestamp}`;
};

export const formatResponse = (success, data = null, message = '') => {
  return {
    success,
    message,
    data,
    timestamp: new Date().toISOString()
  };
};

export const validateDates = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const now = new Date();

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { valid: false, message: 'Invalid date format' };
  }

  if (end <= start) {
    return { valid: false, message: 'End date must be after start date' };
  }

  if (start < now) {
    return { valid: false, message: 'Start date cannot be in the past' };
  }

  return { valid: true };
};

export const sanitizeInput = (input) => {
  if (typeof input === 'string') {
    return input.trim().replace(/[<>]/g, '');
  }
  return input;
};

export const paginate = (page = 1, limit = 10) => {
  const offset = (page - 1) * limit;
  return { limit, offset };
};

export const calculatePaginationMeta = (total, page, limit) => {
  return {
    total,
    page: parseInt(page),
    limit: parseInt(limit),
    totalPages: Math.ceil(total / limit),
    hasNext: page * limit < total,
    hasPrev: page > 1
  };
};

export const getRegionByCountry = (countryCode) => {
  const regions = {
    'US': 'region_1_us_canada',
    'CA': 'region_1_us_canada',
    'GB': 'region_2_western_europe',
    'FR': 'region_2_western_europe',
    'DE': 'region_2_western_europe',
    'RU': 'region_3_eastern_europe',
    'PL': 'region_3_eastern_europe',
    'ZA': 'region_4_africa',
    'NG': 'region_4_africa',
    'BR': 'region_5_latin_america',
    'MX': 'region_5_latin_america',
    'IN': 'region_6_middle_east_asia',
    'BD': 'region_6_middle_east_asia',
    'PK': 'region_6_middle_east_asia',
    'AU': 'region_7_australasia',
    'NZ': 'region_7_australasia',
    'JP': 'region_7_australasia',
    'CN': 'region_8_china',
    'HK': 'region_8_china'
  };

  return regions[countryCode] || 'region_6_middle_east_asia';
};

export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidPhone = (phone) => {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  return phoneRegex.test(phone);
};

export const generateShareableUrl = (slug, baseUrl) => {
  return `${baseUrl}/vote/${slug}`;
};

export const formatCurrency = (amount, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency
  }).format(amount);
};

export default {
  generateSlug,
  generateUniqueSlug,
  formatResponse,
  validateDates,
  sanitizeInput,
  paginate,
  calculatePaginationMeta,
  getRegionByCountry,
  isValidEmail,
  isValidPhone,
  generateShareableUrl,
  formatCurrency
};