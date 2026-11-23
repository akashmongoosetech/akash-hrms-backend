const mongoose = require('mongoose');
const Message = require('../models/Message');
const User = require('../models/User');
const {
  handleChatNotification,
  markChatNotificationsRead,
} = require('./notificationController');

// Reactions are stored as { userId, emoji, createdAt } sub-documents. The
// populating options below are shared by every endpoint that returns messages
// so each reaction can render the reacting employee's name and photo.
const REACTION_POPULATE = { path: 'reactions.userId', select: 'firstName lastName photo' };

// Characters that may legitimately appear inside an emoji: pictographs, emoji
// components (skin tones, keycaps, regional indicators), joiners, variation
// selectors and the tag characters used by subdivision flags.
const EMOJI_CHARACTERS =
  /^[\p{Emoji}\p{Emoji_Component}\u200d\ufe0f\u20e3\u{e0020}-\u{e007f}]+$/u;
// Requires at least one real glyph so plain digits ("123") are still rejected.
const HAS_EMOJI_GLYPH = /[\p{Extended_Pictographic}\p{Emoji_Presentation}\u{1f1e6}-\u{1f1ff}\u20e3]/u;

/**
 * Accepts a single emoji (or emoji sequence such as a ZWJ family, a skin-toned
 * hand, a keycap or a flag) and rejects arbitrary text so the reaction store
 * stays clean. Length is capped so a client cannot push a large string into
 * Mongo.
 */
const normalizeEmoji = (value) => {
  if (typeof value !== 'string') return null;
  const emoji = value.trim();
  if (!emoji) return null;
  if (emoji.length > 16) return null;
  if (Array.from(emoji).length > 8) return null;
  if (!EMOJI_CHARACTERS.test(emoji)) return null;
  if (!HAS_EMOJI_GLYPH.test(emoji)) return null;
  return emoji;
};

const serializeReactions = (reactions = []) =>
  reactions.map((reaction) => {
    const user = reaction.userId;
    const isPopulated = user && typeof user === 'object' && user._id;
    return {
      emoji: reaction.emoji,
      createdAt: reaction.createdAt,
      user: isPopulated
        ? {
            _id: String(user._id),
            firstName: user.firstName || '',
            lastName: user.lastName || '',
            photo: user.photo || null,
          }
        : { _id: String(user), firstName: '', lastName: '', photo: null },
    };
  });

