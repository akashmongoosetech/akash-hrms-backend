const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const Notification = require('../models/Notification');

const signup = async (req, res) => {
  try {
    const {
      firstName, lastName, email, gender, dob, joiningDate,
      mobile1, mobile2, password, address1, address2,
      emergencyContact1, emergencyContact2, emergencyContact3,
      skillsFrontend, skillsBackend, bankAccountName, bankAccountNo,
      bankName, ifscCode, bankAddress, salaryDetails,
      aadharCardNumber, drivingLicenseNumber, panCardNumber,
      facebook, twitter, linkedin, instagram, upworkProfile
    } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ message: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);

    const userData = {
      firstName, lastName, email, gender, dob, joiningDate,
      mobile1, mobile2, password: hashed, address1, address2,
      emergencyContact1, emergencyContact2, emergencyContact3,
      skillsFrontend: skillsFrontend ? JSON.parse(skillsFrontend) : [],
      skillsBackend: skillsBackend ? JSON.parse(skillsBackend) : [],
      bankAccountName, bankAccountNo, bankName, ifscCode, bankAddress,
      salaryDetails: salaryDetails ? JSON.parse(salaryDetails) : {},
      aadharCardNumber, drivingLicenseNumber, panCardNumber,
      facebook, twitter, linkedin, instagram, upworkProfile,
    };

    if (req.files) {
      if (req.files['aadharCardFile']) userData.aadharCardFile = req.files['aadharCardFile'][0].path;
      if (req.files['panCardFile']) userData.panCardFile = req.files['panCardFile'][0].path;
      if (req.files['drivingLicenseFile']) userData.drivingLicenseFile = req.files['drivingLicenseFile'][0].path;
      if (req.files['resume']) userData.resume = req.files['resume'][0].path;
      if (req.files['photo']) userData.photo = req.files['photo'][0].path;
    }

    // Role assignment for signup - allow role selection but default to Employee
    userData.role = req.body.role || 'Employee';

    const user = new User(userData);
    await user.save();

    return res.status(201).json({ message: 'User created', userId: user._id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Missing email or password' });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    const refreshToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    // Get unread notifications count
    const unreadCount = await Notification.countDocuments({ user: user._id, read: false });

    // Send login notification to all employees
    const employees = await User.find({ role: 'Employee' });
    const io = req.app.get('io');
    employees.forEach(employee => {
      io.emit(`login-notification-${employee._id}`, {
        type: 'employee_login',
        message: `${user.firstName} ${user.lastName} has logged in`,
        user: { _id: user._id, firstName: user.firstName, lastName: user.lastName }
      });
    });

    return res.json({
      token,
      refreshToken,
      role: user.role,
      userId: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      unreadNotifications: unreadCount
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create transporter for email
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  secure: true, // Use SSL
  port: 465 // Gmail SSL port
});

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Set token and expiry (1 hour)
    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // Send email
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
   const mailOptions = {
  from: process.env.EMAIL_USER,
  to: email,
  subject: '🔐 Password Reset Request | Your HRMS Account',
  html: `
    <div style="font-family: Arial, sans-serif; background-color: #f5f7fa; padding: 30px;">
      <div style="max-width: 600px; background-color: #ffffff; margin: auto; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        
        <!-- Header -->
        <div style="background-color: #007bff; padding: 20px; text-align: center;">
          <img src="https://ik.imagekit.io/sentyaztie/Dlogo.png?updatedAt=1749928182723" alt="Company Logo" style="height: 60px; margin-bottom: 10px;" />
          <h1 style="color: #ffffff; margin: 0; font-size: 22px;">Password Reset Request</h1>
        </div>

        <!-- Body -->
        <div style="padding: 30px; color: #333333;">
          <p style="font-size: 16px;">Hi there,</p>
          <p style="font-size: 16px;">
            You recently requested to reset your password for your <strong>HRMS</strong> account. Click the button below to proceed:
          </p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #ffc107; color: #000; padding: 12px 25px; text-decoration: none; font-weight: bold; border-radius: 4px; display: inline-block;">
              Reset My Password
            </a>
          </div>

          <p style="font-size: 14px; color: #555;">
            This password reset link will expire in <strong>1 hour</strong>. If you did not request a password reset, please ignore this email or contact our support team.
          </p>

          <p style="font-size: 14px; color: #555;">
            For your security, please do not share this link with anyone.
          </p>

          <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0;" />

          <p style="font-size: 14px; color: #555;">
            Thank you for being part of <strong>SoSapient Inc.</strong>!  
            <br>We’re always here to help you manage your HR needs with ease and security.
          </p>
        </div>

        <!-- Footer -->
        <div style="background-color: #f0f0f0; text-align: center; padding: 20px; font-size: 13px; color: #666;">
          <p style="margin: 5px 0;"><strong>SoSapient Inc.</strong></p>
          <p style="margin: 5px 0;">B4, GECU IT Park, Ujjain Ring Road, Ujjain (M.P.) 456010 </p>
          <p style="margin: 5px 0;">📞 +91-9685533878 | ✉️ hr@sosapient.in</p>
          <p style="margin-top: 10px; font-size: 12px; color: #999;">
            © ${new Date().getFullYear()} SoSapient Inc.. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  `
};

    await transporter.sendMail(mailOptions);
    res.json({ message: 'Password reset email sent' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ message: 'Token and password are required' });

    // Hash the token to compare with stored hash
    const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: resetTokenHash,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) return res.status(400).json({ message: 'Invalid or expired token' });

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update password and clear reset token
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { signup, login, forgotPassword, resetPassword };

