const Onboarding = require('../models/Onboarding');

// Get all onboarding processes
const getOnboardings = async (req, res) => {
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

    const onboardings = await Onboarding.find(query)
      .populate('employee', 'firstName lastName email photo')
      .populate('manager', 'firstName lastName email')
      .populate('hrContact', 'firstName lastName email')
      .populate('tasks.assignedTo', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Onboarding.countDocuments(query);

    res.json({
      onboardings,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalOnboardings: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching onboardings:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get single onboarding by ID
const getOnboardingById = async (req, res) => {
  try {
    const onboarding = await Onboarding.findById(req.params.id)
      .populate('employee', 'firstName lastName email photo department')
      .populate('manager', 'firstName lastName email')
      .populate('hrContact', 'firstName lastName email')
      .populate('tasks.assignedTo', 'firstName lastName email');

    if (!onboarding) {
      return res.status(404).json({ message: 'Onboarding not found' });
    }

    res.json(onboarding);
  } catch (error) {
    console.error('Error fetching onboarding:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create new onboarding
const createOnboarding = async (req, res) => {
  try {
    const onboardingData = req.body;
    const onboarding = new Onboarding(onboardingData);
    await onboarding.save();

    const populatedOnboarding = await Onboarding.findById(onboarding._id)
      .populate('employee', 'firstName lastName email photo')
      .populate('manager', 'firstName lastName email')
      .populate('hrContact', 'firstName lastName email')
      .populate('tasks.assignedTo', 'firstName lastName email');

    res.status(201).json(populatedOnboarding);
  } catch (error) {
    console.error('Error creating onboarding:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update onboarding
const updateOnboarding = async (req, res) => {
  try {
    const updatedOnboarding = await Onboarding.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate('employee', 'firstName lastName email photo')
      .populate('manager', 'firstName lastName email')
      .populate('hrContact', 'firstName lastName email')
      .populate('tasks.assignedTo', 'firstName lastName email');

    if (!updatedOnboarding) {
      return res.status(404).json({ message: 'Onboarding not found' });
    }

    res.json(updatedOnboarding);
  } catch (error) {
    console.error('Error updating onboarding:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete onboarding
const deleteOnboarding = async (req, res) => {
  try {
    const onboarding = await Onboarding.findById(req.params.id);

    if (!onboarding) {
      return res.status(404).json({ message: 'Onboarding not found' });
    }

    await Onboarding.findByIdAndDelete(req.params.id);
    res.json({ message: 'Onboarding deleted successfully' });
  } catch (error) {
    console.error('Error deleting onboarding:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update task completion
const updateTaskCompletion = async (req, res) => {
  try {
    const { taskId, completed, notes } = req.body;

    const onboarding = await Onboarding.findOneAndUpdate(
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
      .populate('tasks.assignedTo', 'firstName lastName email');

    if (!onboarding) {
      return res.status(404).json({ message: 'Onboarding or task not found' });
    }

    res.json(onboarding);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Add task to onboarding
const addTask = async (req, res) => {
  try {
    const { title, description, assignedTo, dueDate } = req.body;

    const onboarding = await Onboarding.findByIdAndUpdate(
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
      .populate('tasks.assignedTo', 'firstName lastName email');

    if (!onboarding) {
      return res.status(404).json({ message: 'Onboarding not found' });
    }

    res.json(onboarding);
  } catch (error) {
    console.error('Error adding task:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getOnboardings,
  getOnboardingById,
  createOnboarding,
  updateOnboarding,
  deleteOnboarding,
  updateTaskCompletion,
  addTask
};