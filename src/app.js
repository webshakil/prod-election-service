import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import electionRoutes from './routes/electionRoutes.js';
import organizationRoutes from './routes/organizationRoutes.js';
import lotteryRoutes from './routes/lotteryRoutes.js';
import contentCreatorRoutes from './routes/contentCreatorRoutes.js';
import securityRoutes from './routes/securityRoutes.js';
import { errorHandler } from './utils/errorHandler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3005;

// Helmet
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://localhost:5173'];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Election Service is running',
    timestamp: new Date().toISOString(),
    service: 'election-service',
    version: '1.0.0',
    cloudinary: process.env.CLOUDINARY_CLOUD_NAME ? 'configured' : 'not configured'
  });
});

// API routes
app.use('/api/elections', electionRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/lottery', lotteryRoutes);
app.use('/api/content-creator', contentCreatorRoutes);
app.use('/api/security', securityRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error handler (must be last)
app.use(errorHandler);

// START SERVER
app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log(`🚀 Election Service running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 API: http://localhost:${PORT}/api/elections`);
  console.log(`💚 Health: http://localhost:${PORT}/health`);
  console.log(`☁️  Cloudinary: ${process.env.CLOUDINARY_CLOUD_NAME ? '✅ Configured' : '❌ Not Configured'}`);
  console.log('='.repeat(50));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  process.exit(0);
});

export default app;
// //LAST workable file
// import express from 'express';
// import cors from 'cors';
// import dotenv from 'dotenv';
// import helmet from 'helmet';
// import morgan from 'morgan';
// import compression from 'compression';
// import path from 'path';
// import { fileURLToPath } from 'url';
// import electionRoutes from './routes/electionRoutes.js';
// import organizationRoutes from './routes/organizationRoutes.js';
// import lotteryRoutes from './routes/lotteryRoutes.js';
// import contentCreatorRoutes from './routes/contentCreatorRoutes.js';
// import securityRoutes from './routes/securityRoutes.js';
// import { errorHandler } from './utils/errorHandler.js';

// dotenv.config();

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// const app = express();
// const PORT = process.env.PORT || 3005;


// app.use(helmet({
//   crossOriginResourcePolicy: { policy: "cross-origin" }
// }));

// // CORS
// const allowedOrigins = process.env.ALLOWED_ORIGINS 
//   ? process.env.ALLOWED_ORIGINS.split(',')
//   : ['http://localhost:3000', 'http://localhost:5173'];

// app.use(cors({
//   origin: function(origin, callback) {
//     if (!origin || allowedOrigins.includes(origin)) {
//       callback(null, true);
//     } else {
//       callback(new Error('Not allowed by CORS'));
//     }
//   },
//   credentials: true
// }));

// // Logging
// if (process.env.NODE_ENV === 'development') {
//   app.use(morgan('dev'));
// } else {
//   app.use(morgan('combined'));
// }

// // Body parsing
// app.use(express.json({ limit: '10mb' }));
// app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// // Compression
// app.use(compression());


// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// app.get('/health', (req, res) => {
//   res.status(200).json({
//     success: true,
//     message: 'Election Service is running',
//     timestamp: new Date().toISOString(),
//     service: 'election-service',
//     version: '1.0.0'
//   });
// });

// // API routes
// app.use('/api/elections', electionRoutes);
// app.use('/api/organizations', organizationRoutes);
// app.use('/api/lottery', lotteryRoutes);
// app.use('/api/content-creator', contentCreatorRoutes);
// app.use('/api/security', securityRoutes);

// // 404 handler
// app.use('*', (req, res) => {
//   res.status(404).json({
//     success: false,
//     message: 'Route not found'
//   });
// });

// // Error handler (must be last)
// app.use(errorHandler);

// // ============================================
// // START SERVER
// // ============================================

// app.listen(PORT, () => {
//   console.log('='.repeat(50));
//   console.log(`🚀 Election Service running on port ${PORT}`);
//   console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
//   console.log(`🌐 API: http://localhost:${PORT}/api/elections`);
//   console.log(`💚 Health: http://localhost:${PORT}/health`);
//   console.log('='.repeat(50));
// });

// // Graceful shutdown
// process.on('SIGTERM', () => {
//   console.log('SIGTERM signal received: closing HTTP server');
//   process.exit(0);
// });

// process.on('SIGINT', () => {
//   console.log('SIGINT signal received: closing HTTP server');
//   process.exit(0);
// });

// export default app;