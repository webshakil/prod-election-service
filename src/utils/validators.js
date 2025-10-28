import { body, param, query, validationResult } from 'express-validator';
import { HTTP_STATUS } from '../config/constants.js';

export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

export const draftValidation = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ min: 5, max: 500 })
    .withMessage('Title must be between 5 and 500 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage('Description must not exceed 5000 characters'),
  body('creator_type')
    .optional()
    .isIn(['individual', 'organization', 'content_creator'])
    .withMessage('Invalid creator type'),
  validate
];

export const electionValidation = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ min: 5, max: 500 })
    .withMessage('Title must be between 5 and 500 characters'),
  body('description')
    .optional()
    .trim(),
  body('start_date')
    .notEmpty()
    .withMessage('Start date is required')
    .isISO8601()
    .withMessage('Invalid start date format'),
  body('end_date')
    .notEmpty()
    .withMessage('End date is required')
    .isISO8601()
    .withMessage('Invalid end date format'),
  body('voting_type')
    .notEmpty()
    .withMessage('Voting type is required')
    .isIn(['plurality', 'ranked_choice', 'approval'])
    .withMessage('Invalid voting type'),
  body('permission_type')
    .notEmpty()
    .withMessage('Permission type is required')
    .isIn(['public', 'country_specific', 'organization_only'])
    .withMessage('Invalid permission type'),
  body('pricing_type')
    .optional()
    .isIn(['free', 'general_fee', 'regional_fee'])
    .withMessage('Invalid pricing type'),
  validate
];

export const questionValidation = [
  body('question_text')
    .trim()
    .notEmpty()
    .withMessage('Question text is required'),
  body('question_type')
    .notEmpty()
    .withMessage('Question type is required')
    .isIn(['multiple_choice', 'open_text', 'image_based'])
    .withMessage('Invalid question type'),
  body('question_order')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Question order must be a positive integer'),
  body('max_selections')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Max selections must be a positive integer'),
  validate
];

export const organizationValidation = [
  body('organization_name')
    .trim()
    .notEmpty()
    .withMessage('Organization name is required')
    .isLength({ min: 3, max: 255 })
    .withMessage('Organization name must be between 3 and 255 characters'),
  body('organization_type')
    .optional()
    .trim(),
  body('description')
    .optional()
    .trim(),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Invalid email address'),
  validate
];

export const idParamValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid ID parameter'),
  validate
];

export const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  validate
];

export default {
  validate,
  draftValidation,
  electionValidation,
  questionValidation,
  organizationValidation,
  idParamValidation,
  paginationValidation
};