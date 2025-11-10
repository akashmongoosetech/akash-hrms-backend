const mongoose = require('mongoose');

const candidateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  position: { type: String, required: true },
  currentCompany: String,
  experience: String,
  expectedSalary: String,
  noticePeriod: String,
  coverLetter: String,
  resume: {
    contentType: String,
    filename: String
  },
  status: { type: String, default: 'pending' }
}, { timestamps: true });

module.exports = mongoose.model('Candidate', candidateSchema);