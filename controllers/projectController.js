const Project = require('../models/Project');

const getProjects = async (req, res) => {
  try {
    const projects = await Project.find()
      .populate('client', 'name email')
      .populate('teamMembers', 'firstName lastName email')
      .sort({ createdAt: -1 });
    res.json(projects);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getProjectById = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('client', 'name email')
      .populate('teamMembers', 'firstName lastName email');
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

    res.status(201).json({ message: 'Project created successfully', project });
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
      .populate('client', 'name email')
      .populate('teamMembers', 'firstName lastName email');
    if (!project) return res.status(404).json({ message: 'Project not found' });

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

    res.json({ message: 'Project deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getProjects, getProjectById, createProject, updateProject, deleteProject };