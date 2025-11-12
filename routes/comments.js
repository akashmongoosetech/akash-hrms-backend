const express = require('express');
const router = express.Router();
const { getComments, createComment, deleteComment } = require('../controllers/commentController');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');

// Get all comments for a ticket
router.get('/:ticketId', auth, getComments);

// Create a new comment
router.post('/:ticketId', auth, upload.array('attachments', 10), createComment);

// Delete a comment
router.delete('/:commentId', auth, deleteComment);

module.exports = router;