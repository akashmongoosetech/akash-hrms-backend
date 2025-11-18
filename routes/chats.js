const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const chatController = require('../controllers/chatController');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

const chatUpload = upload.fields([{ name: 'file', maxCount: 1 }]);

// Send a message - Employee and above
router.post('/send', authenticate, authorizeRoles('Employee'), chatUpload, chatController.sendMessage);

// Get messages with a specific user - Employee and above
router.get('/messages/:userId', authenticate, authorizeRoles('Employee'), chatController.getMessages);

// Get list of chat users - Employee and above
router.get('/users', authenticate, authorizeRoles('Employee'), chatController.getChatUsers);

// Mark messages as read - Employee and above
router.put('/read/:userId', authenticate, authorizeRoles('Employee'), chatController.markAsRead);

// Search users for starting new chats - Employee and above
router.get('/search-users', authenticate, authorizeRoles('Employee'), chatController.searchUsers);

// Delete message for me - Employee and above
router.delete('/delete-for-me/:messageId', authenticate, authorizeRoles('Employee'), chatController.deleteForMe);

// Delete message for everyone - Employee and above
router.delete('/delete-for-everyone/:messageId', authenticate, authorizeRoles('Employee'), chatController.deleteForEveryone);

module.exports = router;