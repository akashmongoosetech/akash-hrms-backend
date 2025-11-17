const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  name: String,
  path: String,
  type: String,
  size: Number,
});

const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String },
  read: { type: Boolean, default: false },
  file: fileSchema,
}, { timestamps: true });

module.exports = mongoose.model('Message', messageSchema);