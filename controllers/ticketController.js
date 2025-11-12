const Ticket = require('../models/Ticket');
const User = require('../models/User');
const { createNotificationsForAllUsers } = require('./notificationController');
const webpush = require('web-push');

const getTickets = async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user.id;

    let query = {};

    // If user is an Employee, only show tickets assigned to them
    if (userRole === 'Employee') {
      query.employee = userId;
    }

    const tickets = await Ticket.find(query)
      .populate('employee', 'firstName lastName email photo')
      .sort({ createdAt: -1 });
    res.json(tickets);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getTicketById = async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate('employee', 'firstName lastName email photo')
      .populate('progress.updatedBy', 'firstName lastName role');
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    res.json(ticket);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const createTicket = async (req, res) => {
  try {
    const { title, employee, priority, dueDate, description } = req.body;

    if (!title || !employee || !priority || !dueDate || !description) {
      return res.status(400).json({ message: 'All required fields must be provided' });
    }

    const ticketData = {
      title,
      employee,
      priority,
      dueDate,
      description
    };

    const ticket = new Ticket(ticketData);
    await ticket.save();

    // Populate ticket with employee data
    await ticket.populate('employee', 'firstName lastName email photo');

    // Create persistent notifications for all users
    try {
      await createNotificationsForAllUsers(
        'ticket_created',
        'New Ticket Assigned',
        `New ticket "${title}" assigned to ${ticket.employee.firstName} ${ticket.employee.lastName}`,
        { ticketId: ticket._id, ticketTitle: title, employeeName: `${ticket.employee.firstName} ${ticket.employee.lastName}` }
      );
    } catch (notificationError) {
      console.error('Error creating notifications:', notificationError);
      // Don't fail the ticket creation if notifications fail
    }

    // Get all users to send push notifications
    const allUsers = await User.find({ status: 'Active' });

    // Emit real-time notification to all users
    const io = req.app.get('io');
    allUsers.forEach(user => {
      io.emit(`ticket-notification-${user._id}`, {
        type: 'new_ticket',
        message: `New ticket assigned: ${title}`,
        ticket: ticket
      });
    });

    // Send push notifications to all users
    const notificationPayload = {
      title: '🎫 New Ticket Assigned',
      body: `${title} assigned to ${ticket.employee.firstName} ${ticket.employee.lastName}`,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      url: '/tickets',
      data: {
        ticketId: ticket._id,
        type: 'new_ticket'
      }
    };

    // Send push notifications to all subscribed users
    const pushPromises = allUsers.map(async (user) => {
      if (user.pushSubscriptions && user.pushSubscriptions.length > 0) {
        const promises = user.pushSubscriptions.map(subscription =>
          webpush.sendNotification(subscription, JSON.stringify(notificationPayload))
            .catch(error => {
              // Remove invalid subscriptions
              if (error.statusCode === 410) {
                User.findByIdAndUpdate(user._id, {
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

    res.status(201).json({ message: 'Ticket created successfully', ticket });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const updateTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const ticket = await Ticket.findById(id);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    // Check if user is Employee and not the assigned employee
    if (req.user.role === 'Employee' && ticket.employee.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Forbidden: You can only update your own tickets' });
    }

    // Handle progress updates
    if (updates.progressUpdate) {
      const { date, workingHours, progress } = updates.progressUpdate;

      // For employees, add to progress array
      if (req.user.role === 'Employee') {
        // Validation: Cannot update progress below current progress
        if (progress < ticket.currentProgress) {
          return res.status(400).json({ message: 'Cannot update progress below current progress' });
        }

        // Get the last updated date
        let lastUpdatedDate;
        if (ticket.progress && ticket.progress.length > 0) {
          lastUpdatedDate = new Date(ticket.progress[ticket.progress.length - 1].date);
        } else {
          lastUpdatedDate = new Date(ticket.createdAt);
        }

        const selectedDate = new Date(date);
        // Validation: Cannot update progress before the last updated date
        if (selectedDate <= lastUpdatedDate) {
          return res.status(400).json({ message: 'You cannot update progress before the last updated date.' });
        }

        ticket.progress.push({
          date: date || new Date(),
          workingHours: workingHours || 0,
          progress: progress || 0,
          updatedBy: req.user.id
        });
        ticket.currentProgress = progress || ticket.currentProgress;
      } else {
        // For admins/superadmins, directly set current progress
        if (updates.currentProgress < ticket.currentProgress) {
          return res.status(400).json({ message: 'Cannot update progress below current progress' });
        }
        ticket.currentProgress = updates.currentProgress || ticket.currentProgress;
      }

      delete updates.progressUpdate;
      delete updates.currentProgress;
    }

    // Update other fields
    Object.assign(ticket, updates);

    await ticket.save();
    await ticket.populate([
      { path: 'employee', select: 'firstName lastName email photo' },
      { path: 'progress.updatedBy', select: 'firstName lastName role' }
    ]);

    // Create persistent notifications for all users
    try {
      await createNotificationsForAllUsers(
        'ticket_updated',
        'Ticket Updated',
        `Ticket "${ticket.title}" has been updated`,
        { ticketId: ticket._id, ticketTitle: ticket.title }
      );
    } catch (notificationError) {
      console.error('Error creating notifications:', notificationError);
      // Don't fail the ticket update if notifications fail
    }

    // Get all users to send push notifications
    const allUsers = await User.find({ status: 'Active' });

    // Emit real-time notification to all users
    const io = req.app.get('io');
    allUsers.forEach(user => {
      io.emit(`ticket-notification-${user._id}`, {
        type: 'updated_ticket',
        message: `Ticket updated: ${ticket.title}`,
        ticket: ticket
      });
    });

    // Send push notifications to all users
    const notificationPayload = {
      title: '📈 Ticket Updated',
      body: `Ticket "${ticket.title}" has been updated`,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      url: '/tickets',
      data: {
        ticketId: ticket._id,
        type: 'updated_ticket'
      }
    };

    // Send push notifications to all subscribed users
    const pushPromises = allUsers.map(async (user) => {
      if (user.pushSubscriptions && user.pushSubscriptions.length > 0) {
        const promises = user.pushSubscriptions.map(subscription =>
          webpush.sendNotification(subscription, JSON.stringify(notificationPayload))
            .catch(error => {
              // Remove invalid subscriptions
              if (error.statusCode === 410) {
                User.findByIdAndUpdate(user._id, {
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

    res.json({ message: 'Ticket updated successfully', ticket });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const deleteTicket = async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await Ticket.findByIdAndDelete(id);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    // Create persistent notifications for all users
    try {
      await createNotificationsForAllUsers(
        'ticket_deleted',
        'Ticket Removed',
        `Ticket "${ticket.title}" has been deleted`,
        { ticketId: id, ticketTitle: ticket.title }
      );
    } catch (notificationError) {
      console.error('Error creating notifications:', notificationError);
      // Don't fail the ticket deletion if notifications fail
    }

    // Get all users to send push notifications
    const allUsers = await User.find({ status: 'Active' });

    // Emit real-time notification to all users
    const io = req.app.get('io');
    allUsers.forEach(user => {
      io.emit(`ticket-notification-${user._id}`, {
        type: 'deleted_ticket',
        message: `Ticket deleted: ${ticket.title}`,
        ticket: { _id: id, title: ticket.title }
      });
    });

    // Send push notifications to all users
    const notificationPayload = {
      title: '🗑️ Ticket Removed',
      body: `Ticket "${ticket.title}" has been deleted`,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      url: '/tickets',
      data: {
        ticketId: id,
        type: 'deleted_ticket'
      }
    };

    // Send push notifications to all subscribed users
    const pushPromises = allUsers.map(async (user) => {
      if (user.pushSubscriptions && user.pushSubscriptions.length > 0) {
        const promises = user.pushSubscriptions.map(subscription =>
          webpush.sendNotification(subscription, JSON.stringify(notificationPayload))
            .catch(error => {
              // Remove invalid subscriptions
              if (error.statusCode === 410) {
                User.findByIdAndUpdate(user._id, {
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

    res.json({ message: 'Ticket deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getTickets, getTicketById, createTicket, updateTicket, deleteTicket };