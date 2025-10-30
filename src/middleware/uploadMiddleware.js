import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { v2 as cloudinary } from 'cloudinary';
import { AppError } from '../utils/errorHandler.js';
import { HTTP_STATUS } from '../config/constants.js';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Storage for election images
const imageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'vottery/elections/images',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1200, height: 800, crop: 'limit', quality: 'auto' }]
  }
});

// Storage for videos
const videoStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'vottery/elections/videos',
    allowed_formats: ['mp4', 'webm', 'avi'],
    resource_type: 'video'
  }
});

// Storage for logos
const logoStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'vottery/elections/logos',
    allowed_formats: ['jpg', 'jpeg', 'png', 'svg'],
    transformation: [{ width: 300, height: 300, crop: 'limit', quality: 'auto' }]
  }
});

// Storage for question images
const questionStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'vottery/questions',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 800, height: 600, crop: 'limit', quality: 'auto' }]
  }
});

// Storage for option images
const optionStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'vottery/options',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 400, height: 400, crop: 'limit', quality: 'auto' }]
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

// Custom storage selector for election media
const electionMediaStorage = (req, file, cb) => {
  if (file.fieldname === 'logo') {
    cb(null, logoStorage);
  } else if (file.mimetype.startsWith('video/')) {
    cb(null, videoStorage);
  } else {
    cb(null, imageStorage);
  }
};

// Upload middleware for different scenarios
export const uploadSingle = (fieldName, storage) => {
  return (req, res, next) => {
    const upload = multer({
      storage: storage,
      fileFilter: fileFilter,
      limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
      }
    }).single(fieldName);

    upload(req, res, (err) => {
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

export const uploadMultiple = (fields, storageMap) => {
  return (req, res, next) => {
    const upload = multer({
      storage: multer.diskStorage({
        filename: (req, file, cb) => cb(null, file.originalname)
      }),
      fileFilter: fileFilter,
      limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
      }
    }).fields(fields);

    upload(req, res, async (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError('File size too large. Maximum size is 10MB.', HTTP_STATUS.BAD_REQUEST));
        }
        return next(new AppError(err.message, HTTP_STATUS.BAD_REQUEST));
      } else if (err) {
        return next(err);
      }

      // Upload files to Cloudinary
      if (req.files) {
        try {
          for (const fieldName in req.files) {
            const files = req.files[fieldName];
            const uploadedFiles = [];

            for (const file of files) {
              let folder = 'vottery/elections/images';
              let resourceType = 'image';

              if (fieldName === 'logo') {
                folder = 'vottery/elections/logos';
              } else if (file.mimetype.startsWith('video/')) {
                folder = 'vottery/elections/videos';
                resourceType = 'video';
              }

              const result = await cloudinary.uploader.upload(file.path, {
                folder: folder,
                resource_type: resourceType
              });

              uploadedFiles.push({
                path: result.secure_url,
                filename: result.public_id
              });
            }

            req.files[fieldName] = uploadedFiles;
          }
        } catch (uploadError) {
          return next(new AppError('Failed to upload files to Cloudinary', HTTP_STATUS.INTERNAL_SERVER_ERROR));
        }
      }

      next();
    });
  };
};

// Election media upload configuration
export const uploadElectionMedia = (req, res, next) => {
  const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: fileFilter,
    limits: {
      fileSize: 10 * 1024 * 1024 // 10MB
    }
  }).fields([
    { name: 'topic_image', maxCount: 1 },
    { name: 'topic_video', maxCount: 1 },
    { name: 'logo', maxCount: 1 }
  ]);

  upload(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError('File size too large. Maximum size is 10MB.', HTTP_STATUS.BAD_REQUEST));
      }
      return next(new AppError(err.message, HTTP_STATUS.BAD_REQUEST));
    } else if (err) {
      return next(err);
    }

    // Upload to Cloudinary
    if (req.files) {
      try {
        const uploadPromises = [];

        if (req.files.topic_image) {
          uploadPromises.push(
            new Promise((resolve, reject) => {
              cloudinary.uploader.upload_stream(
                { folder: 'vottery/elections/images' },
                (error, result) => {
                  if (error) reject(error);
                  else resolve({ field: 'topic_image', url: result.secure_url });
                }
              ).end(req.files.topic_image[0].buffer);
            })
          );
        }

        if (req.files.topic_video) {
          uploadPromises.push(
            new Promise((resolve, reject) => {
              cloudinary.uploader.upload_stream(
                { folder: 'vottery/elections/videos', resource_type: 'video' },
                (error, result) => {
                  if (error) reject(error);
                  else resolve({ field: 'topic_video', url: result.secure_url });
                }
              ).end(req.files.topic_video[0].buffer);
            })
          );
        }

        if (req.files.logo) {
          uploadPromises.push(
            new Promise((resolve, reject) => {
              cloudinary.uploader.upload_stream(
                { folder: 'vottery/elections/logos' },
                (error, result) => {
                  if (error) reject(error);
                  else resolve({ field: 'logo', url: result.secure_url });
                }
              ).end(req.files.logo[0].buffer);
            })
          );
        }

        const results = await Promise.all(uploadPromises);

        // Replace file objects with Cloudinary URLs
        results.forEach(({ field, url }) => {
          req.files[field] = [{ path: url }];
        });

      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        return next(new AppError('Failed to upload files to Cloudinary', HTTP_STATUS.INTERNAL_SERVER_ERROR));
      }
    }

    next();
  });
};

