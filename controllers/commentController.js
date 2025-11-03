const Comment = require('../models/Comment');
const User = require('../models/User');

// Get all comments for a ticket
const getComments = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const comments = await Comment.find({ ticket: ticketId })
      .populate('user', 'firstName lastName email role')
      .sort({ createdAt: 1 });

    res.json(comments);
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create a new comment
const createComment = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { message } = req.body;
    const userId = req.user.id;

    const comment = new Comment({
      ticket: ticketId,
      user: userId,
      message
    });

    await comment.save();
    await comment.populate('user', 'firstName lastName email role');

    res.status(201).json(comment);
  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getComments,
  createComment
};