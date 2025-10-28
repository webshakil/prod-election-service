import { HTTP_STATUS } from '../config/constants.js';

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

const errorHandler = (err, req, res, next) => {
  let { statusCode, message } = err;

  if (!statusCode) statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
  if (!message) message = 'Something went wrong';

  const response = {
    success: false,
    statusCode,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  };

  console.error('Error:', err);

  res.status(statusCode).json(response);
};

const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export { AppError, errorHandler, asyncHandler };