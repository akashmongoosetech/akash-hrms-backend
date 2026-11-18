const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  name: String,
  path: String,
  type: String,
  size: Number,
});

const reactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  emoji: { type: String, required: true, trim: true, maxlength: 16 },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String },
  read: { type: Boolean, default: false },
  file: fileSchema,
  reactions: { type: [reactionSchema], default: [] },
  deletedForSender: { type: Boolean, default: false },
  deletedForReceiver: { type: Boolean, default: false },
  isDeletedForEveryone: { type: Boolean, default: false },
}, { timestamps: true });

// Reaction lookup is always per message, and every conversation query filters
// by sender/receiver, so these two indexes cover the chat feed efficiently.
messageSchema.index({ sender: 1, receiver: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);