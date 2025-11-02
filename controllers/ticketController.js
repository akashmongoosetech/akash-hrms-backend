const Ticket = require('../models/Ticket');

const getTickets = async (req, res) => {
  try {
    const tickets = await Ticket.find()
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

    const ticket = await Ticket.findByIdAndUpdate(id, updates, { new: true, runValidators: true })
      .populate('employee', 'firstName lastName email');
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

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

    res.json({ message: 'Ticket deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getTickets, getTicketById, createTicket, updateTicket, deleteTicket };