// Question image upload
export const uploadQuestionImage = (req, res, next) => {
  const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: fileFilter,
    limits: {
      fileSize: 5 * 1024 * 1024 // 5MB
    }
  }).single('question_image');

  upload(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError('File size too large. Maximum size is 5MB.', HTTP_STATUS.BAD_REQUEST));
      }
      return next(new AppError(err.message, HTTP_STATUS.BAD_REQUEST));
    } else if (err) {
      return next(err);
    }

    if (req.file) {
      try {
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { folder: 'vottery/questions' },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          ).end(req.file.buffer);
        });

        req.file.path = result.secure_url;
      } catch (uploadError) {
        return next(new AppError('Failed to upload image to Cloudinary', HTTP_STATUS.INTERNAL_SERVER_ERROR));
      }
    }

    next();
  });
};

// Option image upload
export const uploadOptionImage = (req, res, next) => {
  const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: fileFilter,
    limits: {
      fileSize: 3 * 1024 * 1024 // 3MB
    }
  }).single('option_image');

  upload(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError('File size too large. Maximum size is 3MB.', HTTP_STATUS.BAD_REQUEST));
      }
      return next(new AppError(err.message, HTTP_STATUS.BAD_REQUEST));
    } else if (err) {
      return next(err);
    }

    if (req.file) {
      try {
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { folder: 'vottery/options' },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          ).end(req.file.buffer);
        });

        req.file.path = result.secure_url;
      } catch (uploadError) {
        return next(new AppError('Failed to upload image to Cloudinary', HTTP_STATUS.INTERNAL_SERVER_ERROR));
      }
    }

    next();
  });
};

// Organization logo upload
export const uploadOrganizationLogo = (req, res, next) => {
  const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: fileFilter,
    limits: {
      fileSize: 3 * 1024 * 1024 // 3MB
    }
  }).single('logo');

  upload(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError('File size too large. Maximum size is 3MB.', HTTP_STATUS.BAD_REQUEST));
      }
      return next(new AppError(err.message, HTTP_STATUS.BAD_REQUEST));
    } else if (err) {
      return next(err);
    }

    if (req.file) {
      try {
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { folder: 'vottery/organizations' },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          ).end(req.file.buffer);
        });

        req.file.path = result.secure_url;
      } catch (uploadError) {
        return next(new AppError('Failed to upload logo to Cloudinary', HTTP_STATUS.INTERNAL_SERVER_ERROR));
      }
    }

    next();
  });
};

// Helper function to get file URL (now returns Cloudinary URL as-is)
export const getFileUrl = (url) => {
  return url; // Cloudinary URLs are already complete
};

