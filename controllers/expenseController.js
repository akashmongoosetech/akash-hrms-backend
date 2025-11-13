const Expense = require('../models/Expense');

// Generate expense ID
const generateExpenseId = async () => {
  const currentYear = new Date().getFullYear();
  const lastExpense = await Expense.findOne({ expenseId: new RegExp(`^EXP-${currentYear}-`) })
    .sort({ createdAt: -1 });

  let nextNumber = 1;
  if (lastExpense) {
    const lastNumber = parseInt(lastExpense.expenseId.split('-')[2]);
    nextNumber = lastNumber + 1;
  }

  return `EXP-${currentYear}-${nextNumber.toString().padStart(3, '0')}`;
};

const getExpenses = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const totalExpenses = await Expense.countDocuments();
    const expenses = await Expense.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      expenses,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalExpenses / limit),
        totalItems: totalExpenses,
        itemsPerPage: limit
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getExpenseById = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ message: 'Expense not found' });
    res.json(expense);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const createExpense = async (req, res) => {
  try {
    const { item, orderBy, from, date, status, type, amount } = req.body;

    if (!item || !orderBy || !from || !type || !amount) {
      return res.status(400).json({ message: 'Item, orderBy, from, type, and amount are required' });
    }

    // Generate expense ID
    const expenseId = await generateExpenseId();

    const expenseData = {
      expenseId,
      item,
      orderBy,
      from,
      date: date ? new Date(date) : new Date(),
      status: status || 'Pending',
      type,
      amount: parseFloat(amount)
    };

    const expense = new Expense(expenseData);
    await expense.save();

    res.status(201).json({ message: 'Expense created successfully', expense });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const updateExpense = async (req, res) => {
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

    const expense = await Expense.findByIdAndUpdate(id, updates, { new: true, runValidators: true });

    if (!expense) return res.status(404).json({ message: 'Expense not found' });

    res.json({ message: 'Expense updated successfully', expense });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;

    const expense = await Expense.findByIdAndDelete(id);
    if (!expense) return res.status(404).json({ message: 'Expense not found' });

    res.json({ message: 'Expense deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getExpenses, getExpenseById, createExpense, updateExpense, deleteExpense };