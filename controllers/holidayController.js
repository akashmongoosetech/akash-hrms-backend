const Holiday = require('../models/Holiday');
const User = require('../models/User');

const getHolidays = async (req, res) => {
  try {
    const search = req.query.search || '';

    let query = {};
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const holidays = await Holiday.find(query).sort({ date: 1 });

    res.json(holidays);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getHolidayById = async (req, res) => {
  try {
    const holiday = await Holiday.findById(req.params.id);
    if (!holiday) return res.status(404).json({ message: 'Holiday not found' });
    res.json(holiday);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const createHoliday = async (req, res) => {
  try {
    const { name, date } = req.body;

    if (!name || !date) {
      return res.status(400).json({ message: 'Name and date are required' });
    }

    const holiday = new Holiday({ name, date });
    await holiday.save();

    // Get all employees to send notifications
    const employees = await User.find({ role: 'Employee' });

    // Emit real-time notification to all employees
    const io = req.app.get('io');
    employees.forEach(employee => {
      io.emit(`holiday-notification-${employee._id}`, {
        type: 'new_holiday',
        message: `New holiday: ${name}`,
        holiday: holiday
      });
    });

    res.status(201).json({ message: 'Holiday created successfully', holiday });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const updateHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const holiday = await Holiday.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    if (!holiday) return res.status(404).json({ message: 'Holiday not found' });

    // Get all employees to send notifications
    const employees = await User.find({ role: 'Employee' });

    // Emit real-time notification to all employees
    const io = req.app.get('io');
    employees.forEach(employee => {
      io.emit(`holiday-notification-${employee._id}`, {
        type: 'updated_holiday',
        message: `Holiday updated: ${holiday.name}`,
        holiday: holiday
      });
    });

    res.json({ message: 'Holiday updated successfully', holiday });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const deleteHoliday = async (req, res) => {
  try {
    const { id } = req.params;

    const holiday = await Holiday.findByIdAndDelete(id);
    if (!holiday) return res.status(404).json({ message: 'Holiday not found' });

    // Get all employees to send notifications
    const employees = await User.find({ role: 'Employee' });

    // Emit real-time notification to all employees
    const io = req.app.get('io');
    employees.forEach(employee => {
      io.emit(`holiday-notification-${employee._id}`, {
        type: 'deleted_holiday',
        message: `Holiday deleted: ${holiday.name}`,
        holiday: holiday
      });
    });

    res.json({ message: 'Holiday deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getHolidays, getHolidayById, createHoliday, updateHoliday, deleteHoliday };