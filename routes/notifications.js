const express = require('express');
const router = express.Router();
const {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  cleanupOldNotifications
} = require('../controllers/notificationController');
const auth = require('../middleware/auth');

// All notification routes require authentication
router.use(auth);

// Get notifications for a user
router.get('/user/:userId', getUserNotifications);

// Get unread count for a user
router.get('/user/:userId/unread-count', getUnreadCount);

// Mark single notification as read
router.put('/:notificationId/read', markAsRead);

// Mark all notifications as read for a user
router.put('/user/:userId/read-all', markAllAsRead);

// Cleanup old notifications (admin only)
router.delete('/cleanup', cleanupOldNotifications);

module.exports = router;