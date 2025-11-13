const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const DeletedEmployee = require('../models/DeletedEmployee');
const webpush = require('web-push');

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

// Send welcome email to new employee
const sendWelcomeEmail = async (user) => {
  try {
    const loginUrl = `${process.env.FRONTEND_URL}/login`;
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: `🎉 Welcome to SoSapient Inc. | Your Onboarding Details`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #f5f7fa; padding: 40px 0;">
          <div style="max-width: 650px; margin: auto; background: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">

            <!-- Header Section -->
            <div style="background: linear-gradient(135deg, #007bff, #28a745); text-align: center; padding: 30px;">
              <img src="https://ik.imagekit.io/sentyaztie/Dlogo.png?updatedAt=1749928182723" alt="SoSapient Logo" style="height: 70px; margin-bottom: 15px;" />
              <h1 style="color: #ffffff; font-size: 26px; margin: 0;">Welcome Aboard, ${user.firstName}!</h1>
              <p style="color: #e3fcef; font-size: 15px; margin: 10px 0 0;">We're thrilled to have you join SoSapient Inc.</p>
            </div>

            <!-- Main Body -->
            <div style="padding: 35px 30px; color: #333333;">

              <p style="font-size: 16px; line-height: 1.6;">Dear <strong>${user.firstName} ${user.lastName}</strong>,</p>

              <p style="font-size: 16px; line-height: 1.6;">
                Congratulations and welcome to <strong>SoSapient Inc.</strong>! You’ve officially joined us as a valued 
                <strong>${user.role}</strong>. We’re excited to start this journey with you and can’t wait to see the impact you’ll make.
              </p>

              <!-- Account Details Card -->
              <div style="background-color: #f8fafc; border-left: 5px solid #007bff; padding: 20px; border-radius: 6px; margin: 25px 0;">
                <h3 style="margin-top: 0; color: #007bff;">📋 Your Account Details</h3>
                <p style="margin: 5px 0;"><strong>Email:</strong> ${user.email}</p>
                <p style="margin: 5px 0;"><strong>Role:</strong> ${user.role}</p>
                <p style="margin: 5px 0;"><strong>Joining Date:</strong> ${user.joiningDate ? new Date(user.joiningDate).toLocaleDateString() : 'Not specified'}</p>
                <p style="margin: 5px 0;"><strong>Status:</strong> ${user.status}</p>
              </div>

              <!-- Onboarding Info -->
              <p style="font-size: 16px; line-height: 1.6;">
                As part of your onboarding, you’ll gain access to our <strong>HRMS Platform</strong> where you can:
              </p>
              <ul style="font-size: 15px; line-height: 1.7; color: #555;">
                <li>Manage your personal profile and documents 📄</li>
                <li>Access company policies and employee resources 📘</li>
                <li>Track attendance, leaves, and performance 🌟</li>
                <li>Stay updated with announcements and events 📅</li>
              </ul>

              <!-- Call to Action -->
              <div style="text-align: center; margin: 35px 0;">
                <a href="${loginUrl}" 
                  style="background: linear-gradient(90deg, #007bff, #28a745); color: #fff; padding: 14px 35px; 
                         text-decoration: none; font-size: 16px; border-radius: 50px; display: inline-block; 
                         font-weight: bold; box-shadow: 0 4px 10px rgba(0, 123, 255, 0.3); transition: all 0.3s ease;">
                  Access Your Account
                </a>
              </div>

              <p style="font-size: 15px; color: #555;">
                You can log in using your registered email and password. For any issues or guidance during your onboarding, our HR team is always here to help.
              </p>

              <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />

              <p style="font-size: 15px; color: #555;">
                Once again, welcome to the <strong>SoSapient family</strong>! We believe that your talent and enthusiasm will help us grow stronger together. Let’s build a smarter and more innovative tomorrow.
              </p>

              <p style="font-size: 15px; color: #007bff; text-align: center; font-style: italic; margin-top: 25px;">
                “Great journeys begin with great teams — and we’re glad you’re part of ours!”
              </p>
            </div>

            <!-- Footer -->
            <div style="background-color: #f0f0f0; text-align: center; padding: 20px; font-size: 13px; color: #666;">
              <p style="margin: 5px 0;"><strong>SoSapient Inc.</strong></p>
              <p style="margin: 5px 0;">B4, GECU IT Park, Ujjain Ring Road, Ujjain (M.P.) 456010</p>
              <p style="margin: 5px 0;">📞 +91-9685533878 | ✉️ <a href="mailto:hr@sosapient.in" style="color: #007bff; text-decoration: none;">hr@sosapient.in</a></p>
              <p style="margin-top: 10px; font-size: 12px; color: #999;">
                © ${new Date().getFullYear()} SoSapient Inc. All rights reserved.
              </p>
            </div>

          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`✨ Welcome email sent successfully to ${user.email}`);
  } catch (error) {
    console.error('Error sending welcome email:', error);
  }
};


const getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const totalUsers = await User.countDocuments({ status: { $ne: 'Deleted' } });
    const users = await User.find({ status: { $ne: 'Deleted' } }, '-password').populate('department').sort({ createdAt: -1 }).skip(skip).limit(limit);

    res.json({
      users,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalUsers / limit),
        totalItems: totalUsers,
        itemsPerPage: limit
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id, '-password').populate('department');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    let updates = req.body;

    // Check if user is trying to update their own profile or has admin privileges
    const isOwnProfile = req.user._id.toString() === id;
    const isAdminOrSuperAdmin = ['Admin', 'SuperAdmin'].includes(req.user.role);

    if (!isOwnProfile && !isAdminOrSuperAdmin) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }

    // If user is updating their own profile, restrict certain fields
    if (isOwnProfile && !isAdminOrSuperAdmin) {
      // Employees can only update non-sensitive fields
      const allowedFields = [
        'firstName', 'lastName', 'email', 'gender', 'dob', 'mobile1', 'mobile2',
        'address1', 'address2', 'emergencyContact1', 'emergencyContact2', 'emergencyContact3',
        'skillsFrontend', 'skillsBackend', 'bankAccountName', 'bankAccountNo', 'bankName',
        'ifscCode', 'bankAddress', 'aadharCardNumber', 'drivingLicenseNumber', 'panCardNumber',
        'facebook', 'twitter', 'linkedin', 'instagram', 'upworkProfile', 'salary'
      ];

      // Filter updates to only allowed fields
      const filteredUpdates = {};
      for (const field of allowedFields) {
        if (Object.prototype.hasOwnProperty.call(updates, field)) {
          filteredUpdates[field] = updates[field];
        }
      }
      updates = filteredUpdates;
    }

    // Parse JSON fields if they are strings
    if (updates.skillsFrontend && typeof updates.skillsFrontend === 'string') {
      updates.skillsFrontend = JSON.parse(updates.skillsFrontend);
    }
    if (updates.skillsBackend && typeof updates.skillsBackend === 'string') {
      updates.skillsBackend = JSON.parse(updates.skillsBackend);
    }
    if (updates.salaryDetails && typeof updates.salaryDetails === 'string') {
      updates.salaryDetails = JSON.parse(updates.salaryDetails);
    }

    // Handle file uploads
    if (req.files) {
      if (req.files['aadharCardFile']) updates.aadharCardFile = req.files['aadharCardFile'][0].path;
      if (req.files['panCardFile']) updates.panCardFile = req.files['panCardFile'][0].path;
      if (req.files['drivingLicenseFile']) updates.drivingLicenseFile = req.files['drivingLicenseFile'][0].path;
      if (req.files['resume']) updates.resume = req.files['resume'][0].path;
      if (req.files['photo']) updates.photo = req.files['photo'][0].path;
    }

    // Handle password update
    if (updates.password && updates.password.trim() !== '') {
      updates.password = await bcrypt.hash(updates.password, 10);
    } else {
      delete updates.password; // Don't update if empty
    }

    // Role hierarchy check: only SuperAdmin can assign SuperAdmin role
    if (updates.role && updates.role === 'SuperAdmin' && req.user.role !== 'SuperAdmin') {
      return res.status(403).json({ message: 'Only SuperAdmin can assign SuperAdmin role' });
    }

    // Admins can only update roles to Employee or Admin, not SuperAdmin
    if (updates.role && req.user.role === 'Admin' && updates.role === 'SuperAdmin') {
      return res.status(403).json({ message: 'Admins cannot assign SuperAdmin role' });
    }

    const user = await User.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ message: 'User updated successfully', user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent deleting own account
    if (req.user._id.toString() === id) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Check if already deleted
    const existingDeleted = await DeletedEmployee.findOne({ email: user.email });
    if (existingDeleted) {
      return res.status(400).json({ message: 'User already deleted' });
    }

    // Save to deleted employees table
    const deletedEmployee = new DeletedEmployee({
      email: user.email,
      originalUserId: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      department: user.department,
      deletedBy: req.user._id,
      reason: req.body.reason || ''
    });
    await deletedEmployee.save();

    // Update user status to Deleted
    await User.findByIdAndUpdate(id, { status: 'Deleted' });

    // Emit logout event to the deleted user on all devices
    const io = req.app.get('io');
    io.to(id).emit('logout', { reason: 'account_deleted' });

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const createUser = async (req, res) => {
  try {
    const {
      firstName, lastName, email, gender, dob, joiningDate,
      mobile1, mobile2, password, address1, address2,
      emergencyContact1, emergencyContact2, emergencyContact3,
      skillsFrontend, skillsBackend, bankAccountName, bankAccountNo,
      bankName, ifscCode, bankAddress, salaryDetails, salary,
      aadharCardNumber, drivingLicenseNumber, panCardNumber,
      facebook, twitter, linkedin, instagram, upworkProfile, role, department, status
    } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ message: 'Email already registered' });

    // Role assignment restrictions
    let assignedRole = 'Employee';
    if (role) {
      if (req.user.role === 'SuperAdmin') {
        assignedRole = role; // SuperAdmin can assign any role
      } else if (req.user.role === 'Admin' && ['Employee', 'Admin'].includes(role)) {
        assignedRole = role; // Admin can assign Employee or Admin
      } else {
        assignedRole = 'Employee'; // Default to Employee if unauthorized
      }
    }

    const hashed = await bcrypt.hash(password, 10);

    const userData = {
      firstName, lastName, email, gender, dob, joiningDate,
      mobile1, mobile2, password: hashed, address1, address2,
      emergencyContact1, emergencyContact2, emergencyContact3,
      skillsFrontend: skillsFrontend ? JSON.parse(skillsFrontend) : [],
      skillsBackend: skillsBackend ? JSON.parse(skillsBackend) : [],
      bankAccountName, bankAccountNo, bankName, ifscCode, bankAddress,
      salaryDetails: salaryDetails ? JSON.parse(salaryDetails) : {},
      salary: salary ? parseFloat(salary) : undefined,
      aadharCardNumber, drivingLicenseNumber, panCardNumber,
      facebook, twitter, linkedin, instagram, upworkProfile,
      role: assignedRole, status: status || 'Active', department,
    };

    if (req.files) {
      if (req.files['aadharCardFile']) userData.aadharCardFile = req.files['aadharCardFile'][0].path;
      if (req.files['panCardFile']) userData.panCardFile = req.files['panCardFile'][0].path;
      if (req.files['drivingLicenseFile']) userData.drivingLicenseFile = req.files['drivingLicenseFile'][0].path;
      if (req.files['resume']) userData.resume = req.files['resume'][0].path;
      if (req.files['photo']) userData.photo = req.files['photo'][0].path;
    }

    const user = new User(userData);
    await user.save();

    // Send welcome email to new employee
    await sendWelcomeEmail(user);

    return res.status(201).json({ message: 'User created successfully', userId: user._id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const subscribePush = async (req, res) => {
  try {
    const { subscription } = req.body;
    const userId = req.user._id;

    // Find user and add subscription
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Check if subscription already exists
    const existingSubscription = user.pushSubscriptions.find(
      sub => sub.endpoint === subscription.endpoint
    );

    if (!existingSubscription) {
      user.pushSubscriptions.push(subscription);
      await user.save();
    }

    res.json({ message: 'Subscription added successfully' });
  } catch (error) {
    console.error('Error subscribing to push notifications:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const unsubscribePush = async (req, res) => {
  try {
    const userId = req.user._id;

    // Remove all subscriptions for this user
    await User.findByIdAndUpdate(userId, { pushSubscriptions: [] });

    res.json({ message: 'Unsubscribed successfully' });
  } catch (error) {
    console.error('Error unsubscribing from push notifications:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const saveDashboardPreferences = async (req, res) => {
  try {
    const { projects, teams, todos, tickets } = req.body;
    const userId = req.user._id;

    const user = await User.findByIdAndUpdate(
      userId,
      {
        dashboardPreferences: {
          projects: projects ?? true,
          teams: teams ?? true,
          todos: todos ?? true,
          tickets: tickets ?? true,
        }
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: 'Dashboard preferences saved successfully',
      preferences: user.dashboardPreferences
    });
  } catch (error) {
    console.error('Error saving dashboard preferences:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const getDashboardPreferences = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId).select('dashboardPreferences');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      preferences: user.dashboardPreferences || {
        projects: true,
        teams: true,
        todos: true,
        tickets: true,
      }
    });
  } catch (error) {
    console.error('Error getting dashboard preferences:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getUsers, getUserById, updateUser, deleteUser, createUser, subscribePush, unsubscribePush, saveDashboardPreferences, getDashboardPreferences };