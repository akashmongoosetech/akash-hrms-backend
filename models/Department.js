const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  head: { type: String, required: true }, // Department Head name
}, { timestamps: true });

module.exports = mongoose.model('Department', departmentSchema);