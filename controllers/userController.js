const bcrypt = require('bcryptjs');
const User = require('../models/User');

const getUsers = async (req, res) => {
  try {
    let users;
    if (req.user.role === 'Employee') {
      // Employees can only see other employees
      users = await User.find({ role: 'Employee' }, '-password').sort({ createdAt: -1 });
    } else {
      // Admins and SuperAdmins can see all users
      users = await User.find({}, '-password').sort({ createdAt: -1 });
    }
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id, '-password');
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
    const updates = req.body;

    // Prevent updating password through this endpoint
    delete updates.password;

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
      bankName, ifscCode, bankAddress, salaryDetails,
      aadharCardNumber, drivingLicenseNumber, panCardNumber,
      facebook, twitter, linkedin, instagram, upworkProfile, role
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

    const hashed = await bcrypt.hash(password, 12);

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
      role: assignedRole,
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

module.exports = { getUsers, getUserById, updateUser, deleteUser, createUser };