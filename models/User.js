const mongoose = require('mongoose');

const salarySchema = new mongoose.Schema({
  accountNo: String,
  bankName: String,
  ifscCode: String,
});

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  gender: String,
  photo: String,
  dob: Date,
  joiningDate: Date,
  mobile1: String,
  mobile2: String,
  password: { type: String, required: true },
  address1: String,
  address2: String,
  emergencyContact1: String,
  emergencyContact2: String,
  emergencyContact3: String,
  skillsFrontend: [String],
  skillsBackend: [String],
  bankAccountName: String,
  bankAccountNo: String,
  bankName: String,
  ifscCode: String,
  bankAddress: String,
  salaryDetails: salarySchema,
  aadharCardNumber: String,
  aadharCardFile: String,
  drivingLicenseNumber: String,
  drivingLicenseFile: String,
  panCardNumber: String,
  panCardFile: String,
  facebook: String,
  twitter: String,
  linkedin: String,
  instagram: String,
  upworkProfile: String,
  resume: String,
  role: { type: String, enum: ['Employee', 'Admin', 'SuperAdmin'], default: 'Employee' },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
