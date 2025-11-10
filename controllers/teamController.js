const Team = require('../models/Team');

// Get all teams
const getTeams = async (req, res) => {
  try {
    const teams = await Team.find()
      .populate('manager', 'firstName lastName email photo')
      .populate('teamMembers', 'firstName lastName email photo')
      .populate({
        path: 'project',
        populate: {
          path: 'client',
          select: 'name profile'
        }
      })
      .sort({ createdAt: -1 });

    res.json(teams);
  } catch (error) {
    console.error('Error fetching teams:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create a new team
const createTeam = async (req, res) => {
  try {
    const { manager, teamMembers, project } = req.body;

    // Generate team name based on manager and project
    const managerData = await require('../models/User').findById(manager).select('firstName lastName');
    const projectData = await require('../models/Project').findById(project).select('name');

    if (!managerData || !projectData) {
      return res.status(400).json({ message: 'Invalid manager or project' });
    }

    const name = `${managerData.firstName} ${managerData.lastName} - ${projectData.name}`;

    const team = new Team({
      name,
      manager,
      teamMembers,
      project,
      status: 'Active'
    });

    await team.save();

    const populatedTeam = await Team.findById(team._id)
      .populate('manager', 'firstName lastName email photo')
      .populate('teamMembers', 'firstName lastName email photo')
      .populate({
        path: 'project',
        populate: {
          path: 'client',
          select: 'name profile'
        }
      });

    res.status(201).json(populatedTeam);
  } catch (error) {
    console.error('Error creating team:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete a team
const deleteTeam = async (req, res) => {
  try {
    const { id } = req.params;

    await Team.findByIdAndDelete(id);

    res.json({ message: 'Team deleted successfully' });
  } catch (error) {
    console.error('Error deleting team:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getTeams,
  createTeam,
  deleteTeam
};