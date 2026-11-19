const PunchTime = require('../models/PunchTime');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for selfie uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `selfie-${req.user._id}-${uniqueSuffix}${ext}`);
  }
});

// File filter: allow only images
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type'), false);
  }
};

const upload = multer({ storage, fileFilter });

/**
 * POST /api/punches/in
 * Employee punch-in with verification (selfie + GPS)
 * Multipart/form-data:
 *   - selfie: file
 *   - latitude: number
 *   - longitude: number
 *   - accuracy: number
 *   - timestamp: string (ISO)
 *   - deviceInfo: optional JSON string
 */
const punchIn = async (req, res) => {
  try {
    const employee = req.user._id;

    // Check if already punched in (no punch-out yet)
    const existingPunch = await PunchTime.findOne({ employee, punchOutTime: null });
    if (existingPunch) {
      return res.status(400).json({ message: 'Already punched in' });
    }

    // Check if already punched out today
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of day (12:00 AM)
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todaysPunchOut = await PunchTime.findOne({
      employee,
      punchOutTime: { $exists: true, $ne: null },
      punchInTime: { $gte: today, $lt: tomorrow }
    });

    if (todaysPunchOut) {
      return res.status(400).json({ message: 'You already punched out for today.' });
    }

    // Validate required verification fields
    if (!req.body.latitude || !req.body.longitude || !req.body.accuracy) {
      return res.status(400).json({ message: 'Location data (latitude, longitude, accuracy) is required' });
    }

    const accuracy = parseFloat(req.body.accuracy);
    // Configurable threshold: require accuracy within 250 meters for verification
    const MAX_ACCURACY = parseFloat(process.env.PUNCH_IN_ACCURACY_THRESHOLD || '250');

    if (accuracy > MAX_ACCURACY) {
      return res.status(400).json({ 
        message: `GPS accuracy too low (${accuracy.toFixed(1)}m). Required: within ${MAX_ACCURACY}m for workplace verification.` 
      });
    }

    // Handle selfie upload
    let selfieFilename = null;
    if (req.file) {
      selfieFilename = req.file.filename;
    } else {
      return res.status(400).json({ message: 'Selfie image is required for punch-in verification' });
    }

    // Build location object
    const location = {
      latitude: parseFloat(req.body.latitude),
      longitude: parseFloat(req.body.longitude),
      accuracy,
      address: req.body.address || '',
      city: req.body.city || '',
      state: req.body.state || '',
      area: req.body.area || '',
      postalCode: req.body.postalCode || ''
    };

    // Create PunchTime record (backward compatible)
    const punchTime = new PunchTime({
      employee,
      punchInTime: new Date()
    });

    // Create Attendance record with verification data
    const attendance = new Attendance({
      employeeId: employee,
      punchInTime: new Date(),
      punchInSelfie: selfieFilename,
      punchInLocation: location,
      verificationStatus: 'pending',
      deviceInfo: req.body.deviceInfo ? JSON.parse(req.body.deviceInfo) : {}
    });

    // Save both records
    await punchTime.save();
    await attendance.save();

    // Emit socket event for live updates
    const io = req.app.get('io');
    io.emit('punch-in', { employee: req.user, punchTime, attendance });

    res.status(201).json({ 
      message: 'Punch-in verification submitted successfully', 
      punchTime,
      attendance 
    });
  } catch (err) {
    console.error('Punch-in error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * POST /api/punches/out
 * Employee punch-out
 */
const punchOut = async (req, res) => {
  try {
    const employee = req.user._id;

    const punchTime = await PunchTime.findOne({ employee, punchOutTime: null });
    if (!punchTime) {
      return res.status(400).json({ message: 'Not punched in' });
    }

    const punchOutTime = new Date();
    const totalDuration = punchOutTime - punchTime.punchInTime;

    punchTime.punchOutTime = punchOutTime;
    punchTime.totalDuration = totalDuration;

    await punchTime.save();

    // Emit socket event for live updates
    const io = req.app.get('io');
    io.emit('punch-out', { employee: req.user, punchTime });

    res.json({ message: 'Punched out successfully', punchTime });
  } catch (err) {
    console.error('Punch-out error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * GET /api/punches/my-attendance
 * Get attendance records for the authenticated employee
 */
const getMyAttendance = async (req, res) => {
  try {
    const employee = req.user._id;

    const attendanceRecords = await Attendance.find({ employeeId: employee })
      .sort({ punchInTime: -1 })
      .limit(30);

    res.json({ attendanceRecords });
  } catch (err) {
    console.error('Get my attendance error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * GET /api/attendance/current-location
 * Get the latest verified location for the authenticated employee
 */
const getCurrentLocation = async (req, res) => {
  try {
    const employee = req.user._id;

    const latest = await Attendance.findOne({ employeeId: employee })
      .sort({ punchInTime: -1 })
      .select('punchInLocation verificationStatus createdAt');

    if (!latest) {
      return res.json({ hasLocation: false });
    }

    res.json({
      hasLocation: true,
      punchInLocation: latest.punchInLocation,
      verificationStatus: latest.verificationStatus,
      punchInTime: latest.punchInTime
    });
  } catch (err) {
    console.error('Get current location error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * GET /api/punches - Get punch times with pagination and filters
 */
const getPunchTimes = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = {};
    if (req.user.role === 'Employee') {
      query.employee = req.user._id;
    }

    if (req.query.employee && req.user.role !== 'Employee') {
      query.employee = req.query.employee;
    }
    if (req.query.fromDate) {
      query.createdAt = { ...query.createdAt, $gte: new Date(req.query.fromDate) };
    }
    if (req.query.toDate) {
      const toDate = new Date(req.query.toDate);
      toDate.setHours(23, 59, 59, 999);
      query.createdAt = { ...query.createdAt, $lte: toDate };
    }

    const totalPunchTimes = await PunchTime.countDocuments(query);
    const punchTimes = await PunchTime.find(query)
      .populate('employee', 'firstName lastName photo')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      punchTimes,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalPunchTimes / limit),
        totalItems: totalPunchTimes,
        itemsPerPage: limit
      }
    });
  } catch (err) {
    console.error('Get punch times error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * GET /api/punches/status - Get current punch status
 */
const getCurrentPunchStatus = async (req, res) => {
  try {
    const employee = req.user._id;
    const currentPunch = await PunchTime.findOne({ employee, punchOutTime: null }).sort({ createdAt: -1 });
    res.json({ isPunchedIn: !!currentPunch, punchTime: currentPunch });
  } catch (err) {
    console.error('Get current punch status error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = { punchIn, punchOut, getPunchTimes, getCurrentPunchStatus, getMyAttendance, getCurrentLocation };