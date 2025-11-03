const express = require('express');
const router = express.Router();
const { getComments, createComment } = require('../controllers/commentController');
const auth = require('../middleware/auth');

// Get all comments for a ticket
router.get('/:ticketId', auth, getComments);

// Create a new comment
router.post('/:ticketId', auth, createComment);

module.exports = router;