// Send a message
const sendMessage = async (req, res) => {
  try {
    const { receiverId, message } = req.body;
    const senderId = req.user._id;
    const trimmedMessage = typeof message === 'string' ? message.trim() : '';
    const hasFile = !!(req.files && req.files['file'] && req.files['file'].length > 0);

    if (!receiverId || (!trimmedMessage && !hasFile)) {
      return res.status(400).json({ message: 'Receiver and message are required if no file is attached' });
    }

    // Validate receiverId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(receiverId)) {
      return res.status(400).json({ message: 'Invalid receiver ID format' });
    }

    const receiverIdStr = String(receiverId);
    if (receiverIdStr === String(senderId)) {
      return res.status(400).json({ message: 'You cannot send a message to yourself' });
    }

    if (trimmedMessage.length > 4000) {
      return res.status(400).json({ message: 'Message is too long' });
    }

    const receiver = await User.findById(receiverId).select(
      'firstName lastName photo role status pushSubscriptions'
    );
    if (!receiver || receiver.status === 'Deleted') {
      return res.status(404).json({ message: 'Receiver not found' });
    }

    const messageData = {
      sender: senderId,
      receiver: receiverId,
      message: trimmedMessage,
    };

    // Handle file upload
    if (hasFile) {
      const file = req.files['file'][0];
      messageData.file = {
        name: file.originalname,
        path: file.path,
        type: file.mimetype,
        size: file.size,
      };
    }

    const newMessage = new Message(messageData);
    await newMessage.save();

    const io = req.app.get('io');
    const senderIdStr = String(senderId);
    const payload = {
      _id: newMessage._id.toString(),
      sender: {
        _id: senderIdStr,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        photo: req.user.photo,
      },
      receiver: receiverIdStr,
      message: trimmedMessage,
      file: messageData.file,
      createdAt: newMessage.createdAt,
      read: false,
      reactions: [],
    };

    // Deliver live to every recipient session and to the sender's other
    // tabs/devices. The sending tab de-duplicates by message id.
    if (io) {
      io.to(receiverIdStr).emit('newMessage', payload);
      io.to(senderIdStr).emit('newMessage', payload);
    }

    // Persist the notification first (when required), then deliver it. This is
    // deliberately independent of socket delivery so an offline recipient
    // still has the notification waiting on their next login.
    await handleChatNotification({
      sender: req.user,
      recipient: receiver,
      messageId: newMessage._id,
      message: trimmedMessage,
      fileName: messageData.file?.name,
      io,
    });

    // Keep the recipient's unread chat counter authoritative.
    if (io) {
      const totalUnread = await Message.countDocuments({
        receiver: receiverId,
        read: false,
      });
      io.to(receiverIdStr).emit('chat:unread:update', { totalUnread });
    }

    res.status(201).json({ message: 'Message sent successfully', data: newMessage });
  } catch (error) {
    console.error('Error sending message:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get messages between current user and another user
const getMessages = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    const messages = await Message.find({
      $or: [
        { sender: currentUserId, receiver: userId, deletedForSender: false },
        { sender: userId, receiver: currentUserId, deletedForReceiver: false },
        { sender: currentUserId, receiver: userId, isDeletedForEveryone: true },
        { sender: userId, receiver: currentUserId, isDeletedForEveryone: true }
      ]
    }).populate('sender', 'firstName lastName photo').populate(REACTION_POPULATE).sort({ createdAt: 1 });

    // Modify messages that are deleted for everyone to show placeholder content
    const modifiedMessages = messages.map(msg => {
      const msgObj = msg.toObject();
      msgObj.reactions = serializeReactions(msgObj.reactions);
      if (msgObj.isDeletedForEveryone) {
        msgObj.message = 'Deleted by user';
        msgObj.file = null; // Remove file attachment for deleted messages
        msgObj.reactions = [];
      }
      return msgObj;
    });

    res.json({ messages: modifiedMessages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get list of users the current user has chatted with
const getChatUsers = async (req, res) => {
  try {
    const currentUserId = req.user._id;

    const [messages, unreadBySender] = await Promise.all([
      Message.find({
        $or: [
          { sender: currentUserId },
          { receiver: currentUserId }
        ]
      })
        .populate('sender', 'firstName lastName email photo role')
        .populate('receiver', 'firstName lastName email photo role')
        .sort({ createdAt: -1 }),
      Message.aggregate([
        { $match: { receiver: currentUserId, read: false } },
        { $group: { _id: '$sender', count: { $sum: 1 } } },
      ]),
    ]);

    const unreadMap = new Map(
      unreadBySender.map((row) => [String(row._id), row.count])
    );

    const chatUsers = new Map();

    messages.forEach(msg => {
      if (!msg.sender || !msg.receiver) return;
      const otherUser = msg.sender._id.toString() === currentUserId.toString() ? msg.receiver : msg.sender;
      if (!otherUser) return;
      const otherUserId = otherUser._id.toString();
      if (!chatUsers.has(otherUserId)) {
        chatUsers.set(otherUserId, {
          _id: otherUserId,
          firstName: otherUser.firstName,
          lastName: otherUser.lastName,
          email: otherUser.email,
          photo: otherUser.photo,
          role: otherUser.role,
          lastMessage: msg.message,
          lastMessageTime: msg.createdAt,
          unreadCount: unreadMap.get(otherUserId) || 0,
        });
      }
    });

    const users = Array.from(chatUsers.values());
    const totalUnread = users.reduce((sum, user) => sum + (user.unreadCount || 0), 0);

    res.json({ chatUsers: users, totalUnread });
  } catch (error) {
    console.error('Error fetching chat users:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Resolve a single chat participant. Used when a notification is clicked for a
// conversation that does not exist in the sidebar yet (first ever message).
const getChatUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }
    if (String(userId) === String(currentUserId)) {
      return res.status(400).json({ message: 'Invalid conversation' });
    }

    const user = await User.findOne({
      _id: userId,
      status: { $ne: 'Deleted' },
    }).select('firstName lastName email photo role');

    if (!user) return res.status(404).json({ message: 'User not found' });

    const unreadCount = await Message.countDocuments({
      sender: userId,
      receiver: currentUserId,
      read: false,
    });

    return res.json({
      user: {
        _id: user._id.toString(),
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        photo: user.photo,
        role: user.role,
        unreadCount,
      },
    });
  } catch (error) {
    console.error('Error fetching chat user:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Mark messages as read
const markAsRead = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    // Capture the ids first so both participants can update their read ticks
    // without refetching the whole conversation.
    const unreadMessages = await Message.find({
      sender: userId,
      receiver: currentUserId,
      read: false,
    }).select('_id');

    const messageIds = unreadMessages.map((message) => String(message._id));

    if (messageIds.length) {
      await Message.updateMany(
        { _id: { $in: messageIds } },
        { read: true }
      );
    }

    const io = req.app.get('io');

    if (io && messageIds.length) {
      const readPayload = {
        messageIds,
        readerId: String(currentUserId),
        senderId: String(userId),
        conversationId: String(currentUserId),
      };
      // Notify both sides (sender's read receipts + reader's other tabs).
      io.to(String(userId)).to(String(currentUserId)).emit(
        'chat:message:read',
        readPayload
      );

      const totalUnread = await Message.countDocuments({
        receiver: currentUserId,
        read: false,
      });
      io.to(String(currentUserId)).emit('chat:unread:update', { totalUnread });
    }

    // A conversation being opened also clears its chat notifications.
    await markChatNotificationsRead({
      userId: currentUserId,
      senderId: userId,
      io,
    });

    res.json({ message: 'Messages marked as read', messageIds });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Authoritative unread chat counters for the signed-in user.
const getUnreadChatCount = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const [totalUnread, bySender] = await Promise.all([
      Message.countDocuments({ receiver: currentUserId, read: false }),
      Message.aggregate([
        { $match: { receiver: currentUserId, read: false } },
        { $group: { _id: '$sender', count: { $sum: 1 } } },
      ]),
    ]);

    res.json({
      totalUnread,
      conversations: bySender.map((row) => ({
        userId: String(row._id),
        unreadCount: row.count,
      })),
    });
  } catch (error) {
    console.error('Error fetching unread chat count:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete message for current user only (from their chat feed)
const deleteForMe = async (req, res) => {
  try {
    const { messageId } = req.params;
    const currentUserId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Check if current user is either sender or receiver of the message
    const isSender = message.sender.toString() === currentUserId.toString();
    const isReceiver = message.receiver.toString() === currentUserId.toString();

    if (!isSender && !isReceiver) {
      return res.status(403).json({ message: 'You are not authorized to delete this message' });
    }

    // Mark as deleted for the current user
    if (isSender) {
      message.deletedForSender = true;
    } else if (isReceiver) {
      message.deletedForReceiver = true;
    }

    await message.save();

    res.json({ message: 'Message deleted from your chat feed' });
  } catch (error) {
    console.error('Error deleting message for me:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete message for everyone
const deleteForEveryone = async (req, res) => {
  try {
    const { messageId } = req.params;
    const currentUserId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    if (message.sender.toString() !== currentUserId.toString()) {
      return res.status(403).json({ message: 'You can only delete your own messages' });
    }

    message.isDeletedForEveryone = true;
    await message.save();

    // Emit to receiver via socket
    const io = req.app.get('io');
    io.to(message.receiver.toString()).emit('messageDeleted', {
      messageId: messageId,
      isDeletedForEveryone: true
    });

    res.json({ message: 'Message deleted for everyone' });
  } catch (error) {
    console.error('Error deleting message for everyone:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Add or remove the current user's reaction on a message (toggle)
const toggleReaction = async (req, res) => {
  try {
    const { messageId } = req.params;
    const emoji = normalizeEmoji(req.body?.emoji);

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(404).json({ message: 'Message not found' });
    }
    if (!emoji) {
      return res.status(400).json({ message: 'A valid emoji is required' });
    }

    const message = await Message.findById(messageId).select('sender receiver isDeletedForEveryone');
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const currentUserId = req.user._id;
    const isSender = message.sender.toString() === currentUserId.toString();
    const isReceiver = message.receiver.toString() === currentUserId.toString();

    // Only the two people in this conversation may react.
    if (!isSender && !isReceiver) {
      return res.status(403).json({ message: 'You are not a participant in this conversation' });
    }
    if (message.isDeletedForEveryone) {
      return res.status(400).json({ message: 'You cannot react to a deleted message' });
    }

    const scope = { _id: messageId, isDeletedForEveryone: { $ne: true } };
    let action = 'removed';

    // Remove first. The $elemMatch guard makes this a no-op when the user has
    // not reacted with this emoji yet, which also makes rapid repeat clicks
    // idempotent instead of creating duplicate entries.
    let updated = await Message.findOneAndUpdate(
      { ...scope, reactions: { $elemMatch: { userId: currentUserId, emoji } } },
      { $pull: { reactions: { userId: currentUserId, emoji } } },
      { new: true }
    );

    if (!updated) {
      action = 'added';
      updated = await Message.findOneAndUpdate(
        { ...scope, reactions: { $not: { $elemMatch: { userId: currentUserId, emoji } } } },
        { $push: { reactions: { userId: currentUserId, emoji, createdAt: new Date() } } },
        { new: true }
      );
    }

    if (!updated) {
      return res.status(409).json({ message: 'The reaction could not be saved. Please try again.' });
    }

    await updated.populate(REACTION_POPULATE);
    const reactions = serializeReactions(updated.reactions);

    // Both participants receive the update, including the reacting user's own
    // room so their other signed-in devices stay in sync.
    const io = req.app.get('io');
    if (io) {
      io.to(updated.sender.toString())
        .to(updated.receiver.toString())
        .emit('messageReactionUpdated', { messageId: String(updated._id), reactions });
    }

    res.json({
      message: action === 'added' ? 'Reaction added' : 'Reaction removed',
      action,
      reactions,
    });
  } catch (error) {
    console.error('Error toggling reaction:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const searchUsers = async (req, res) => {
  try {
    const { query } = req.query;
    const currentUserId = req.user._id;

    if (!query || query.trim() === '') {
      return res.json({ users: [] });
    }

    const users = await User.find({
      $and: [
        { _id: { $ne: currentUserId } },
        { status: { $ne: 'Deleted' } },
        {
          $or: [
            { firstName: { $regex: query, $options: 'i' } },
            { lastName: { $regex: query, $options: 'i' } },
            { email: { $regex: query, $options: 'i' } }
          ]
        }
      ]
    }).select('firstName lastName email role photo').limit(20);

    res.json({ users });
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  sendMessage,
  getMessages,
  getChatUsers,
  getChatUser,
  getUnreadChatCount,
  markAsRead,
  searchUsers,
  deleteForMe,
  deleteForEveryone,
  toggleReaction,
};