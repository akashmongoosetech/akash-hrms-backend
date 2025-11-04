const mongoose = require('mongoose');

const linkSchema = new mongoose.Schema({
  type: { type: String, enum: ['git', 'excel', 'codebase'], required: true },
  title: { type: String, required: true },
  url: { type: String }, // Optional for excel/codebase if file or image is provided
  image: String, // Optional
  file: String, // Path to uploaded file for excel/codebase
}, { timestamps: true });

module.exports = mongoose.model('Link', linkSchema);