const Offboarding = require('../models/Offboarding');

// Get all offboarding processes
const getOffboardings = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = {};

    if (req.query.employeeId) {
      query.employee = req.query.employeeId;
    }

    if (req.query.status) {
      query.status = req.query.status;
    }

    const offboardings = await Offboarding.find(query)
      .populate('employee', 'firstName lastName email photo')
      .populate('manager', 'firstName lastName email')
      .populate('hrContact', 'firstName lastName email')
      .populate('tasks.assignedTo', 'firstName lastName email')
      .populate('exitInterview.interviewer', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Offboarding.countDocuments(query);

    res.json({
      offboardings,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalOffboardings: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching offboardings:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get single offboarding by ID
const getOffboardingById = async (req, res) => {
  try {
    const offboarding = await Offboarding.findById(req.params.id)
      .populate('employee', 'firstName lastName email photo department')
      .populate('manager', 'firstName lastName email')
      .populate('hrContact', 'firstName lastName email')
      .populate('tasks.assignedTo', 'firstName lastName email')
      .populate('exitInterview.interviewer', 'firstName lastName email');

    if (!offboarding) {
      return res.status(404).json({ message: 'Offboarding not found' });
    }

    res.json(offboarding);
  } catch (error) {
    console.error('Error fetching offboarding:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create new offboarding
const createOffboarding = async (req, res) => {
  try {
    const offboardingData = req.body;
    const offboarding = new Offboarding(offboardingData);
    await offboarding.save();

    const populatedOffboarding = await Offboarding.findById(offboarding._id)
      .populate('employee', 'firstName lastName email photo')
      .populate('manager', 'firstName lastName email')
      .populate('hrContact', 'firstName lastName email')
      .populate('tasks.assignedTo', 'firstName lastName email')
      .populate('exitInterview.interviewer', 'firstName lastName email');

    res.status(201).json(populatedOffboarding);
  } catch (error) {
    console.error('Error creating offboarding:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update offboarding
const updateOffboarding = async (req, res) => {
  try {
    const updatedOffboarding = await Offboarding.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate('employee', 'firstName lastName email photo')
      .populate('manager', 'firstName lastName email')
      .populate('hrContact', 'firstName lastName email')
      .populate('tasks.assignedTo', 'firstName lastName email')
      .populate('exitInterview.interviewer', 'firstName lastName email');

    if (!updatedOffboarding) {
      return res.status(404).json({ message: 'Offboarding not found' });
    }

    res.json(updatedOffboarding);
  } catch (error) {
    console.error('Error updating offboarding:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete offboarding
const deleteOffboarding = async (req, res) => {
  try {
    const offboarding = await Offboarding.findById(req.params.id);

    if (!offboarding) {
      return res.status(404).json({ message: 'Offboarding not found' });
    }

    await Offboarding.findByIdAndDelete(req.params.id);
    res.json({ message: 'Offboarding deleted successfully' });
  } catch (error) {
    console.error('Error deleting offboarding:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update task completion
const updateTaskCompletion = async (req, res) => {
  try {
    const { taskId, completed, notes } = req.body;

    const offboarding = await Offboarding.findOneAndUpdate(
      { _id: req.params.id, 'tasks._id': taskId },
      {
        $set: {
          'tasks.$.completed': completed,
          'tasks.$.completedAt': completed ? new Date() : null,
          'tasks.$.notes': notes
        }
      },
      { new: true }
    )
      .populate('employee', 'firstName lastName email photo')
      .populate('manager', 'firstName lastName email')
      .populate('hrContact', 'firstName lastName email')
      .populate('tasks.assignedTo', 'firstName lastName email')
      .populate('exitInterview.interviewer', 'firstName lastName email');

    if (!offboarding) {
      return res.status(404).json({ message: 'Offboarding or task not found' });
    }

    res.json(offboarding);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Add task to offboarding
const addTask = async (req, res) => {
  try {
    const { title, description, assignedTo, dueDate } = req.body;

    const offboarding = await Offboarding.findByIdAndUpdate(
      req.params.id,
      {
        $push: {
          tasks: {
            title,
            description,
            assignedTo,
            dueDate
          }
        }
      },
      { new: true }
    )
      .populate('employee', 'firstName lastName email photo')
      .populate('manager', 'firstName lastName email')
      .populate('hrContact', 'firstName lastName email')
      .populate('tasks.assignedTo', 'firstName lastName email')
      .populate('exitInterview.interviewer', 'firstName lastName email');

    if (!offboarding) {
      return res.status(404).json({ message: 'Offboarding not found' });
    }

    res.json(offboarding);
  } catch (error) {
    console.error('Error adding task:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getOffboardings,
  getOffboardingById,
  createOffboarding,
  updateOffboarding,
  deleteOffboarding,
  updateTaskCompletion,
  addTask
};