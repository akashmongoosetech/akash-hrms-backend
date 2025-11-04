const Report = require('../models/Report');
const User = require('../models/User');

const createReport = async (req, res) => {
  try {
    const { description, startTime, breakDuration, endTime, workingHours, totalHours } = req.body;
    const employee = req.user._id;
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    const newReport = new Report({
      employee,
      description,
      startTime,
      breakDuration: breakDuration || 0,
      endTime,
      workingHours,
      totalHours,
      date,
    });

    await newReport.save();

    // Populate the report for socket emission
    const populatedReport = await Report.findById(newReport._id).populate('employee', 'firstName lastName email photo');

    // Emit socket event for real-time updates
    const io = req.app.get('io');
    io.emit('reportCreated', populatedReport);

    res.status(201).json({ message: 'Report created successfully', report: populatedReport });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getReports = async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'Employee') {
      query.employee = req.user._id;
    }
    // For Admin and SuperAdmin, query remains empty, so all reports

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const totalReports = await Report.countDocuments(query);
    const reports = await Report.find(query)
      .populate('employee', 'firstName lastName email photo')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      reports,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalReports / limit),
        totalItems: totalReports,
        itemsPerPage: limit
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getReportById = async (req, res) => {
  try {
    const { id } = req.params;
    const report = await Report.findById(id).populate('employee', 'firstName lastName email photo');

    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    // Check if user has permission to view this report
    if (req.user.role === 'Employee' && report.employee._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(report);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const updateReport = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const report = await Report.findById(id);
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    // Check if user has permission to update this report
    if (req.user.role === 'Employee' && report.employee._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const updatedReport = await Report.findByIdAndUpdate(id, updates, { new: true })
      .populate('employee', 'firstName lastName email photo');

    res.json({ message: 'Report updated successfully', report: updatedReport });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const deleteReport = async (req, res) => {
  try {
    const { id } = req.params;

    const report = await Report.findById(id);
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    // Check if user has permission to delete this report
    if (req.user.role === 'Employee' && report.employee._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await Report.findByIdAndDelete(id);

    // Emit socket event for real-time updates
    const io = req.app.get('io');
    io.emit('reportDeleted', id);

    res.json({ message: 'Report deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { createReport, getReports, getReportById, updateReport, deleteReport };