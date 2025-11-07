const Break = require('../models/Break');
const User = require('../models/User');

const createBreak = async (req, res) => {
  try {
    const { action, reason } = req.body;
    const employee = req.user._id;
    const now = new Date();
    const date = now.toISOString().split('T')[0]; // YYYY-MM-DD

    // Validation for Break In: check if already on break
    if (action === 'Break In') {
      const lastBreak = await Break.findOne({ employee, date }).sort({ timestamp: -1 });
      if (lastBreak && lastBreak.action === 'Break In') {
        return res.status(400).json({ message: 'You are already on break' });
      }
    }

    // Validation for Break Out: check if on break
    if (action === 'Break Out') {
      const lastBreak = await Break.findOne({ employee, date }).sort({ timestamp: -1 });
      if (!lastBreak || lastBreak.action === 'Break Out') {
        return res.status(400).json({ message: 'You are not on break' });
      }
    }

    const newBreak = new Break({
      employee,
      action,
      reason: action === 'Break In' ? reason : undefined,
      timestamp: now,
      date,
    });

    await newBreak.save();

    // Emit socket event for live updates
    const io = req.app.get('io');
    const populatedBreak = await Break.findById(newBreak._id).populate('employee', 'firstName lastName photo');
    io.emit('newBreak', populatedBreak);

    res.status(201).json({ message: 'Break recorded successfully', break: newBreak });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const createBreakByAdmin = async (req, res) => {
  try {
    const { employeeId, action, reason } = req.body;
    const addedBy = req.user._id;
    const now = new Date();
    const date = now.toISOString().split('T')[0]; // YYYY-MM-DD

    // Check if employee exists
    const employee = await User.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    // Validation for Break In: check if already on break
    if (action === 'Break In') {
      const lastBreak = await Break.findOne({ employee: employeeId }).sort({ timestamp: -1 });
      if (lastBreak && lastBreak.action === 'Break In') {
        return res.status(400).json({ message: 'Employee is already on break' });
      }
    }

    // Validation for Break Out: check if on break
    if (action === 'Break Out') {
      const lastBreak = await Break.findOne({ employee: employeeId }).sort({ timestamp: -1 });
      if (!lastBreak || lastBreak.action === 'Break Out') {
        return res.status(400).json({ message: 'Employee is not on break' });
      }
    }

    const newBreak = new Break({
      employee: employeeId,
      action,
      reason: action === 'Break In' ? reason : undefined,
      timestamp: now,
      date,
      addedBy,
    });

    await newBreak.save();

    // Emit socket event for live updates
    const io = req.app.get('io');
    const populatedBreak = await Break.findById(newBreak._id).populate('employee', 'firstName lastName photo').populate('addedBy', 'role firstName lastName');
    io.emit('newBreak', populatedBreak);

    res.status(201).json({ message: 'Break recorded successfully by admin', break: newBreak });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getBreaks = async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'Employee') {
      query.employee = req.user._id;
    }
    // For Admin and SuperAdmin, query remains empty, so all breaks
    const breaks = await Break.find(query).populate('employee', 'firstName lastName photo').populate('addedBy', 'role firstName lastName').sort({ timestamp: -1 });
    res.json(breaks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getEmployees = async (req, res) => {
  try {
    const employees = await User.find({ role: 'Employee' }, 'firstName lastName _id');
    res.json(employees);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getBreakDuration = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    let query = { date: today };
    if (req.user.role === 'Employee') {
      query.employee = req.user._id;
    }

    const breaks = await Break.find(query).sort({ timestamp: 1 });

    let totalBreakDuration = 0;
    let breakStart = null;

    breaks.forEach(breakRecord => {
      if (breakRecord.action === 'Break In') {
        breakStart = new Date(breakRecord.timestamp);
      } else if (breakRecord.action === 'Break Out' && breakStart) {
        const breakEnd = new Date(breakRecord.timestamp);
        totalBreakDuration += (breakEnd - breakStart) / (1000 * 60); // in minutes
        breakStart = null;
      }
    });

    // If still on break, calculate from break start to now
    if (breakStart) {
      const now = new Date();
      totalBreakDuration += (now - breakStart) / (1000 * 60);
    }

    res.json({ totalBreakDuration: Math.round(totalBreakDuration) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getBreakStatus = async (req, res) => {
  try {
    const employeeId = req.user._id;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Get the last break record for today
    const lastBreak = await Break.findOne({
      employee: employeeId,
      date: today
    }).sort({ timestamp: -1 });

    // If no breaks today or last action was Break Out, not on break
    const isOnBreak = lastBreak && lastBreak.action === 'Break In';

    res.json({ isOnBreak });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { createBreak, createBreakByAdmin, getBreaks, getEmployees, getBreakDuration, getBreakStatus };