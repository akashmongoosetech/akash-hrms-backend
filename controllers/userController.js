const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const User = require('../models/User');
const Department = require('../models/Department');
const DeletedEmployee = require('../models/DeletedEmployee');
const { notifyUsers } = require('./notificationController');
const webpush = require('web-push');

// Human-readable labels for the profile notification. Any field that is not in
// this map still gets a generated label, so newly added editable fields are
// covered without code changes.
const PROFILE_FIELD_LABELS = {
  firstName: 'Name',
  lastName: 'Name',
  photo: 'Profile Picture',
  email: 'Email Address',
  mobile1: 'Mobile Number',
  mobile2: 'Alternate Mobile Number',
  dob: 'Date of Birth',
  gender: 'Gender',
  address1: 'Address',
  address2: 'Address',
  department: 'Department',
  role: 'Role',
  salary: 'Salary',
  salaryDetails: 'Salary Details',
  joiningDate: 'Joining Date',
  status: 'Employment Status',
  bankAccountName: 'Bank Account Name',
  bankAccountNo: 'Bank Account Number',
  bankName: 'Bank Name',
  ifscCode: 'IFSC Code',
  bankAddress: 'Bank Address',
  aadharCardNumber: 'Aadhaar Card Number',
  panCardNumber: 'PAN Card Number',
  drivingLicenseNumber: 'Driving License Number',
  emergencyContact1: 'Emergency Contact',
  emergencyContact2: 'Emergency Contact',
  emergencyContact3: 'Emergency Contact',
  employeeCode: 'Employee Code',
  leaveBalance: 'Leave Balance',
  skillsFrontend: 'Frontend Skills',
  skillsBackend: 'Backend Skills',
  facebook: 'Facebook Profile',
  twitter: 'Twitter Profile',
  linkedin: 'LinkedIn Profile',
  instagram: 'Instagram Profile',
  upworkProfile: 'Upwork Profile',
};

// Values of these fields are never written into notification text/metadata.
const SENSITIVE_PROFILE_FIELDS = new Set([
  'password', 'salary', 'salaryDetails', 'bankAccountName', 'bankAccountNo',
  'bankName', 'ifscCode', 'bankAddress', 'aadharCardNumber', 'panCardNumber',
  'drivingLicenseNumber',
]);

// Structured fields are identified but their raw JSON is not shown.
const OBJECT_PROFILE_FIELDS = new Set([
  'department', 'leaveBalance', 'salaryDetails', 'skillsFrontend', 'skillsBackend',
]);

const profileFieldLabel = (field) =>
  PROFILE_FIELD_LABELS[field]
  || field.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase()).trim();

const sortKeysDeep = (value) => {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    if (value._bsontype === 'ObjectId' || value instanceof mongoose.Types.ObjectId) return String(value);
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = sortKeysDeep(value[key]);
      return acc;
    }, {});
  }
  return value;
};

const comparableValue = (field, value) => {
  if (value === undefined || value === null || value === '') return '';
  if (field === 'dob' || field === 'joiningDate') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  }
  if (field === 'salary') {
    const amount = Number(value);
    return Number.isNaN(amount) ? '' : String(amount);
  }
  if (typeof value === 'object') {
    const plain = typeof value.toObject === 'function' ? value.toObject() : value;
    try {
      return JSON.stringify(sortKeysDeep(plain));
    } catch {
      return String(value);
    }
  }
  return String(value).trim();
};

