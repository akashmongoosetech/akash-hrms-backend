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
  salary: Number,
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
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  leaveBalance: {
    vacation: { type: Number, default: 20 },
    sick: { type: Number, default: 10 },
    personal: { type: Number, default: 5 }
  },
  pushSubscriptions: [{
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true }
    }
  }],
  dashboardPreferences: {
    projects: { type: Boolean, default: true },
    teams: { type: Boolean, default: true },
    todos: { type: Boolean, default: true },
    tickets: { type: Boolean, default: true },
  },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
