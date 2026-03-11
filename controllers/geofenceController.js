const GeoFence = require('../models/GeoFence');
const GeoFenceAlert = require('../models/GeoFenceAlert');
const User = require('../models/User');

// @desc    Create a new geofence
// @route   POST /api/geofence/create
// @access  Private (Admin)
const createGeoFence = async (req, res) => {
  try {
    const { name, centerLatitude, centerLongitude, radius, description, color, alertOnEnter, alertOnExit } = req.body;

    // Validate required fields
    if (!name || !centerLatitude || !centerLongitude || !radius) {
      return res.status(400).json({ message: 'Name, center latitude, center longitude, and radius are required' });
    }

    // Validate radius
    if (radius < 10) {
      return res.status(400).json({ message: 'Radius must be at least 10 meters' });
    }

    const geoFence = await GeoFence.create({
      name,
      centerLatitude,
      centerLongitude,
      radius,
      description: description || '',
      color: color || '#FF5722',
      alertOnEnter: alertOnEnter !== false,
      alertOnExit: alertOnExit !== false,
      createdBy: req.user._id
    });

    res.status(201).json({
      success: true,
      data: geoFence
    });
  } catch (error) {
    console.error('Error creating geofence:', error);
    res.status(500).json({ message: 'Server error creating geofence' });
  }
};

// @desc    Get all geofences
// @route   GET /api/geofence
// @access  Private (Admin)
const getGeoFences = async (req, res) => {
  try {
    const geoFences = await GeoFence.find()
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: geoFences.length,
      data: geoFences
    });
  } catch (error) {
    console.error('Error getting geofences:', error);
    res.status(500).json({ message: 'Server error getting geofences' });
  }
};

// @desc    Get single geofence
// @route   GET /api/geofence/:id
// @access  Private (Admin)
const getGeoFence = async (req, res) => {
  try {
    const geoFence = await GeoFence.findById(req.params.id)
      .populate('createdBy', 'firstName lastName email');

    if (!geoFence) {
      return res.status(404).json({ message: 'Geofence not found' });
    }

    res.json({
      success: true,
      data: geoFence
    });
  } catch (error) {
    console.error('Error getting geofence:', error);
    res.status(500).json({ message: 'Server error getting geofence' });
  }
};

// @desc    Update geofence
// @route   PUT /api/geofence/:id
// @access  Private (Admin)
const updateGeoFence = async (req, res) => {
  try {
    const { name, centerLatitude, centerLongitude, radius, description, color, isActive, alertOnEnter, alertOnExit } = req.body;

    let geoFence = await GeoFence.findById(req.params.id);

    if (!geoFence) {
      return res.status(404).json({ message: 'Geofence not found' });
    }

    geoFence = await GeoFence.findByIdAndUpdate(
      req.params.id,
      {
        name: name || geoFence.name,
        centerLatitude: centerLatitude || geoFence.centerLatitude,
        centerLongitude: centerLongitude || geoFence.centerLongitude,
        radius: radius || geoFence.radius,
        description: description !== undefined ? description : geoFence.description,
        color: color || geoFence.color,
        isActive: isActive !== undefined ? isActive : geoFence.isActive,
        alertOnEnter: alertOnEnter !== undefined ? alertOnEnter : geoFence.alertOnEnter,
        alertOnExit: alertOnExit !== undefined ? alertOnExit : geoFence.alertOnExit
      },
      { new: true, runValidators: true }
    ).populate('createdBy', 'firstName lastName email');

    res.json({
      success: true,
      data: geoFence
    });
  } catch (error) {
    console.error('Error updating geofence:', error);
    res.status(500).json({ message: 'Server error updating geofence' });
  }
};

// @desc    Delete geofence
// @route   DELETE /api/geofence/:id
// @access  Private (Admin)
const deleteGeoFence = async (req, res) => {
  try {
    const geoFence = await GeoFence.findById(req.params.id);

    if (!geoFence) {
      return res.status(404).json({ message: 'Geofence not found' });
    }

    await geoFence.deleteOne();

    res.json({
      success: true,
      message: 'Geofence deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting geofence:', error);
    res.status(500).json({ message: 'Server error deleting geofence' });
  }
};

// @desc    Get all geofence alerts
// @route   GET /api/geofence/alerts
// @access  Private (Admin)
const getAlerts = async (req, res) => {
  try {
    const { isRead, isResolved, employeeId, geoFenceId } = req.query;

    const query = {};
    
    if (isRead !== undefined) query.isRead = isRead === 'true';
    if (isResolved !== undefined) query.isResolved = isResolved === 'true';
    if (employeeId) query.employeeId = employeeId;
    if (geoFenceId) query.geoFenceId = geoFenceId;

    const alerts = await GeoFenceAlert.find(query)
      .populate('employeeId', 'firstName lastName email photo')
      .populate('geoFenceId', 'name')
      .populate('resolvedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({
      success: true,
      count: alerts.length,
      data: alerts
    });
  } catch (error) {
    console.error('Error getting alerts:', error);
    res.status(500).json({ message: 'Server error getting alerts' });
  }
};

// @desc    Mark alert as read
// @route   PUT /api/geofence/alerts/:id/read
// @access  Private (Admin)
const markAlertAsRead = async (req, res) => {
  try {
    const alert = await GeoFenceAlert.findById(req.params.id);

    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }

    alert.isRead = true;
    await alert.save();

    res.json({
      success: true,
      data: alert
    });
  } catch (error) {
    console.error('Error marking alert as read:', error);
    res.status(500).json({ message: 'Server error marking alert as read' });
  }
};

// @desc    Resolve alert
// @route   PUT /api/geofence/alerts/:id/resolve
// @access  Private (Admin)
const resolveAlert = async (req, res) => {
  try {
    const { notes } = req.body;

    const alert = await GeoFenceAlert.findById(req.params.id);

    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }

    alert.isResolved = true;
    alert.resolvedAt = new Date();
    alert.resolvedBy = req.user._id;
    alert.notes = notes || '';
    await alert.save();

    res.json({
      success: true,
      data: alert
    });
  } catch (error) {
    console.error('Error resolving alert:', error);
    res.status(500).json({ message: 'Server error resolving alert' });
  }
};

// @desc    Get unread alert count
// @route   GET /api/geofence/alerts/count
// @access  Private (Admin)
const getUnreadAlertCount = async (req, res) => {
  try {
    const count = await GeoFenceAlert.countDocuments({ isRead: false });

    res.json({
      success: true,
      data: { count }
    });
  } catch (error) {
    console.error('Error getting unread alert count:', error);
    res.status(500).json({ message: 'Server error getting unread alert count' });
  }
};

module.exports = {
  createGeoFence,
  getGeoFences,
  getGeoFence,
  updateGeoFence,
  deleteGeoFence,
  getAlerts,
  markAlertAsRead,
  resolveAlert,
  getUnreadAlertCount
};
