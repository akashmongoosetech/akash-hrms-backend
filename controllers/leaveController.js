const Leave = require('../models/Leave');
const Team = require('../models/Team');
const { notifyUsers, notifySpecificUser, getUserIdsByRoles, getManagerIdsForEmployee } = require('./notificationController');

const formatLeaveDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const requestLeave = async (req, res) => {
  try {
    const { startDate, endDate, leaveType, reason } = req.body;
    const employee = req.user._id;

    // Validate leaveType
    if (!['Casual', 'Sick', 'Earned', 'Vacation', 'Personal'].includes(leaveType)) {
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

    // Notify all Admins, all SuperAdmins and the applicant's assigned
    // manager(s). The applicant is always excluded by the service, and the
    // recipient list is resolved from the database, never from the client.
    const applicantName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Employee';
    const startLabel = formatLeaveDate(leave.startDate);
    const endLabel = formatLeaveDate(leave.endDate);
    const managerIds = await getManagerIdsForEmployee(req.user._id);
    const adminIds = await getUserIdsByRoles(['Admin', 'SuperAdmin']);
    const recipients = [...adminIds, ...managerIds];

    if (recipients.length) {
      await notifyUsers({
        recipients,
        exclude: req.user._id,
        type: 'leave_applied',
        title: 'New Leave Application',
        message: `${applicantName} has submitted a new leave application for ${startLabel} to ${endLabel}.`,
        data: {
          action: 'applied',
          leaveId: leave._id,
          leaveType: leave.leaveType,
          startDate: leave.startDate,
          endDate: leave.endDate,
          daysRequested: leave.daysRequested,
          reason: leave.reason,
          employeeId: req.user._id,
          employeeName: applicantName,
          managerIds,
          actorId: req.user._id,
          actorName: applicantName,
          link: '/leave',
        },
        actor: req.user,
        entityType: 'Leave',
        entityId: leave._id,
        io: req.app.get('io'),
        pushTitle: '📝 New Leave Request',
        pushUrl: '/leave',
      });
    }

    // Populate the leave with employee data for socket emission
    const populatedLeave = await Leave.findById(leave._id).populate({ path: 'employee', select: 'firstName lastName email photo' });

    // Emit to all connected clients for live updates
    const io = req.app.get('io');
    if (io) io.emit('leave-created', populatedLeave);

    res.status(201).json({ message: 'Leave request submitted successfully', leave: populatedLeave });
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

    // Add filters
    if (req.query.employee && req.user.role !== 'Employee') {
      query.employee = req.query.employee;
    }
    if (req.query.fromDate) {
      query.startDate = { $gte: new Date(req.query.fromDate) };
    }
    if (req.query.toDate) {
      query.endDate = { $lte: new Date(req.query.toDate) };
    }

    const totalLeaves = await Leave.countDocuments(query);
    const leaves = await Leave.find(query)
      .populate({ path: 'employee', select: 'firstName lastName email photo' })
      .populate({ path: 'approvedBy', select: 'firstName lastName' })
      .populate({ path: 'rejectedBy', select: 'firstName lastName' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      leaves,
      totalPages: Math.ceil(totalLeaves / limit),
      totalItems: totalLeaves
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

    if (!['Pending', 'Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const leave = await Leave.findById(id).populate({ path: 'employee', select: 'firstName lastName email photo' });
    if (!leave) return res.status(404).json({ message: 'Leave not found' });

    // Managers may only decide on leave requests for members of their own
    // teams. Admins and SuperAdmins keep full access.
    if (req.user.role === 'Manager') {
      const ownsRequest = await Team.exists({
        manager: req.user._id,
        status: 'Active',
        teamMembers: leave.employee?._id || leave.employee,
      });
      if (!ownsRequest) {
        return res.status(403).json({ message: 'Forbidden: this employee is not in your team' });
      }
    }

    const oldStatus = leave.status;
    leave.status = status;
    if (status === 'Approved') {
      leave.approvedBy = req.user._id;
      leave.rejectedBy = undefined;
    } else if (status === 'Rejected') {
      leave.rejectedBy = req.user._id;
      leave.approvedBy = undefined;
    } else if (status === 'Pending') {
      leave.approvedBy = undefined;
      leave.rejectedBy = undefined;
    }
    if (comments) leave.comments = comments;

    await leave.save();

    // Populate the leave with updated data for socket emission
    const updatedLeave = await Leave.findById(id)
      .populate({ path: 'employee', select: 'firstName lastName email photo' })
      .populate({ path: 'approvedBy', select: 'firstName lastName' })
      .populate({ path: 'rejectedBy', select: 'firstName lastName' });

    // Send notification ONLY to the employee when status actually changes
    if (oldStatus !== status) {
      const approverName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'An administrator';
      const startLabel = formatLeaveDate(leave.startDate);
      const endLabel = formatLeaveDate(leave.endDate);

      const messageByStatus = {
        Approved: `Your leave application has been approved by ${approverName}.`,
        Rejected: `Your leave application has been rejected by ${approverName}.`,
        Pending: `Your leave application status has been changed to Pending by ${approverName}.`,
      };

      await notifySpecificUser({
        userId: leave.employee?._id || leave.employee,
        actor: req.user,
        type: 'leave_status_updated',
        title: `Leave ${status}`,
        message: messageByStatus[status] || `Your leave application status has been changed to ${status} by ${approverName}.`,
        data: {
          action: 'status_updated',
          leaveId: leave._id,
          leaveType: leave.leaveType,
          startDate: leave.startDate,
          endDate: leave.endDate,
          status,
          previousStatus: oldStatus,
          approverName,
          actorId: req.user._id,
          actorName: approverName,
          link: '/leave',
        },
        entityType: 'Leave',
        entityId: leave._id,
        io: req.app.get('io'),
        pushTitle: status === 'Approved' ? '✅ Leave Approved' : status === 'Rejected' ? '❌ Leave Rejected' : '⏳ Leave Status Updated',
        pushUrl: '/leave',
      });
    }

    // Emit to all connected clients for live updates
    const io = req.app.get('io');
    io.emit('leave-updated', updatedLeave);

    res.json({ message: 'Leave status updated successfully', leave: updatedLeave });
  } catch (err) {
    console.error('Error in updateLeaveStatus:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const updateLeave = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate, leaveType, reason } = req.body;

    // Validate leaveType
    if (!['Casual', 'Sick', 'Earned', 'Vacation', 'Personal'].includes(leaveType)) {
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

    const leave = await Leave.findById(id);
    if (!leave) return res.status(404).json({ message: 'Leave not found' });

    leave.startDate = startDate;
    leave.endDate = endDate;
    leave.leaveType = leaveType;
    leave.reason = reason;
    leave.daysRequested = daysRequested;

    await leave.save();

    // Populate the leave with updated data for socket emission
    const updatedLeave = await Leave.findById(id)
      .populate({ path: 'employee', select: 'firstName lastName email photo' })
      .populate({ path: 'approvedBy', select: 'firstName lastName' })
      .populate({ path: 'rejectedBy', select: 'firstName lastName' });

    // Emit to all connected clients for live updates
    const io = req.app.get('io');
    io.emit('leave-updated', updatedLeave);

    res.json({ message: 'Leave updated successfully', leave: updatedLeave });
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

    // Emit to all connected clients for live updates
    const io = req.app.get('io');
    io.emit('leave-deleted', id);

    res.json({ message: 'Leave deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { requestLeave, getLeaves, updateLeaveStatus, updateLeave, deleteLeave };