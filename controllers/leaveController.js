const Leave = require('../models/Leave');
const User = require('../models/User');

const requestLeave = async (req, res) => {
  try {
    const { startDate, endDate, leaveType, reason } = req.body;
    const employee = req.user._id;

    // Validate leaveType
    if (!['Vacation', 'Sick', 'Personal'].includes(leaveType)) {
      return res.status(400).json({ message: 'Invalid leave type' });
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) {
      return res.status(400).json({ message: 'End date must be after or equal to start date' });
    }

    // Calculate days requested (inclusive)
    const daysRequested = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

    const leave = new Leave({
      employee,
      startDate,
      endDate,
      leaveType,
      reason,
      daysRequested
    });

    await leave.save();
    res.status(201).json({ message: 'Leave request submitted successfully', leave });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getLeaves = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = {};
    if (req.user.role === 'Employee') {
      query.employee = req.user._id;
    }

    const totalLeaves = await Leave.countDocuments(query);
    const leaves = await Leave.find(query)
      .populate('employee', 'firstName lastName email')
      .populate('approvedBy', 'firstName lastName')
      .populate('rejectedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      leaves,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalLeaves / limit),
        totalItems: totalLeaves,
        itemsPerPage: limit
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const updateLeaveStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, comments } = req.body;

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const leave = await Leave.findById(id);
    if (!leave) return res.status(404).json({ message: 'Leave not found' });

    leave.status = status;
    if (status === 'Approved') {
      leave.approvedBy = req.user._id;
    } else if (status === 'Rejected') {
      leave.rejectedBy = req.user._id;
    }
    if (comments) leave.comments = comments;

    await leave.save();
    res.json({ message: 'Leave status updated successfully', leave });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const deleteLeave = async (req, res) => {
  try {
    const { id } = req.params;
    const leave = await Leave.findByIdAndDelete(id);
    if (!leave) return res.status(404).json({ message: 'Leave not found' });
    res.json({ message: 'Leave deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { requestLeave, getLeaves, updateLeaveStatus, deleteLeave };