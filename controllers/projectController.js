const Project = require('../models/Project');
const User = require('../models/User');
const webpush = require('web-push');

const getProjects = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = {};
    if (req.user.role === 'Employee') {
      query = { teamMembers: req.user._id };
    }
    // For Admin and SuperAdmin, no filter (show all)

    const totalProjects = await Project.countDocuments(query);
    const projects = await Project.find(query)
      .populate('client', 'name email profile status')
      .populate('teamMembers', 'firstName lastName email photo')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      projects,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalProjects / limit),
        totalItems: totalProjects,
        itemsPerPage: limit
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getProjectById = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('client', 'name email profile status')
      .populate('teamMembers', 'firstName lastName email photo');
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const createProject = async (req, res) => {
  try {
    const { name, description, technology, client, teamMembers, startDate, status } = req.body;

    if (!name || !description || !technology || !client || !startDate) {
      return res.status(400).json({ message: 'All required fields must be provided' });
    }

    const projectData = {
      name,
      description,
      technology,
      client,
      teamMembers: teamMembers || [],
      startDate,
      status: status || 'Active'
    };

    const project = new Project(projectData);
    await project.save();

    const populatedProject = await Project.findById(project._id)
      .populate('client', 'name email profile status')
      .populate('teamMembers', 'firstName lastName email photo');

    // Get all employees to send push notifications
    const employees = await User.find({ role: 'Employee' });

    // Emit real-time notification to all employees
    const io = req.app.get('io');
    employees.forEach(employee => {
      io.emit(`project-notification-${employee._id}`, {
        type: 'new_project',
        message: `New project: ${name}`,
        project: populatedProject
      });
    });

    // Send push notifications to all employees
    const notificationPayload = {
      title: '🚀 New Project Added',
      body: `${name} project has been created`,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      url: '/projects',
      data: {
        projectId: populatedProject._id,
        type: 'new_project'
      }
    };

    // Send push notifications to all subscribed employees
    const pushPromises = employees.map(async (employee) => {
      if (employee.pushSubscriptions && employee.pushSubscriptions.length > 0) {
        const promises = employee.pushSubscriptions.map(subscription =>
          webpush.sendNotification(subscription, JSON.stringify(notificationPayload))
            .catch(error => {
              // Remove invalid subscriptions
              if (error.statusCode === 410) {
                User.findByIdAndUpdate(employee._id, {
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

    res.status(201).json({ message: 'Project created successfully', project: populatedProject });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const project = await Project.findByIdAndUpdate(id, updates, { new: true, runValidators: true })
      .populate('client', 'name email profile status')
      .populate('teamMembers', 'firstName lastName email photo');
    if (!project) return res.status(404).json({ message: 'Project not found' });

    // Get all employees to send push notifications
    const employees = await User.find({ role: 'Employee' });

    const io = req.app.get('io');
    employees.forEach(employee => {
      io.emit(`project-notification-${employee._id}`, {
        type: 'updated_project',
        message: `Project updated: ${project.name}`,
        project: project
      });
    });

    // Send push notifications to all employees
    const notificationPayload = {
      title: '📝 Project Updated',
      body: `${project.name} has been updated`,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      url: '/projects',
      data: {
        projectId: project._id,
        type: 'updated_project'
      }
    };

    // Send push notifications to all subscribed employees
    const pushPromises = employees.map(async (employee) => {
      if (employee.pushSubscriptions && employee.pushSubscriptions.length > 0) {
        const promises = employee.pushSubscriptions.map(subscription =>
          webpush.sendNotification(subscription, JSON.stringify(notificationPayload))
            .catch(error => {
              // Remove invalid subscriptions
              if (error.statusCode === 410) {
                User.findByIdAndUpdate(employee._id, {
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

    res.json({ message: 'Project updated successfully', project });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const deleteProject = async (req, res) => {
  try {
    const { id } = req.params;

    const project = await Project.findByIdAndDelete(id);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    // Get all employees to send push notifications
    const employees = await User.find({ role: 'Employee' });

    const io = req.app.get('io');
    employees.forEach(employee => {
      io.emit(`project-notification-${employee._id}`, {
        type: 'deleted_project',
        message: `Project deleted: ${project.name}`,
        project: { _id: id, name: project.name }
      });
    });

    // Send push notifications to all employees
    const notificationPayload = {
      title: '🗑️ Project Removed',
      body: `${project.name} has been deleted`,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      url: '/projects',
      data: {
        projectId: id,
        type: 'deleted_project'
      }
    };

    // Send push notifications to all subscribed employees
    const pushPromises = employees.map(async (employee) => {
      if (employee.pushSubscriptions && employee.pushSubscriptions.length > 0) {
        const promises = employee.pushSubscriptions.map(subscription =>
          webpush.sendNotification(subscription, JSON.stringify(notificationPayload))
            .catch(error => {
              // Remove invalid subscriptions
              if (error.statusCode === 410) {
                User.findByIdAndUpdate(employee._id, {
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

    res.json({ message: 'Project deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getProjects, getProjectById, createProject, updateProject, deleteProject };