const displayProfileValue = (field, value, departmentNames) => {
  if (value === undefined || value === null || value === '') return 'Not set';
  if (field === 'department') {
    return departmentNames.get(String(value)) || 'another department';
  }
  if (field === 'dob' || field === 'joiningDate') {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  return String(value);
};

const joinLabels = (labels) => {
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
};

const buildProfileUpdateMessage = async (actorName, fields, before, updates) => {
  let departmentNames = new Map();
  if (fields.includes('department')) {
    const departmentIds = [...new Set(
      [before.department, updates.department].filter(Boolean).map((id) => String(id))
    )];
    const departments = await Department.find({ _id: { $in: departmentIds } }).select('name');
    departmentNames = new Map(departments.map((department) => [String(department._id), department.name]));
  }

  if (fields.length === 1 && fields[0] === 'photo') {
    return `${actorName} has updated your profile picture.`;
  }

  const nameFields = fields.filter((field) => field === 'firstName' || field === 'lastName');
  const otherFields = fields.filter((field) => field !== 'firstName' && field !== 'lastName');

  if (nameFields.length && otherFields.length === 0) {
    const oldName = `${before.firstName || ''} ${before.lastName || ''}`.trim();
    const newName = `${updates.firstName ?? before.firstName ?? ''} ${updates.lastName ?? before.lastName ?? ''}`.trim();
    return `${actorName} has updated your profile. Your Name was changed from ${oldName} to ${newName}.`;
  }

  if (fields.length === 1) {
    const field = fields[0];
    const label = profileFieldLabel(field);
    if (SENSITIVE_PROFILE_FIELDS.has(field) || OBJECT_PROFILE_FIELDS.has(field)) {
      return `${actorName} has updated your ${label}.`;
    }
    const oldValue = displayProfileValue(field, before.get(field), departmentNames);
    const newValue = displayProfileValue(field, updates[field], departmentNames);
    return `${actorName} has updated your ${label} from ${oldValue} to ${newValue}.`;
  }

  const labels = [...new Set(fields.map(profileFieldLabel))];
  return `${actorName} has updated your profile. Modified fields: ${joinLabels(labels)}.`;
};

// Directory-level projection: safe for any authenticated employee to read.
const DIRECTORY_FIELDS = [
  'firstName', 'lastName', 'photo', 'role', 'department', 'email',
  'mobile1', 'gender', 'joiningDate', 'status', 'employeeCode'
].join(' ');

// Roles that may read the full employee record (payroll / identity documents).
const PERSONNEL_ROLES = ['Admin', 'SuperAdmin', 'HR'];

// Fields an employee may change on their own profile.
// NOTE: email, salary, role, status and employeeCode are intentionally excluded.
const SELF_SERVICE_FIELDS = [
  'firstName', 'lastName', 'gender', 'dob', 'mobile1', 'mobile2',
  'address1', 'address2', 'emergencyContact1', 'emergencyContact2', 'emergencyContact3',
  'skillsFrontend', 'skillsBackend', 'bankAccountName', 'bankAccountNo', 'bankName',
  'ifscCode', 'bankAddress', 'aadharCardNumber', 'drivingLicenseNumber', 'panCardNumber',
  'facebook', 'twitter', 'linkedin', 'instagram', 'upworkProfile'
];

// Fields an Admin/SuperAdmin may change on another user's record.
const ADMIN_MANAGED_FIELDS = [
  'firstName', 'lastName', 'email', 'gender', 'dob', 'joiningDate', 'mobile1', 'mobile2',
  'address1', 'address2', 'emergencyContact1', 'emergencyContact2', 'emergencyContact3',
  'skillsFrontend', 'skillsBackend', 'bankAccountName', 'bankAccountNo', 'bankName',
  'ifscCode', 'bankAddress', 'salary', 'salaryDetails', 'aadharCardNumber',
  'drivingLicenseNumber', 'panCardNumber', 'facebook', 'twitter', 'linkedin', 'instagram',
  'upworkProfile', 'role', 'status', 'department', 'employeeCode', 'leaveBalance'
];

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const sanitizeBody = (body = {}) => {
  const clean = {};
  for (const key of Object.keys(body)) {
    if (!DANGEROUS_KEYS.has(key)) clean[key] = body[key];
  }
  return clean;
};

const pickFields = (source, allowed) => {
  const picked = {};
  for (const field of allowed) {
    if (Object.prototype.hasOwnProperty.call(source, field)) picked[field] = source[field];
  }
  return picked;
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
                <p style="margin: 5px 0;"><strong>Employee Code:</strong> ${user.employeeCode}</p>
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

    let query = { status: { $ne: 'Deleted' } };
    if (req.query.role) {
      // Handle comma-separated roles
      const roles = req.query.role.split(',').map(role => role.trim());
      if (roles.length > 1) {
        query.role = { $in: roles };
      } else {
        query.role = req.query.role;
      }
    }
    if (req.query.status) {
      query.status = req.query.status;
    }

    const totalUsers = await User.countDocuments(query);
    // Only personnel roles may see payroll / identity data. Everyone else gets
    // the directory projection.
    const projection = PERSONNEL_ROLES.includes(req.user.role) ? '-password' : DIRECTORY_FIELDS;
    const users = await User.find(query, projection)
      .populate('department')
      // _id is a tiebreaker: many imports share createdAt, and an unstable sort
      // makes skip/limit pages return the same rows twice.
      .sort({ createdAt: -1, _id: 1 })
      .skip(skip)
      .limit(limit);

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

const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id, '-password').populate('department');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getUserById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isSelf = req.user._id.toString() === req.params.id;
    const canViewFullProfile = isSelf || PERSONNEL_ROLES.includes(req.user.role);

    const user = await User.findById(
      req.params.id,
      canViewFullProfile ? '-password' : DIRECTORY_FIELDS
    ).populate('department');

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
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: 'User not found' });
    }

    const target = await User.findById(id);
    if (!target) return res.status(404).json({ message: 'User not found' });

    // Check if user is trying to update their own profile or has admin privileges
    const isOwnProfile = req.user._id.toString() === id;
    const isAdminOrSuperAdmin = ['Admin', 'SuperAdmin'].includes(req.user.role);
    const isSuperAdmin = req.user.role === 'SuperAdmin';

    if (!isOwnProfile && !isAdminOrSuperAdmin) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }

    // Only a SuperAdmin may modify a SuperAdmin account. This closes the
    // "Admin resets a SuperAdmin password" account-takeover path.
    if (!isOwnProfile && target.role === 'SuperAdmin' && !isSuperAdmin) {
      return res.status(403).json({ message: 'Forbidden: only a SuperAdmin can modify a SuperAdmin account' });
    }

    // Never trust the client to decide which fields are writable.
    let updates = sanitizeBody(req.body);

    if (isAdminOrSuperAdmin) {
      updates = pickFields(updates, ADMIN_MANAGED_FIELDS);
    } else {
      // Employees editing their own profile.
      updates = pickFields(updates, SELF_SERVICE_FIELDS);
    }

    // Parse JSON fields if they are strings (FormData always sends strings)
    for (const jsonField of ['skillsFrontend', 'skillsBackend', 'salaryDetails']) {
      if (typeof updates[jsonField] === 'string') {
        try {
          updates[jsonField] = JSON.parse(updates[jsonField]);
        } catch {
          return res.status(400).json({ message: `Invalid JSON in ${jsonField}` });
        }
      }
    }

    // Handle file uploads
    if (req.files) {
      if (req.files['aadharCardFile']) updates.aadharCardFile = req.files['aadharCardFile'][0].path;
      if (req.files['panCardFile']) updates.panCardFile = req.files['panCardFile'][0].path;
      if (req.files['drivingLicenseFile']) updates.drivingLicenseFile = req.files['drivingLicenseFile'][0].path;
      if (req.files['resume']) updates.resume = req.files['resume'][0].path;
      if (req.files['photo']) updates.photo = req.files['photo'][0].path;
    }

    // Password changes are only ever allowed on your own account.
    if (isOwnProfile && typeof req.body.password === 'string' && req.body.password.trim() !== '') {
      updates.password = await bcrypt.hash(req.body.password, 10);
    }

    // Handle employeeCode: generate if not provided and user doesn't have one
    if (!updates.employeeCode || String(updates.employeeCode).trim() === '') {
      if (!target.employeeCode) {
        // Generate new employee code
        const lastUser = await User.findOne({ employeeCode: { $regex: /^SOEM/ } }).sort({ employeeCode: -1 });
        let nextNumber = 1;
        if (lastUser && lastUser.employeeCode) {
          const lastNumber = parseInt(lastUser.employeeCode.replace('SOEM', ''));
          nextNumber = lastNumber + 1;
        }
        updates.employeeCode = `SOEM${nextNumber.toString().padStart(3, '0')}`;
      } else {
        // Keep existing code
        delete updates.employeeCode;
      }
    }

    // Role assignment rules
    if (updates.role) {
      const assignableRoles = isSuperAdmin
        ? ['Employee', 'HR', 'Manager', 'Admin', 'SuperAdmin']
        : ['Employee', 'HR', 'Manager', 'Admin'];

      if (!assignableRoles.includes(updates.role)) {
        return res.status(403).json({ message: 'Forbidden: you cannot assign this role' });
      }

      // Nobody may change their own role (prevents self-elevation and lockouts).
      if (isOwnProfile) {
        delete updates.role;
      }
    }

    // Status is only ever Active/Inactive through this endpoint.
    // Account deletion goes through DELETE /api/users/:id.
    if (updates.status && !['Active', 'Inactive'].includes(updates.status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    // Detect real changes before writing. Comparing the incoming payload with
    // the stored document means unchanged fields never generate a notification
    // and newly added editable fields are covered automatically.
    const modifiedFields = Object.keys(updates).filter((field) => {
      if (field === 'password') return false;
      const incoming = updates[field];
      if (incoming === undefined) return false;
      return comparableValue(field, target.get(field)) !== comparableValue(field, incoming);
    });

    const user = await User.findByIdAndUpdate(id, updates, { new: true, runValidators: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Only a different user's profile, edited by an Admin/SuperAdmin, produces a
    // notification. Notification delivery never fails the update itself.
    if (!isOwnProfile && isAdminOrSuperAdmin && modifiedFields.length > 0) {
      const actorName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'An administrator';
      const message = await buildProfileUpdateMessage(actorName, modifiedFields, target, updates);

      await notifyUsers({
        recipients: [user._id],
        type: 'employee_profile_updated',
        title: 'Your Profile Was Updated',
        message,
        data: {
          action: 'profile_updated',
          changedFields: modifiedFields.map((field) => ({
            field,
            label: profileFieldLabel(field),
          })),
          actorId: req.user._id,
          actorName,
          link: '/profile',
        },
        actor: req.user,
        entityType: 'User',
        entityId: user._id,
        io: req.app.get('io'),
        pushTitle: 'Your Profile Was Updated',
      });
    }

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

    // Generate employee code if not provided
    let employeeCode = req.body.employeeCode;
    if (!employeeCode || employeeCode.trim() === '') {
      const lastUser = await User.findOne({ employeeCode: { $regex: /^SOEM/ } }).sort({ employeeCode: -1 });
      let nextNumber = 1;
      if (lastUser && lastUser.employeeCode) {
        const lastNumber = parseInt(lastUser.employeeCode.replace('SOEM', ''));
        nextNumber = lastNumber + 1;
      }
      employeeCode = `SOEM${nextNumber.toString().padStart(3, '0')}`;
    }

    // Role assignment restrictions
    let assignedRole = 'Employee';
    if (role) {
      if (req.user.role === 'SuperAdmin') {
        assignedRole = role; // SuperAdmin can assign any role
      } else if (req.user.role === 'Admin' && ['Employee', 'Admin', 'HR', 'Manager'].includes(role)) {
        assignedRole = role; // Admin can assign Employee, Admin, HR, or Manager
      } else {
        assignedRole = 'Employee'; // Default to Employee if unauthorized
      }
    }

    const hashed = await bcrypt.hash(password, 10);

    const userData = {
      employeeCode,
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

module.exports = { getCurrentUser, getUsers, getUserById, updateUser, deleteUser, createUser, subscribePush, unsubscribePush, saveDashboardPreferences, getDashboardPreferences };