const Payment = require('../models/Payment');
const User = require('../models/User');

// Generate payment ID
const generatePaymentId = async () => {
  const currentYear = new Date().getFullYear();
  const lastPayment = await Payment.findOne({ paymentId: new RegExp(`^PFL-${currentYear}-`) })
    .sort({ createdAt: -1 });

  let nextNumber = 1;
  if (lastPayment) {
    const lastNumber = parseInt(lastPayment.paymentId.split('-')[2]);
    nextNumber = lastNumber + 1;
  }

  return `PFL-${currentYear}-${nextNumber.toString().padStart(3, '0')}`;
};

const getPayments = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const totalPayments = await Payment.countDocuments();
    const payments = await Payment.find()
      .populate('employee', 'firstName lastName email photo')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      payments,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalPayments / limit),
        totalItems: totalPayments,
        itemsPerPage: limit
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getPaymentById = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id).populate('employee', 'firstName lastName email photo');
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    res.json(payment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const createPayment = async (req, res) => {
  try {
    const { employee, reason, date, type, amount } = req.body;

    if (!employee || !reason || !type || !amount) {
      return res.status(400).json({ message: 'Employee, reason, type, and amount are required' });
    }

    // Verify employee exists
    const employeeExists = await User.findById(employee);
    if (!employeeExists) {
      return res.status(400).json({ message: 'Invalid employee' });
    }

    // Generate payment ID
    const paymentId = await generatePaymentId();

    const paymentData = {
      paymentId,
      employee,
      reason,
      date: date ? new Date(date) : new Date(),
      type,
      amount: parseFloat(amount)
    };

    const payment = new Payment(paymentData);
    await payment.save();

    // Populate employee data for response
    await payment.populate('employee', 'firstName lastName email photo');

    res.status(201).json({ message: 'Payment created successfully', payment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const updatePayment = async (req, res) => {
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

    const payment = await Payment.findByIdAndUpdate(id, updates, { new: true, runValidators: true })
      .populate('employee', 'firstName lastName email photo');

    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    res.json({ message: 'Payment updated successfully', payment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const deletePayment = async (req, res) => {
  try {
    const { id } = req.params;

    const payment = await Payment.findByIdAndDelete(id);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    res.json({ message: 'Payment deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getPayments, getPaymentById, createPayment, updatePayment, deletePayment };