// Helper function to delete file from Cloudinary
export const deleteFile = async (url) => {
  try {
    if (url && url.includes('cloudinary')) {
      const publicId = url.split('/').slice(-2).join('/').split('.')[0];
      await cloudinary.uploader.destroy(publicId);
      return true;
    }
  } catch (error) {
    console.error('Error deleting file from Cloudinary:', error);
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
  deleteFile,
  cloudinary
};
// import multer from 'multer';
// import path from 'path';
// import fs from 'fs';
// import { fileURLToPath } from 'url';
// import { AppError } from '../utils/errorHandler.js';
// import { HTTP_STATUS } from '../config/constants.js';

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // Ensure upload directories exist
// const uploadDirs = ['images', 'logos', 'videos'];
// uploadDirs.forEach(dir => {
//   const dirPath = path.join(__dirname, '../../uploads', dir);
//   if (!fs.existsSync(dirPath)) {
//     fs.mkdirSync(dirPath, { recursive: true });
//   }
// });

// // Storage configuration
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     let folder = 'images';
    
//     if (file.fieldname === 'logo') {
//       folder = 'logos';
//     } else if (file.mimetype.startsWith('video/')) {
//       folder = 'videos';
//     }
    
//     cb(null, path.join(__dirname, '../../uploads', folder));
//   },
//   filename: (req, file, cb) => {
//     const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
//     const ext = path.extname(file.originalname);
//     const baseName = path.basename(file.originalname, ext);
//     cb(null, `${baseName}-${uniqueSuffix}${ext}`);
//   }
// });

// // File filter
// const fileFilter = (req, file, cb) => {
//   const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
//   const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/avi'];
  
//   if (file.mimetype.startsWith('image/')) {
//     if (allowedImageTypes.includes(file.mimetype)) {
//       cb(null, true);
//     } else {
//       cb(new AppError('Invalid image type. Only JPEG, PNG, and WebP are allowed.', HTTP_STATUS.BAD_REQUEST), false);
//     }
//   } else if (file.mimetype.startsWith('video/')) {
//     if (allowedVideoTypes.includes(file.mimetype)) {
//       cb(null, true);
//     } else {
//       cb(new AppError('Invalid video type. Only MP4, WebM, and AVI are allowed.', HTTP_STATUS.BAD_REQUEST), false);
//     }
//   } else {
//     cb(new AppError('Invalid file type. Only images and videos are allowed.', HTTP_STATUS.BAD_REQUEST), false);
//   }
// };

// // Multer configuration
// const upload = multer({
//   storage: storage,
//   fileFilter: fileFilter,
//   limits: {
//     fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB default
//   }
// });

// // Upload middleware for different scenarios
// export const uploadSingle = (fieldName) => {
//   return (req, res, next) => {
//     upload.single(fieldName)(req, res, (err) => {
//       if (err instanceof multer.MulterError) {
//         if (err.code === 'LIMIT_FILE_SIZE') {
//           return next(new AppError('File size too large. Maximum size is 10MB.', HTTP_STATUS.BAD_REQUEST));
//         }
//         return next(new AppError(err.message, HTTP_STATUS.BAD_REQUEST));
//       } else if (err) {
//         return next(err);
//       }
//       next();
//     });
//   };
// };

// export const uploadMultiple = (fields) => {
//   return (req, res, next) => {
//     upload.fields(fields)(req, res, (err) => {
//       if (err instanceof multer.MulterError) {
//         if (err.code === 'LIMIT_FILE_SIZE') {
//           return next(new AppError('File size too large. Maximum size is 10MB.', HTTP_STATUS.BAD_REQUEST));
//         }
//         return next(new AppError(err.message, HTTP_STATUS.BAD_REQUEST));
//       } else if (err) {
//         return next(err);
//       }
//       next();
//     });
//   };
// };

// // Election media upload configuration
// export const uploadElectionMedia = uploadMultiple([
//   { name: 'topic_image', maxCount: 1 },
//   { name: 'topic_video', maxCount: 1 },
//   { name: 'logo', maxCount: 1 }
// ]);

// // Question image upload
// export const uploadQuestionImage = uploadSingle('question_image');

// // Option image upload
// export const uploadOptionImage = uploadSingle('option_image');

// // Organization logo upload
// export const uploadOrganizationLogo = uploadSingle('logo');

// // Helper function to get file URL
// export const getFileUrl = (filename, type = 'images') => {
//   if (!filename) return null;
//   const baseUrl = process.env.BACKEND_URL || 'http://localhost:3005';
//   return `${baseUrl}/uploads/${type}/${filename}`;
// };

// // Helper function to delete file
// export const deleteFile = (filepath) => {
//   try {
//     if (fs.existsSync(filepath)) {
//       fs.unlinkSync(filepath);
//       return true;
//     }
//   } catch (error) {
//     console.error('Error deleting file:', error);
//   }
//   return false;
// };

// export default {
//   uploadSingle,
//   uploadMultiple,
//   uploadElectionMedia,
//   uploadQuestionImage,
//   uploadOptionImage,
//   uploadOrganizationLogo,
//   getFileUrl,
//   deleteFile
// };