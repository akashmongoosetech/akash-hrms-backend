const AlternateSaturday = require('../models/AlternateSaturday');

// Get all alternate Saturdays
const getAlternateSaturdays = async (req, res) => {
  try {
    const alternateSaturdays = await AlternateSaturday.find().sort({ year: 1, month: 1 });
    res.json({ alternateSaturdays });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create or update alternate Saturdays (bulk operation)
const saveAlternateSaturdays = async (req, res) => {
  try {
    const { alternateSaturdays } = req.body;

    if (!Array.isArray(alternateSaturdays)) {
      return res.status(400).json({ message: 'alternateSaturdays must be an array' });
    }

    // Validate each entry
    for (const entry of alternateSaturdays) {
      if (!entry.month || !entry.year || !Array.isArray(entry.workingSaturdays)) {
        return res.status(400).json({ message: 'Each entry must have month, year, and workingSaturdays as an array' });
      }

      if (entry.month < 1 || entry.month > 12) {
        return res.status(400).json({ message: 'Month must be between 1 and 12' });
      }

      if (entry.year < 2020 || entry.year > 2030) {
        return res.status(400).json({ message: 'Year must be between 2020 and 2030' });
      }

      // Validate workingSaturdays array
      if (!entry.workingSaturdays.every(num => Number.isInteger(num) && num >= 1 && num <= 5)) {
        return res.status(400).json({ message: 'Working Saturdays must be integers between 1 and 5' });
      }

      // Check for duplicates in the array
      if (entry.workingSaturdays.length !== new Set(entry.workingSaturdays).size) {
        return res.status(400).json({ message: 'Working Saturdays array cannot contain duplicates' });
      }
    }

    // Use bulk operations for efficiency
    const bulkOps = alternateSaturdays.map(entry => ({
      updateOne: {
        filter: { month: entry.month, year: entry.year },
        update: {
          month: entry.month,
          year: entry.year,
          workingSaturdays: entry.workingSaturdays
        },
        upsert: true
      }
    }));

    await AlternateSaturday.bulkWrite(bulkOps);

    res.json({ message: 'Alternate Saturdays saved successfully' });
  } catch (err) {
    console.error(err);
    if (err.code === 11000) {
      res.status(400).json({ message: 'Duplicate entry for month and year' });
    } else {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
};

// Get alternate Saturday for a specific month and year
const getAlternateSaturday = async (req, res) => {
  try {
    const { month, year } = req.params;

    const alternateSaturday = await AlternateSaturday.findOne({
      month: parseInt(month),
      year: parseInt(year)
    });

    if (!alternateSaturday) {
      return res.status(404).json({ message: 'Alternate Saturday not found for this month' });
    }

    res.json(alternateSaturday);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete alternate Saturday for a specific month and year
const deleteAlternateSaturday = async (req, res) => {
  try {
    const { month, year } = req.params;

    const result = await AlternateSaturday.findOneAndDelete({
      month: parseInt(month),
      year: parseInt(year)
    });

    if (!result) {
      return res.status(404).json({ message: 'Alternate Saturday not found' });
    }

    res.json({ message: 'Alternate Saturday deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getAlternateSaturdays,
  saveAlternateSaturdays,
  getAlternateSaturday,
  deleteAlternateSaturday
};