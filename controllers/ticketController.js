const Ticket = require('../models/Ticket');

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
      .populate('employee', 'firstName lastName email')
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
      .populate('employee', 'firstName lastName email');
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    // Check if user is Employee and not the assigned employee
    if (req.user.role === 'Employee' && ticket.employee._id.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden: You can only view your own tickets' });
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
    if (req.user.role === 'Employee' && ticket.employee.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden: You can only update your own tickets' });
    }

    const updatedTicket = await Ticket.findByIdAndUpdate(id, updates, { new: true, runValidators: true })
      .populate('employee', 'firstName lastName email');

    res.json({ message: 'Ticket updated successfully', ticket: updatedTicket });
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

    res.json({ message: 'Ticket deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getTickets, getTicketById, createTicket, updateTicket, deleteTicket };