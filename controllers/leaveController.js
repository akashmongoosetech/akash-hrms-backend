const Leave = require('../models/Leave');
const User = require('../models/User');
const webpush = require('web-push');

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

     // Send notification to admins and super admins
    const io = req.app.get('io');
    const User = require('../models/User');

    // Send push notifications to admins and super admins
    const admins = await User.find({ role: { $in: ['Admin', 'SuperAdmin'] } });

    admins.forEach(admin => {
      io.emit(`leave-notification-${admin._id}`, {
        message: `New leave request from ${req.user.firstName} ${req.user.lastName} (${leaveType})`,
        type: 'leave_request',
        leaveId: leave._id,
        employeeId: req.user._id,
        employeeName: `${req.user.firstName} ${req.user.lastName}`,
        leaveType,
        startDate,
        endDate,
        reason,
        createdAt: new Date()
      });
    });

    // Send push notifications to all subscribed admins
    const pushPromises = admins.map(async (admin) => {
      if (admin.pushSubscriptions && admin.pushSubscriptions.length > 0) {
        const promises = admin.pushSubscriptions.map(subscription =>
          webpush.sendNotification(subscription, JSON.stringify({
            title: '📝 New Leave Request',
            body: `${req.user.firstName} ${req.user.lastName} requested ${leaveType} leave`,
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            url: '/leave',
            data: {
              leaveId: leave._id,
              type: 'leave_request'
            }
          }))
            .catch(error => {
              // Remove invalid subscriptions
              if (error.statusCode === 410) {
                User.findByIdAndUpdate(admin._id, {
                  $pull: { pushSubscriptions: subscription }
                }).exec();
              }
            })
        );
        return Promise.all(promises);
      }
    });

    // Execute all push notification promises
    await Promise.all(pushPromises);

    // Populate the leave with employee data for socket emission
    const populatedLeave = await Leave.findById(leave._id).populate({ path: 'employee', select: 'firstName lastName email', match: { status: 'Active' } });

    // Emit to all connected clients for live updates
    io.emit('leave-created', populatedLeave);

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

    const totalLeaves = await Leave.countDocuments(query);
    const leaves = await Leave.find(query)
      .populate({ path: 'employee', select: 'firstName lastName email', match: { status: 'Active' } })
      .populate({ path: 'approvedBy', select: 'firstName lastName', match: { status: 'Active' } })
      .populate({ path: 'rejectedBy', select: 'firstName lastName', match: { status: 'Active' } })
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

    if (!['Pending', 'Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const leave = await Leave.findById(id).populate({ path: 'employee', select: 'firstName lastName email', match: { status: 'Active' } });
    if (!leave) return res.status(404).json({ message: 'Leave not found' });

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
      .populate({ path: 'employee', select: 'firstName lastName email', match: { status: 'Active' } })
      .populate({ path: 'approvedBy', select: 'firstName lastName', match: { status: 'Active' } })
      .populate({ path: 'rejectedBy', select: 'firstName lastName', match: { status: 'Active' } });

    // Send push notification to employee if status changed
    if (oldStatus !== status) {
      const io = req.app.get('io');
      io.emit(`leave-status-notification-${leave.employee._id}`, {
        message: `Your leave request (${leave.leaveType}) has been ${status.toLowerCase()}`,
        type: 'leave_status_update',
        leaveId: leave._id,
        status,
        leaveType: leave.leaveType,
        startDate: leave.startDate,
        endDate: leave.endDate,
        updatedBy: `${req.user.firstName} ${req.user.lastName}`,
        comments,
        createdAt: new Date()
      });

      
      const employee = await User.findById(leave.employee);
      if (employee && employee.role === 'Employee') {
        const notificationPayload = {
          title: status === 'Approved' ? '✅ Leave Approved' : status === 'Rejected' ? '❌ Leave Rejected' : '⏳ Leave Status Updated',
          body: `Your ${leave.leaveType} leave request has been ${status.toLowerCase()}`,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          url: '/leave',
          data: {
            leaveId: leave._id,
            type: 'leave_status_update'
          }
        };

        // Send push notification to the employee
        if (employee.pushSubscriptions && employee.pushSubscriptions.length > 0) {
          const promises = employee.pushSubscriptions.map(subscription =>
            webpush.sendNotification(subscription, JSON.stringify(notificationPayload))
              .catch(error => {
                // Remove invalid subscriptions
                if (error.statusCode === 410) {
                  User.findByIdAndUpdate(employee._id, {
                    $pull: { pushSubscriptions: subscription }
                  }).exec();
                }
              })
          );
          await Promise.all(promises);
        }
      }
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
      .populate({ path: 'employee', select: 'firstName lastName email', match: { status: 'Active' } })
      .populate({ path: 'approvedBy', select: 'firstName lastName', match: { status: 'Active' } })
      .populate({ path: 'rejectedBy', select: 'firstName lastName', match: { status: 'Active' } });

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