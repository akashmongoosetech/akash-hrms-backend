const Todo = require('../models/Todo');
const User = require('../models/User');
const { notifyAssignedEmployee } = require('./notificationController');

// Get all todos with employee details
const getTodos = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let matchQuery = {};
    if (req.user.role === 'Employee') {
      // Employees can only see their own todos
      matchQuery.employee = req.user._id;
    }

    if (req.query.status && req.query.status !== 'all') {
      matchQuery.status = req.query.status;
    }

    if (req.query.priority && req.query.priority !== 'all') {
      matchQuery.priority = req.query.priority;
    }

    // Employees must never be able to widen their scope with ?employee=<otherId>
    if (req.user.role !== 'Employee' && req.query.employee && req.query.employee !== 'all') {
      matchQuery.employee = req.query.employee;
    }

    let pipeline = [
      { $match: matchQuery },
      {
        $lookup: {
          from: 'users',
          localField: 'employee',
          foreignField: '_id',
          as: 'employee'
        }
      },
      { $unwind: '$employee' },
      {
        $lookup: {
          from: 'users',
          localField: 'createdBy',
          foreignField: '_id',
          as: 'createdBy'
        }
      },
      { $unwind: '$createdBy' },
    ];

    if (req.query.search) {
      pipeline.push({
        $match: {
          $or: [
            { title: { $regex: req.query.search, $options: 'i' } },
            { 'employee.firstName': { $regex: req.query.search, $options: 'i' } },
            { 'employee.lastName': { $regex: req.query.search, $options: 'i' } }
          ]
        }
      });
    }

    pipeline.push(
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit }
    );

    const todos = await Todo.aggregate(pipeline);

    // For total count
    let countPipeline = [
      { $match: matchQuery },
      {
        $lookup: {
          from: 'users',
          localField: 'employee',
          foreignField: '_id',
          as: 'employee'
        }
      },
      { $unwind: '$employee' },
    ];

    if (req.query.search) {
      countPipeline.push({
        $match: {
          $or: [
            { title: { $regex: req.query.search, $options: 'i' } },
            { 'employee.firstName': { $regex: req.query.search, $options: 'i' } },
            { 'employee.lastName': { $regex: req.query.search, $options: 'i' } }
          ]
        }
      });
    }

    const totalTodos = await Todo.aggregate([...countPipeline, { $count: "total" }]);
    const total = totalTodos.length > 0 ? totalTodos[0].total : 0;

    res.json({
      todos,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      }
    });
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

    // Notify the assigned employee (exclude actor)
    await notifyAssignedEmployee({
      employeeId: employee,
      actor: req.user,
      type: 'todo_created',
      title: 'New Todo Assigned',
      message: `${req.user.firstName} ${req.user.lastName} has assigned you a new task: ${title}.`,
      data: {
        action: 'created',
        todoId: populatedTodo._id,
        todoTitle: title,
        employeeId: populatedTodo.employee,
        dueDate: populatedTodo.dueDate,
        description: populatedTodo.description,
        actorId: req.user._id,
        actorName: `${req.user.firstName} ${req.user.lastName}`,
        link: '/todo',
      },
      io: req.app.get('io'),
      pushTitle: '📋 New Todo Assigned',
      pushUrl: '/todo',
      entityType: 'Todo',
      entityId: populatedTodo._id,
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

    // Notify the assigned employee (exclude actor). When the task is
    // reassigned, the newly assigned employee receives an assignment message
    // and the previous assignee is left untouched because the task no longer
    // belongs to them.
    const assignedEmployeeId = String(updatedTodo.employee?._id || updatedTodo.employee);
    const previousEmployeeId = String(todo.employee);
    const isReassigned = assignedEmployeeId !== previousEmployeeId;
    const actorName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'An administrator';

    await notifyAssignedEmployee({
      employeeId: assignedEmployeeId,
      actor: req.user,
      type: 'todo_updated',
      title: isReassigned ? 'New Todo Assigned' : 'Todo Updated',
      message: isReassigned
        ? `${actorName} has assigned you a new task: ${updatedTodo.title}.`
        : `${actorName} has updated your task: ${updatedTodo.title}.`,
      data: {
        action: isReassigned ? 'reassigned' : 'updated',
        todoId: updatedTodo._id,
        todoTitle: updatedTodo.title,
        description: updatedTodo.description,
        dueDate: updatedTodo.dueDate,
        status: updatedTodo.status,
        reassigned: isReassigned,
        actorId: req.user._id,
        actorName,
        link: '/todo',
      },
      io: req.app.get('io'),
      pushTitle: isReassigned ? '📋 New Todo Assigned' : '🔄 Todo Updated',
      pushUrl: '/todo',
      entityType: 'Todo',
      entityId: updatedTodo._id,
    });

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

    // Notify the assigned employee (exclude actor)
    await notifyAssignedEmployee({
      employeeId: todo.employee,
      actor: req.user,
      type: 'todo_deleted',
      title: 'Todo Deleted',
      message: `${req.user.firstName} ${req.user.lastName} has deleted your task: ${todo.title}.`,
      data: {
        action: 'deleted',
        todoId: id,
        todoTitle: todo.title,
        actorId: req.user._id,
        actorName: `${req.user.firstName} ${req.user.lastName}`,
        link: '/todo',
      },
      io: req.app.get('io'),
      pushTitle: '🗑️ Todo Removed',
      pushUrl: '/todo',
      entityType: 'Todo',
      entityId: todo._id,
    });

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