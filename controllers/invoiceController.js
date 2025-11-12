const Invoice = require('../models/Invoice');
const Client = require('../models/Client');

// Generate invoice number
const generateInvoiceNo = async () => {
  const currentYear = new Date().getFullYear();
  const lastInvoice = await Invoice.findOne({ invoiceNo: new RegExp(`^INV-${currentYear}-`) })
    .sort({ createdAt: -1 });

  let nextNumber = 1;
  if (lastInvoice) {
    const lastNumber = parseInt(lastInvoice.invoiceNo.split('-')[2]);
    nextNumber = lastNumber + 1;
  }

  return `INV-${currentYear}-${nextNumber.toString().padStart(4, '0')}`;
};

const getInvoices = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const totalInvoices = await Invoice.countDocuments();
    const invoices = await Invoice.find()
      .populate('client', 'name email country state city')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      invoices,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalInvoices / limit),
        totalItems: totalInvoices,
        itemsPerPage: limit
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getInvoiceById = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).populate('client', 'name email country state city');
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    res.json(invoice);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const createInvoice = async (req, res) => {
  try {
    const { client, date, type, status, amount } = req.body;

    if (!client || !date || !type || !amount) {
      return res.status(400).json({ message: 'Client, date, type, and amount are required' });
    }

    // Verify client exists
    const clientExists = await Client.findById(client);
    if (!clientExists) {
      return res.status(400).json({ message: 'Invalid client' });
    }

    // Generate invoice number
    const invoiceNo = await generateInvoiceNo();

    const invoiceData = {
      invoiceNo,
      client,
      date: new Date(date),
      type,
      status: status || 'Pending',
      amount: parseFloat(amount)
    };

    const invoice = new Invoice(invoiceData);
    await invoice.save();

    // Populate client data for response
    await invoice.populate('client', 'name email country state city');

    res.status(201).json({ message: 'Invoice created successfully', invoice });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const updateInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Convert date if provided
    if (updates.date) {
      updates.date = new Date(updates.date);
    }

    // Convert amount if provided
    if (updates.amount) {
      updates.amount = parseFloat(updates.amount);
    }

    const invoice = await Invoice.findByIdAndUpdate(id, updates, { new: true, runValidators: true })
      .populate('client', 'name email country state city');

    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    res.json({ message: 'Invoice updated successfully', invoice });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const deleteInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await Invoice.findByIdAndDelete(id);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    res.json({ message: 'Invoice deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getInvoices, getInvoiceById, createInvoice, updateInvoice, deleteInvoice };