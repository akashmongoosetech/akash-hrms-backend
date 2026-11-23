const Ticket = require('../models/Ticket');
const {
  notifySpecificUser,
  notifyAdminsSuperAdminsExceptActor,
} = require('./notificationController');

const PRIVILEGED_ROLES = ['Admin', 'SuperAdmin'];

const getTickets = async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = {};

    // If user is an Employee, only show tickets assigned to them
    if (userRole === 'Employee') {
      query.employee = userId;
    }

    const totalTickets = await Ticket.countDocuments(query);
    const tickets = await Ticket.find(query)
      .populate('employee', 'firstName lastName email photo')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      tickets,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalTickets / limit),
        totalItems: totalTickets,
        itemsPerPage: limit
      }
    });
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

    // Employees may only read tickets assigned to them.
    const ownerId = ticket.employee?._id || ticket.employee;
    if (req.user.role === 'Employee' && String(ownerId) !== String(req.user._id)) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

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

    // Only the employee the ticket belongs to is notified.
    const actorName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'An administrator';
    await notifySpecificUser({
      userId: ticket.employee?._id || ticket.employee,
      actor: req.user,
      type: 'ticket_created',
      title: 'New Ticket Assigned',
      message: `${actorName} has created a new ticket for you: ${ticket.title}.`,
      data: {
        action: 'created',
        ticketId: ticket._id,
        ticketTitle: ticket.title,
        priority: ticket.priority,
        dueDate: ticket.dueDate,
        actorId: req.user._id,
        actorName,
        link: `/tickets/view/${ticket._id}`,
      },
      entityType: 'Ticket',
      entityId: ticket._id,
      io: req.app.get('io'),
      pushTitle: '🎫 New Ticket Assigned',
      pushUrl: `/tickets/view/${ticket._id}`,
    });

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

    const previousProgress = ticket.currentProgress;
    const previousEmployeeId = String(ticket.employee);
    const previousSnapshot = {
      title: ticket.title,
      description: ticket.description,
      priority: ticket.priority,
      dueDate: ticket.dueDate ? new Date(ticket.dueDate).toISOString() : null,
    };

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

    // Update only whitelisted fields (prevents reassignment / arbitrary patching)
    const assignableFields = req.user.role === 'Employee'
      ? ['title', 'description', 'priority', 'dueDate']
      : ['title', 'description', 'priority', 'dueDate', 'employee', 'currentProgress', 'progress'];

    for (const field of assignableFields) {
      if (updates[field] !== undefined) ticket[field] = updates[field];
    }

    await ticket.save();
    await ticket.populate([
      { path: 'employee', select: 'firstName lastName email photo' },
      { path: 'progress.updatedBy', select: 'firstName lastName role' }
    ]);

    const employeeId = ticket.employee?._id || ticket.employee;
    const actorName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'An administrator';
    const progressChanged = Number(previousProgress) !== Number(ticket.currentProgress);
    const isPrivilegedActor = PRIVILEGED_ROLES.includes(req.user.role);
    const ticketData = {
      ticketId: ticket._id,
      ticketTitle: ticket.title,
      previousProgress,
      currentProgress: ticket.currentProgress,
      actorId: req.user._id,
      actorName,
      link: `/tickets/view/${ticket._id}`,
    };

    if (progressChanged) {
      if (isPrivilegedActor) {
        // Admin/SuperAdmin progress update -> only the assigned employee.
        await notifySpecificUser({
          userId: employeeId,
          actor: req.user,
          type: 'ticket_progress_updated',
          title: 'Ticket Progress Updated',
          message: `${actorName} has updated the progress of your ticket ${ticket.title} to ${ticket.currentProgress}%.`,
          data: { ...ticketData, action: 'progress_updated' },
          entityType: 'Ticket',
          entityId: ticket._id,
          io: req.app.get('io'),
          pushTitle: '📈 Ticket Progress Updated',
          pushUrl: `/tickets/view/${ticket._id}`,
        });
      } else {
        // Employee progress update -> all Admins and SuperAdmins.
        await notifyAdminsSuperAdminsExceptActor({
          actor: req.user,
          type: 'ticket_progress_updated',
          title: 'Ticket Progress Updated',
          message: `${actorName} has updated the progress of ticket ${ticket.title} to ${ticket.currentProgress}%.`,
          data: {
            ...ticketData,
            action: 'progress_updated',
            employeeId: req.user._id,
            employeeName: actorName,
          },
          entityType: 'Ticket',
          entityId: ticket._id,
          io: req.app.get('io'),
          pushTitle: '📈 Ticket Progress Updated',
          pushUrl: `/tickets/view/${ticket._id}`,
        });
      }
    } else if (isPrivilegedActor) {
      // Admin/SuperAdmin edits (title, description, priority, due date or
      // assignment) notify the assigned employee. Progress-only flows are
      // handled above so a single action never produces two notifications.
      const nextSnapshot = {
        title: ticket.title,
        description: ticket.description,
        priority: ticket.priority,
        dueDate: ticket.dueDate ? new Date(ticket.dueDate).toISOString() : null,
      };
      const detailsChanged =
        Object.keys(nextSnapshot).some((key) => nextSnapshot[key] !== previousSnapshot[key]) ||
        String(ticket.employee?._id || ticket.employee) !== previousEmployeeId;

      if (detailsChanged) {
        await notifySpecificUser({
          userId: employeeId,
          actor: req.user,
          type: 'ticket_updated',
          title: 'Ticket Updated',
          message: `${actorName} has updated your ticket: ${ticket.title}.`,
          data: {
            ...ticketData,
            action: 'updated',
            priority: ticket.priority,
            dueDate: ticket.dueDate,
          },
          entityType: 'Ticket',
          entityId: ticket._id,
          io: req.app.get('io'),
          pushTitle: '📝 Ticket Updated',
          pushUrl: `/tickets/view/${ticket._id}`,
        });
      }
    }

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

    // Only the employee the ticket belonged to is notified.
    const actorName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'An administrator';
    await notifySpecificUser({
      userId: ticket.employee,
      actor: req.user,
      type: 'ticket_deleted',
      title: 'Ticket Deleted',
      message: `${actorName} has deleted your ticket: ${ticket.title}.`,
      data: {
        action: 'deleted',
        ticketId: ticket._id,
        ticketTitle: ticket.title,
        actorId: req.user._id,
        actorName,
        link: '/tickets',
      },
      entityType: 'Ticket',
      entityId: ticket._id,
      io: req.app.get('io'),
      pushTitle: '🗑️ Ticket Removed',
      pushUrl: '/tickets',
    });

    res.json({ message: 'Ticket deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getTickets, getTicketById, createTicket, updateTicket, deleteTicket };