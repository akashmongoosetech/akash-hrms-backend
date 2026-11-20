const mongoose = require('mongoose');
const Team = require('../models/Team');
const User = require('../models/User');
const Project = require('../models/Project');
const { notifyUsers } = require('./notificationController');

const userFullName = (user) =>
  [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || 'A team member';

// Get all teams
const getTeams = async (req, res) => {
  try {
    const teams = await Team.find()
      .populate({ path: 'manager', select: 'firstName lastName email photo', match: { status: 'Active' } })
      .populate({ path: 'teamMembers', select: 'firstName lastName email photo', match: { status: 'Active' } })
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

    if (!manager || !project) {
      return res.status(400).json({ message: 'Manager and project are required' });
    }

    if (!mongoose.Types.ObjectId.isValid(manager) || !mongoose.Types.ObjectId.isValid(project)) {
      return res.status(400).json({ message: 'Invalid manager or project' });
    }

    const managerData = await User.findOne({ _id: manager, status: 'Active' })
      .select('firstName lastName email role');
    const projectData = await Project.findById(project).select('name');

    if (!managerData) {
      return res.status(400).json({ message: 'Invalid or inactive manager' });
    }
    if (!projectData) {
      return res.status(400).json({ message: 'Invalid project' });
    }

    // Normalise and validate the selected members. Duplicate ids are collapsed
    // so a user can never receive two notifications for the same team.
    const requestedMembers = Array.isArray(teamMembers) ? teamMembers.map((id) => String(id)) : [];
    const invalidMember = requestedMembers.find((id) => !mongoose.Types.ObjectId.isValid(id));
    if (invalidMember) {
      return res.status(400).json({ message: 'One or more team members are invalid' });
    }

    const memberIds = [...new Set(requestedMembers.filter((id) => id !== String(manager)))];

    const memberUsers = await User.find({
      _id: { $in: memberIds },
      status: 'Active'
    }).select('_id firstName lastName email role');

    if (memberUsers.length !== memberIds.length) {
      return res.status(400).json({ message: 'One or more team members are invalid or inactive' });
    }

    // Generate team name based on manager and project
    const name = `${managerData.firstName} ${managerData.lastName} - ${projectData.name}`;

    const team = new Team({
      name,
      manager: managerData._id,
      teamMembers: memberUsers.map((member) => member._id),
      project: projectData._id,
      status: 'Active'
    });

    await team.save();

    // Notifications are best-effort and only run after the team exists. They go
    // to the selected manager and members only — never to unrelated users.
    const actorName = userFullName(req.user);
    const managerName = userFullName(managerData);
    const sharedData = {
      teamId: team._id,
      teamName: team.name,
      managerId: managerData._id,
      managerName,
      projectId: projectData._id,
      projectName: projectData.name,
      createdBy: req.user._id,
      createdByName: actorName,
      createdAt: team.createdAt,
      link: '/dashboard',
    };

    await notifyUsers({
      recipients: [managerData._id],
      type: 'team_created',
      title: 'New Team Assignment',
      message: `You have been assigned as the Manager of the new team ${team.name}, created by ${actorName}.`,
      data: { ...sharedData, role: 'manager' },
      actor: req.user,
      entityType: 'Team',
      entityId: team._id,
      io: req.app.get('io'),
      pushTitle: '👥 New Team Assignment',
    });

    if (memberUsers.length) {
      await notifyUsers({
        recipients: memberUsers.map((member) => member._id),
        type: 'team_created',
        title: 'Added to a New Team',
        message: `You have been added to the team ${team.name}. Your assigned Manager is ${managerName}.`,
        data: { ...sharedData, role: 'member' },
        actor: req.user,
        entityType: 'Team',
        entityId: team._id,
        io: req.app.get('io'),
        pushTitle: '👥 Added to a New Team',
      });
    }

    const populatedTeam = await Team.findById(team._id)
      .populate({ path: 'manager', select: 'firstName lastName email photo', match: { status: 'Active' } })
      .populate({ path: 'teamMembers', select: 'firstName lastName email photo', match: { status: 'Active' } })
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
