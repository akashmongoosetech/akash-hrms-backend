const Message = require('../models/Message');
const User = require('../models/User');

// Send a message
const sendMessage = async (req, res) => {
  try {
    const { receiverId, message } = req.body;
    const senderId = req.user._id;
    const trimmedMessage = message.trim();

    console.log('req.body:', req.body);
    console.log('req.files:', req.files);
    console.log('trimmedMessage:', trimmedMessage);

    if (!receiverId || (!trimmedMessage && !(req.files && req.files['file'] && req.files['file'].length > 0))) {
      return res.status(400).json({ message: 'Receiver and message are required if no file is attached' });
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

    // Emit to receiver via socket
    const io = req.app.get('io');
    io.to(receiverId.toString()).emit('newMessage', {
      _id: newMessage._id.toString(),
      sender: { _id: senderId.toString(), firstName: req.user.firstName, lastName: req.user.lastName, photo: req.user.photo },
      receiver: receiverId.toString(),
      message: trimmedMessage,
      file: messageData.file,
      createdAt: newMessage.createdAt,
      read: false,
    });

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
    }).populate('sender', 'firstName lastName photo').sort({ createdAt: 1 });

    // Modify messages that are deleted for everyone to show placeholder content
    const modifiedMessages = messages.map(msg => {
      const msgObj = msg.toObject();
      if (msgObj.isDeletedForEveryone) {
        msgObj.message = 'Deleted by user';
        msgObj.file = null; // Remove file attachment for deleted messages
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

// Delete message for sender only
const deleteForMe = async (req, res) => {
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

    message.deletedForSender = true;
    await message.save();

    res.json({ message: 'Message deleted for you' });
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

module.exports = { sendMessage, getMessages, getChatUsers, markAsRead, searchUsers, deleteForMe, deleteForEveryone };