const mongoose = require('mongoose');
const Message = require('../models/Message');
const User = require('../models/User');
const { isUserActivelyViewingConversation, isUserOnline } = require('../services/chatPresence');

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
    const trimmedMessage = (message || '').trim();

    console.log('req.body:', req.body);
    console.log('req.files:', req.files);
    console.log('trimmedMessage:', trimmedMessage);

    if (!receiverId || (!trimmedMessage && !(req.files && req.files['file'] && req.files['file'].length > 0))) {
      return res.status(400).json({ message: 'Receiver and message are required if no file is attached' });
    }

    // Validate receiverId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(receiverId)) {
      return res.status(400).json({ message: 'Invalid receiver ID format' });
    }

    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ message: 'Receiver not found' });
    }

    const messageData = {
      sender: senderId,
      receiver: receiverId,
      message: trimmedMessage,
    };

    // Handle file upload
    if (req.files && req.files['file'] && req.files['file'].length > 0) {
      const file = req.files['file'][0];
      messageData.file = {
        name: file.originalname,
        path: file.path,
        type: file.mimetype,
        size: file.size,
      };
    }

    console.log('messageData:', messageData);

    const newMessage = new Message(messageData);
    await newMessage.save();

    // Determine notification behavior based on recipient's presence
    const receiverIdStr = String(receiverId);
    const isReceiverOnline = isUserOnline(receiverIdStr);

    // Emit to receiver via socket (always deliver in real-time)
    const io = req.app.get('io');
    io.to(receiverIdStr).emit('newMessage', {
      _id: newMessage._id.toString(),
      sender: { _id: senderId.toString(), firstName: req.user.firstName, lastName: req.user.lastName, photo: req.user.photo },
      receiver: receiverIdStr,
      message: trimmedMessage,
      file: messageData.file,
      createdAt: newMessage.createdAt,
      read: false,
      reactions: [],
    });

    // Determine if we should also send a persistent notification
    let shouldSendPersistentNotification = false;

    if (isReceiverOnline) {
      // Check if receiver is actively viewing the relevant conversation
      const isViewingConversation = isUserActivelyViewingConversation(receiverIdStr, senderId);

      if (isViewingConversation) {
        // Recipient is online AND viewing the relevant conversation - no separate notification
        // The real-time socket delivery is sufficient
        shouldSendPersistentNotification = false;
      } else {
        // Recipient is online but viewing another section or different conversation
        // Send a persistent in-app notification
        shouldSendPersistentNotification = true;
      }
    } else {
      // Recipient is offline - persistent notification for later delivery
      shouldSendPersistentNotification = true;
    }

    // Send persistent notification if needed
    if (shouldSendPersistentNotification) {
      const employee = await User.findById(receiverId);
      if (employee && employee.pushSubscriptions && employee.pushSubscriptions.length > 0) {
        const notificationPayload = {
          title: '💬 New Message',
          body: `${req.user.firstName}: ${trimmedMessage || ' '}`,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          url: '/chat',
          data: {
            type: 'chat_message',
            senderId: senderId,
            messageId: newMessage._id,
            link: '/chat',
          },
        };

        const promises = employee.pushSubscriptions.map(subscription =>
          webpush.sendNotification(subscription, JSON.stringify(notificationPayload))
            .catch(error => {
              if (error.statusCode === 410) {
                User.findByIdAndUpdate(receiverId, {
                  $pull: { pushSubscriptions: subscription }
                }).exec();
              }
            })
        );
        await Promise.all(promises);
      }
    }

    res.status(201).json({ message: 'Message sent successfully', data: newMessage });
  } catch (error) {
    console.error('Error sending message:', error.message);
    console.error('Error stack:', error.stack);
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

    const messages = await Message.find({
      $or: [
        { sender: currentUserId },
        { receiver: currentUserId }
      ]
    }).populate('sender', 'firstName lastName email photo').populate('receiver', 'firstName lastName email photo').sort({ createdAt: -1 });

    const chatUsers = new Map();

    messages.forEach(msg => {
      const otherUser = msg.sender._id.toString() === currentUserId.toString() ? msg.receiver : msg.sender;
      if (!chatUsers.has(otherUser._id.toString())) {
        chatUsers.set(otherUser._id.toString(), {
          _id: otherUser._id.toString(),
          firstName: otherUser.firstName,
          lastName: otherUser.lastName,
          email: otherUser.email,
          photo: otherUser.photo,
          lastMessage: msg.message,
          lastMessageTime: msg.createdAt,
        });
      }
    });

    res.json({ chatUsers: Array.from(chatUsers.values()) });
  } catch (error) {
    console.error('Error fetching chat users:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Mark messages as read
const markAsRead = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    await Message.updateMany(
      { sender: userId, receiver: currentUserId, read: false },
      { read: true }
    );

    res.json({ message: 'Messages marked as read' });
  } catch (error) {
    console.error('Error marking messages as read:', error);
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

module.exports = { sendMessage, getMessages, getChatUsers, markAsRead, searchUsers, deleteForMe, deleteForEveryone, toggleReaction };