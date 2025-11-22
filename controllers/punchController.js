const PunchTime = require('../models/PunchTime');
const User = require('../models/User');

const punchIn = async (req, res) => {
  try {
    const employee = req.user._id;

    // Check if already punched in
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

    const punchTime = new PunchTime({
      employee,
      punchInTime: new Date()
    });

    await punchTime.save();

    // Emit socket event for live updates
    const io = req.app.get('io');
    io.emit('punch-in', { employee: req.user, punchTime });

    res.status(201).json({ message: 'Punched in successfully', punchTime });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

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
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getPunchTimes = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = {};
    if (req.user.role === 'Employee') {
      query.employee = req.user._id;
    }

    // Add filters for employee, fromDate, toDate
    if (req.query.employee && req.user.role !== 'Employee') {
      query.employee = req.query.employee;
    }
    if (req.query.fromDate) {
      query.createdAt = { ...query.createdAt, $gte: new Date(req.query.fromDate) };
    }
    if (req.query.toDate) {
      const toDate = new Date(req.query.toDate);
      toDate.setHours(23, 59, 59, 999); // End of day
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
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getCurrentPunchStatus = async (req, res) => {
  try {
    const employee = req.user._id;
    const currentPunch = await PunchTime.findOne({ employee, punchOutTime: null }).sort({ createdAt: -1 });
    res.json({ isPunchedIn: !!currentPunch, punchTime: currentPunch });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { punchIn, punchOut, getPunchTimes, getCurrentPunchStatus };