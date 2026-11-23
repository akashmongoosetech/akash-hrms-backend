const Project = require('../models/Project');
const User = require('../models/User');
const { notifyUsers } = require('./notificationController');

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
      .populate({ path: 'teamMembers', select: 'firstName lastName email photo', match: { status: 'Active' } })
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
      .populate({ path: 'teamMembers', select: 'firstName lastName email photo', match: { status: 'Active' } });
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
      .populate({ path: 'teamMembers', select: 'firstName lastName email photo', match: { status: 'Active' } });

    // Notify all employees assigned to the newly created project
    // (employees are populated from the teamMembers field, but project also has its own teamMembers)
    const assignedEmployees = populatedProject.teamMembers || [];

    await notifyUsers({
      recipients: assignedEmployees,
      exclude: req.user._id,
      type: 'project_created',
      title: 'New Project',
      message: `You have been added to the project ${name} by ${req.user.firstName} ${req.user.lastName}.`,
      data: {
        action: 'created',
        projectId: populatedProject._id,
        projectName: populatedProject.name,
        adminId: req.user._id,
        adminName: `${req.user.firstName} ${req.user.lastName}`,
        link: '/project',
      },
      actor: req.user,
      entityType: 'Project',
      entityId: populatedProject._id,
      io: req.app.get('io'),
      pushTitle: '🚀 New Project Added',
      pushUrl: '/project',
    });

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

    // Read the current assignments BEFORE applying the update so newly added
    // members can be detected reliably.
    const existingProject = await Project.findById(id).select('teamMembers name');
    if (!existingProject) return res.status(404).json({ message: 'Project not found' });
    const previousAssignees = (existingProject.teamMembers || []).map((member) => String(member));

    const project = await Project.findByIdAndUpdate(id, updates, { new: true, runValidators: true })
      .populate('client', 'name email profile status')
      .populate({ path: 'teamMembers', select: 'firstName lastName email photo', match: { status: 'Active' } });
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const actorId = String(req.user._id);
    const actorName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'An administrator';

    // Only active, populated members receive notifications. Recipient ids come
    // from the persisted project record, never from the request body.
    const currentMembers = (project.teamMembers || [])
      .map((member) => String(member?._id || member))
      .filter((memberId) => memberId && memberId !== actorId);

    const newlyAssigned = currentMembers.filter((memberId) => !previousAssignees.includes(memberId));
    const existingMembers = currentMembers.filter((memberId) => previousAssignees.includes(memberId));

    const commonData = {
      projectId: project._id,
      projectName: project.name,
      adminId: req.user._id,
      adminName: actorName,
      link: '/project',
    };

    // Employees already on the project hear about the update.
    if (existingMembers.length) {
      await notifyUsers({
        recipients: existingMembers,
        exclude: req.user._id,
        type: 'project_updated',
        title: 'Project Updated',
        message: `The project ${project.name} has been updated by ${actorName}.`,
        data: { ...commonData, action: 'updated' },
        actor: req.user,
        entityType: 'Project',
        entityId: project._id,
        io: req.app.get('io'),
        pushTitle: '📝 Project Updated',
        pushUrl: '/project',
      });
    }

    // Newly assigned employees get a single assignment notification instead of
    // both an update and an assignment message.
    if (newlyAssigned.length) {
      await notifyUsers({
        recipients: newlyAssigned,
        exclude: req.user._id,
        type: 'project_updated',
        title: 'New Project Assignment',
        message: `You have been assigned to the project ${project.name} by ${actorName}.`,
        data: { ...commonData, action: 'new_assignment' },
        actor: req.user,
        entityType: 'Project',
        entityId: project._id,
        io: req.app.get('io'),
        pushTitle: '📝 New Project Assignment',
        pushUrl: '/project',
      });
    }

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

    // Capture assigned employee IDs before deletion
    const assignedEmployeesBeforeDelete = project.teamMembers || [];

    // Notify employees who were assigned to the project before deletion
    const deletedEmployees = await User.find({
      _id: { $in: assignedEmployeesBeforeDelete },
      status: 'Active',
    }).select('_id firstName lastName role pushSubscriptions').lean();

    // Notify assigned employees (excluding the actor who deleted the project)
    if (deletedEmployees.length) {
      const actorExcluded = deletedEmployees.filter(
        (e) => String(e._id) !== String(req.user._id)
      );

      await notifyUsers({
        recipients: actorExcluded.map((e) => e._id),
        exclude: req.user._id,
        type: 'project_deleted',
        title: 'Project Deleted',
        message: `The project ${project.name} has been deleted by ${req.user.firstName} ${req.user.lastName}.`,
        data: {
          action: 'deleted',
          projectId: id,
          projectName: project.name,
          adminId: req.user._id,
          adminName: `${req.user.firstName} ${req.user.lastName}`,
          link: '/project',
        },
        actor: req.user,
        entityType: 'Project',
        entityId: project._id,
        io: req.app.get('io'),
        pushTitle: '🗑️ Project Removed',
        pushUrl: '/project',
      });
    }

    res.json({ message: 'Project deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getProjects, getProjectById, createProject, updateProject, deleteProject };