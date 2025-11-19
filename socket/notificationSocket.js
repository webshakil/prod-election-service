// election-service/socket/notificationSocket.js
import { Server } from 'socket.io';

let io;

/**
 * Initialize Socket.IO server for notifications
 */
export const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    path: '/socket.io',
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    console.log(`✅ [NOTIFICATIONS] Client connected: ${socket.id}`);

    // User joins their personal notification room
    socket.on('join-notifications', (userId) => {
      socket.join(`user-${userId}`);
      socket.join('all-users'); // Global notifications
      console.log(`🔔 User ${userId} joined notification rooms`);
    });

    // Leave notification room
    socket.on('leave-notifications', (userId) => {
      socket.leave(`user-${userId}`);
      console.log(`👋 User ${userId} left notification room`);
    });

    socket.on('disconnect', () => {
      console.log(`❌ [NOTIFICATIONS] Client disconnected: ${socket.id}`);
    });
  });

  console.log('✅ Notification Socket.IO server initialized on Election Service');
  return io;
};

/**
 * Get Socket.IO instance
 */
export const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO not initialized');
  }
  return io;
};

/**
 * Emit notification to specific user
 */
export const emitToUser = (userId, notification) => {
  if (!io) {
    console.error('❌ Socket.IO not initialized');
    return;
  }

  console.log(`📡 Sending notification to user ${userId}:`, notification.title);
  
  io.to(`user-${userId}`).emit('notification', {
    ...notification,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Emit notification to all users
 */
export const emitToAll = (notification) => {
  if (!io) {
    console.error('❌ Socket.IO not initialized');
    return;
  }

  console.log(`📢 Broadcasting notification to all users:`, notification.title);
  
  io.to('all-users').emit('notification', {
    ...notification,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Emit election created notification
 * ✅ SOCKET.IO FIX: Changed to use electionId, electionTitle, creatorId
 */
export const emitElectionCreated = (electionData) => {
  const notification = {
    type: 'new_election',
    title: 'New Election Available',
    message: `"${electionData.electionTitle}" is now available for voting.`,
    link: `/election/${electionData.electionId}`,
    data: {
      electionId: electionData.electionId,
      electionTitle: electionData.electionTitle,
      creatorId: electionData.creatorId,
    },
  };

  // Notify creator
  emitToUser(electionData.creatorId, {
    ...notification,
    title: 'Election Created Successfully',
    message: `Your election "${electionData.electionTitle}" has been published!`,
    link: `/dashboard/my-elections`,
  });

  // Notify all other users
  emitToAll(notification);
};

export default {
  initializeSocket,
  getIO,
  emitToUser,
  emitToAll,
  emitElectionCreated,
};
// // election-service/socket/notificationSocket.js
// import { Server } from 'socket.io';

// let io;

// /**
//  * Initialize Socket.IO server for notifications
//  */
// export const initializeSocket = (server) => {
//   io = new Server(server, {
//     cors: {
//       origin: process.env.FRONTEND_URL || 'http://localhost:3000',
//       methods: ['GET', 'POST'],
//       credentials: true,
//     },
//     path: '/socket.io',
//     transports: ['websocket', 'polling'],
//   });

//   io.on('connection', (socket) => {
//     console.log(`✅ [NOTIFICATIONS] Client connected: ${socket.id}`);

//     // User joins their personal notification room
//     socket.on('join-notifications', (userId) => {
//       socket.join(`user-${userId}`);
//       socket.join('all-users'); // Global notifications
//       console.log(`🔔 User ${userId} joined notification rooms`);
//     });

//     // Leave notification room
//     socket.on('leave-notifications', (userId) => {
//       socket.leave(`user-${userId}`);
//       console.log(`👋 User ${userId} left notification room`);
//     });

//     socket.on('disconnect', () => {
//       console.log(`❌ [NOTIFICATIONS] Client disconnected: ${socket.id}`);
//     });
//   });

//   console.log('✅ Notification Socket.IO server initialized on Election Service');
//   return io;
// };

// /**
//  * Get Socket.IO instance
//  */
// export const getIO = () => {
//   if (!io) {
//     throw new Error('Socket.IO not initialized');
//   }
//   return io;
// };

// /**
//  * Emit notification to specific user
//  */
// export const emitToUser = (userId, notification) => {
//   if (!io) {
//     console.error('❌ Socket.IO not initialized');
//     return;
//   }

//   console.log(`📡 Sending notification to user ${userId}:`, notification.title);
  
//   io.to(`user-${userId}`).emit('notification', {
//     ...notification,
//     timestamp: new Date().toISOString(),
//   });
// };

// /**
//  * Emit notification to all users
//  */
// export const emitToAll = (notification) => {
//   if (!io) {
//     console.error('❌ Socket.IO not initialized');
//     return;
//   }

//   console.log(`📢 Broadcasting notification to all users:`, notification.title);
  
//   io.to('all-users').emit('notification', {
//     ...notification,
//     timestamp: new Date().toISOString(),
//   });
// };

// /**
//  * Emit election created notification
//  */
// export const emitElectionCreated = (electionData) => {
//   const notification = {
//     type: 'new_election',
//     title: 'New Election Available',
//     message: `"${electionData.title}" is now available for voting.`,
//     link: `/election/${electionData.id}`,
//     data: {
//       electionId: electionData.id,
//       electionTitle: electionData.title,
//       creatorId: electionData.creator_id,
//     },
//   };

//   // Notify creator
//   emitToUser(electionData.creator_id, {
//     ...notification,
//     title: 'Election Created Successfully',
//     message: `Your election "${electionData.title}" has been published!`,
//     link: `/dashboard/my-elections`,
//   });

//   // Notify all other users
//   emitToAll(notification);
// };

// export default {
//   initializeSocket,
//   getIO,
//   emitToUser,
//   emitToAll,
//   emitElectionCreated,
// };