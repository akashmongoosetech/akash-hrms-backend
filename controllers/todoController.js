const Todo = require('../models/Todo');
const User = require('../models/User');

// Get all todos with employee details
const getTodos = async (req, res) => {
  try {
    let todos;
    if (req.user.role === 'Employee') {
      // Employees can only see their own todos
      todos = await Todo.find({ employee: req.user._id })
        .populate('employee', 'firstName lastName email photo')
        .populate('createdBy', 'firstName lastName')
        .sort({ createdAt: -1 });
    } else {
      // Admins and SuperAdmins can see all todos
      todos = await Todo.find({})
        .populate('employee', 'firstName lastName email photo')
        .populate('createdBy', 'firstName lastName')
        .sort({ createdAt: -1 });
    }
    res.json(todos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get todo by ID
const getTodoById = async (req, res) => {
  try {
    const todo = await Todo.findById(req.params.id)
      .populate('employee', 'firstName lastName email photo')
      .populate('createdBy', 'firstName lastName');

    if (!todo) return res.status(404).json({ message: 'Todo not found' });

    // Check if user has permission to view this todo
    if (req.user.role === 'Employee' && todo.employee._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(todo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create new todo
const createTodo = async (req, res) => {
  try {
    const { title, employee, dueDate, priority, description, status } = req.body;

    if (!title || !employee || !dueDate) {
      return res.status(400).json({ message: 'Title, employee, and due date are required' });
    }

    // Validate employee exists
    const employeeExists = await User.findById(employee);
    if (!employeeExists) {
      return res.status(400).json({ message: 'Invalid employee' });
    }

    const todo = new Todo({
      title,
      employee,
      dueDate,
      priority: priority || 'Medium',
      description,
      status: status || 'Pending',
      createdBy: req.user._id
    });

    await todo.save();

    const populatedTodo = await Todo.findById(todo._id)
      .populate('employee', 'firstName lastName email photo')
      .populate('createdBy', 'firstName lastName');

    // Emit real-time update to all connected clients
    const io = req.app.get('io');
    io.emit('todo-created', { todo: populatedTodo });

    // Emit specific notification to the assigned employee
    io.emit(`todo-notification-${employee}`, {
      type: 'new_todo',
      message: `New todo assigned: ${title}`,
      todo: populatedTodo
    });

    res.status(201).json({ message: 'Todo created successfully', todo: populatedTodo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Update todo
const updateTodo = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const todo = await Todo.findById(id);
    if (!todo) return res.status(404).json({ message: 'Todo not found' });

    // Check permissions: Admins can update any todo, Employees can only update their own
    if (req.user.role === 'Employee' && todo.employee.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // If employee is being updated, only allow admins
    if (updates.employee && req.user.role === 'Employee') {
      return res.status(403).json({ message: 'Employees cannot reassign todos' });
    }

    // Validate employee if being updated
    if (updates.employee) {
      const employeeExists = await User.findById(updates.employee);
      if (!employeeExists) {
        return res.status(400).json({ message: 'Invalid employee' });
      }
    }

    const updatedTodo = await Todo.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true
    })
      .populate('employee', 'firstName lastName email photo')
      .populate('createdBy', 'firstName lastName');

    // Emit real-time update to all connected clients
    const io = req.app.get('io');
    io.emit('todo-updated', { todo: updatedTodo });

    res.json({ message: 'Todo updated successfully', todo: updatedTodo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Delete todo
const deleteTodo = async (req, res) => {
  try {
    const { id } = req.params;

    const todo = await Todo.findById(id);
    if (!todo) return res.status(404).json({ message: 'Todo not found' });

    // Check permissions
    if (req.user.role === 'Employee' && todo.employee.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await Todo.findByIdAndDelete(id);

    // Emit real-time update to all connected clients
    const io = req.app.get('io');
    io.emit('todo-deleted', { todoId: id });

    res.json({ message: 'Todo deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get todos for a specific employee
const getTodosByEmployee = async (req, res) => {
  try {
    const { employeeId } = req.params;

    // Check if user has permission to view this employee's todos
    if (req.user.role === 'Employee' && req.user._id.toString() !== employeeId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const todos = await Todo.find({ employee: employeeId })
      .populate('employee', 'firstName lastName email photo')
      .populate('createdBy', 'firstName lastName')
      .sort({ createdAt: -1 });

    res.json(todos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getTodos,
  getTodoById,
  createTodo,
  updateTodo,
  deleteTodo,
  getTodosByEmployee
};