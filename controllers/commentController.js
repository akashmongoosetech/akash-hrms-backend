const Comment = require('../models/Comment');
const User = require('../models/User');

// Get all comments for a ticket
const getComments = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const comments = await Comment.find({ ticket: ticketId })
      .populate('user', 'firstName lastName email role photo')
      .sort({ createdAt: 1 });

    res.json(comments);
  } catch (error) {
    console.error('Error fetching comments:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create a new comment
const createComment = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { message } = req.body;
    const userId = req.user._id;

    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message is required' });
    }

    const comment = new Comment({
      ticket: ticketId,
      user: userId,
      message: message.trim()
    });

    await comment.save();
    await comment.populate('user', 'firstName lastName email role photo');

    // Emit real-time comment to all users viewing this ticket
    const io = req.app.get('io');
    io.emit(`comment-${ticketId}`, comment);

    res.status(201).json(comment);
  } catch (error) {
    console.error('Error creating comment:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getComments,
  createComment
};