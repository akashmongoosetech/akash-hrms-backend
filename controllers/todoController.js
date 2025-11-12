const Todo = require('../models/Todo');
const User = require('../models/User');
const { createNotificationsForAllUsers } = require('./notificationController');
const webpush = require('web-push');

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

    // Create persistent notifications for all users
    try {
      await createNotificationsForAllUsers(
        'todo_created',
        'New Todo Assigned',
        `New todo "${title}" assigned to ${populatedTodo.employee.firstName} ${populatedTodo.employee.lastName}`,
        { todoId: populatedTodo._id, todoTitle: title, employeeName: `${populatedTodo.employee.firstName} ${populatedTodo.employee.lastName}` }
      );
    } catch (notificationError) {
      console.error('Error creating notifications:', notificationError);
      // Don't fail the todo creation if notifications fail
    }

    // Get all users to send push notifications
    const allUsers = await User.find({ status: 'Active' });

    // Emit real-time notification to all users
    const io = req.app.get('io');
    allUsers.forEach(user => {
      io.emit(`todo-notification-${user._id}`, {
        type: 'new_todo',
        message: `New todo assigned: ${title}`,
        todo: populatedTodo
      });
    });

    // Send push notifications to all users
    const notificationPayload = {
      title: '📋 New Todo Assigned',
      body: `${title} assigned to ${populatedTodo.employee.firstName} ${populatedTodo.employee.lastName}`,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      url: '/todo',
      data: {
        todoId: populatedTodo._id,
        type: 'new_todo'
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

    // Create persistent notifications for all users
    try {
      await createNotificationsForAllUsers(
        'todo_updated',
        'Todo Updated',
        `Todo "${updatedTodo.title}" has been updated`,
        { todoId: updatedTodo._id, todoTitle: updatedTodo.title }
      );
    } catch (notificationError) {
      console.error('Error creating notifications:', notificationError);
      // Don't fail the todo update if notifications fail
    }

    // Get all users to send push notifications
    const allUsers = await User.find({ status: 'Active' });

    // Emit real-time notification to all users
    const io = req.app.get('io');
    allUsers.forEach(user => {
      io.emit(`todo-notification-${user._id}`, {
        type: 'updated_todo',
        message: `Todo updated: ${updatedTodo.title}`,
        todo: updatedTodo
      });
    });

    // Send push notifications to all users
    const notificationPayload = {
      title: '🔄 Todo Updated',
      body: `Todo "${updatedTodo.title}" has been updated`,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      url: '/todo',
      data: {
        todoId: updatedTodo._id,
        type: 'updated_todo'
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

    // Create persistent notifications for all users
    try {
      await createNotificationsForAllUsers(
        'todo_deleted',
        'Todo Removed',
        `Todo "${todo.title}" has been deleted`,
        { todoId: id, todoTitle: todo.title }
      );
    } catch (notificationError) {
      console.error('Error creating notifications:', notificationError);
      // Don't fail the todo deletion if notifications fail
    }

    // Get all users to send push notifications
    const allUsers = await User.find({ status: 'Active' });

    // Emit real-time notification to all users
    const io = req.app.get('io');
    allUsers.forEach(user => {
      io.emit(`todo-notification-${user._id}`, {
        type: 'deleted_todo',
        message: `Todo deleted: ${todo.title}`,
        todo: { _id: id, title: todo.title }
      });
    });

    // Send push notifications to all users
    const notificationPayload = {
      title: '🗑️ Todo Removed',
      body: `Todo "${todo.title}" has been deleted`,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      url: '/todo',
      data: {
        todoId: id,
        type: 'deleted_todo'
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