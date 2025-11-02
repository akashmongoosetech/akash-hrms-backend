const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  profile: String, // Could be a file path or description
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  about: String,
  country: String,
  state: String,
  city: String,
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
}, { timestamps: true });

module.exports = mongoose.model('Client', clientSchema);