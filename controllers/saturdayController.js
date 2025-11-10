const Saturday = require('../models/Saturday');

// Get Saturdays for a specific year and optionally month
const getSaturdays = async (req, res) => {
  try {
    const { year, month } = req.query;

    if (!year) {
      return res.status(400).json({ message: 'Year is required' });
    }

    const query = { year: parseInt(year) };
    if (month) {
      query.month = parseInt(month);
    }

    const saturdays = await Saturday.find(query).sort({ date: 1 });

    res.json(saturdays);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all Saturdays
const getAllSaturdays = async (req, res) => {
  try {
    const saturdays = await Saturday.find().sort({ date: 1 });
    res.json(saturdays);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create or update Saturday setting
const createOrUpdateSaturday = async (req, res) => {
  try {
    const { date, isWeekend } = req.body;

    if (!date) {
      return res.status(400).json({ message: 'Date is required' });
    }

    const saturdayDate = new Date(date);
    const year = saturdayDate.getFullYear();
    const month = saturdayDate.getMonth();

    // Check if Saturday already exists
    let saturday = await Saturday.findOne({ date: saturdayDate });

    if (saturday) {
      // Update existing
      saturday.isWeekend = isWeekend !== undefined ? isWeekend : saturday.isWeekend;
      await saturday.save();
      res.json({ message: 'Saturday updated successfully', saturday });
    } else {
      // Create new
      saturday = new Saturday({
        date: saturdayDate,
        isWeekend: isWeekend || false,
        year,
        month
      });
      await saturday.save();
      res.status(201).json({ message: 'Saturday created successfully', saturday });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Update Saturday setting
const updateSaturday = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const saturday = await Saturday.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    if (!saturday) return res.status(404).json({ message: 'Saturday not found' });

    res.json({ message: 'Saturday updated successfully', saturday });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Delete Saturday setting
const deleteSaturday = async (req, res) => {
  try {
    const { id } = req.params;

    const saturday = await Saturday.findByIdAndDelete(id);
    if (!saturday) return res.status(404).json({ message: 'Saturday not found' });

    res.json({ message: 'Saturday deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Bulk update Saturdays
const bulkUpdateSaturdays = async (req, res) => {
  try {
    const { saturdays } = req.body;

    if (!saturdays || !Array.isArray(saturdays)) {
      return res.status(400).json({ message: 'Saturdays array is required' });
    }

    const bulkOps = [];

    saturdays.forEach(item => {
      const { year, month, dates } = item;
      dates.forEach(dateObj => {
        const { date: dateStr, isWeekend } = dateObj;
        const date = new Date(dateStr);

        if (isWeekend) {
          bulkOps.push({
            updateOne: {
              filter: { date: date },
              update: {
                date: date,
                isWeekend: true,
                year: parseInt(year),
                month: parseInt(month)
              },
              upsert: true
            }
          });
        } else {
          bulkOps.push({
            deleteOne: {
              filter: { date: date }
            }
          });
        }
      });
    });

    const result = await Saturday.bulkWrite(bulkOps);

    res.json({
      message: 'Saturdays updated successfully',
      modifiedCount: result.modifiedCount,
      upsertedCount: result.upsertedCount,
      deletedCount: result.deletedCount
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = {
  getSaturdays,
  getAllSaturdays,
  createOrUpdateSaturday,
  updateSaturday,
  deleteSaturday,
  bulkUpdateSaturdays
};