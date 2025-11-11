const bcrypt = require('bcryptjs');
const User = require('../models/User');
const webpush = require('web-push');

const getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const totalUsers = await User.countDocuments();
    const users = await User.find({}, '-password').populate('department').sort({ createdAt: -1 }).skip(skip).limit(limit);

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

    const user = await User.findByIdAndDelete(id);
    if (!user) return res.status(404).json({ message: 'User not found' });

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

    return res.status(201).json({ message: 'User created', userId: user._id });
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