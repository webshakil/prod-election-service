import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { AppError } from '../utils/errorHandler.js';
import { HTTP_STATUS } from '../config/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure upload directories exist
const uploadDirs = ['images', 'logos', 'videos'];
uploadDirs.forEach(dir => {
  const dirPath = path.join(__dirname, '../../uploads', dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = 'images';
    
    if (file.fieldname === 'logo') {
      folder = 'logos';
    } else if (file.mimetype.startsWith('video/')) {
      folder = 'videos';
    }
    
    cb(null, path.join(__dirname, '../../uploads', folder));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);
    cb(null, `${baseName}-${uniqueSuffix}${ext}`);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/avi'];
  
  if (file.mimetype.startsWith('image/')) {
    if (allowedImageTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError('Invalid image type. Only JPEG, PNG, and WebP are allowed.', HTTP_STATUS.BAD_REQUEST), false);
    }
  } else if (file.mimetype.startsWith('video/')) {
    if (allowedVideoTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError('Invalid video type. Only MP4, WebM, and AVI are allowed.', HTTP_STATUS.BAD_REQUEST), false);
    }
  } else {
    cb(new AppError('Invalid file type. Only images and videos are allowed.', HTTP_STATUS.BAD_REQUEST), false);
  }
};

// Multer configuration
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB default
  }
});

// Upload middleware for different scenarios
export const uploadSingle = (fieldName) => {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError('File size too large. Maximum size is 10MB.', HTTP_STATUS.BAD_REQUEST));
        }
        return next(new AppError(err.message, HTTP_STATUS.BAD_REQUEST));
      } else if (err) {
        return next(err);
      }
      next();
    });
  };
};

export const uploadMultiple = (fields) => {
  return (req, res, next) => {
    upload.fields(fields)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError('File size too large. Maximum size is 10MB.', HTTP_STATUS.BAD_REQUEST));
        }
        return next(new AppError(err.message, HTTP_STATUS.BAD_REQUEST));
      } else if (err) {
        return next(err);
      }
      next();
    });
  };
};

// Election media upload configuration
export const uploadElectionMedia = uploadMultiple([
  { name: 'topic_image', maxCount: 1 },
  { name: 'topic_video', maxCount: 1 },
  { name: 'logo', maxCount: 1 }
]);

// Question image upload
export const uploadQuestionImage = uploadSingle('question_image');

// Option image upload
export const uploadOptionImage = uploadSingle('option_image');

// Organization logo upload
export const uploadOrganizationLogo = uploadSingle('logo');

// Helper function to get file URL
export const getFileUrl = (filename, type = 'images') => {
  if (!filename) return null;
  const baseUrl = process.env.BACKEND_URL || 'http://localhost:3005';
  return `${baseUrl}/uploads/${type}/${filename}`;
};

// Helper function to delete file
export const deleteFile = (filepath) => {
  try {
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      return true;
    }
  } catch (error) {
    console.error('Error deleting file:', error);
  }
  return false;
};

export default {
  uploadSingle,
  uploadMultiple,
  uploadElectionMedia,
  uploadQuestionImage,
  uploadOptionImage,
  uploadOrganizationLogo,
  getFileUrl,
  deleteFile
};