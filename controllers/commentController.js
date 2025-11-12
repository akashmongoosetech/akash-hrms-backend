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

    const attachments = req.files ? req.files.map(file => ({
      filename: file.filename,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    })) : [];

    const comment = new Comment({
      ticket: ticketId,
      user: userId,
      message: message.trim(),
      attachments
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

const deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user._id;

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    if (comment.user.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'You can only delete your own comments' });
    }

    await Comment.findByIdAndDelete(commentId);

    // Emit real-time comment deletion to all users viewing this ticket
    const io = req.app.get('io');
    io.emit(`comment-deleted-${comment.ticket}`, commentId);

    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Error deleting comment:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getComments,
  createComment,
  deleteComment
};