const Location = require('../models/Location');
const User = require('../models/User');
const GeoFence = require('../models/GeoFence');
const GeoFenceAlert = require('../models/GeoFenceAlert');

// Calculate distance between two coordinates using Haversine formula
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

// Check geofences and create alerts if needed
const checkGeofences = async (employeeId, latitude, longitude) => {
  try {
    const geoFences = await GeoFence.find({ isActive: true });
    const alerts = [];

    for (const fence of geoFences) {
      const distance = calculateDistance(
        latitude,
        longitude,
        fence.centerLatitude,
        fence.centerLongitude
      );

      // Check if employee is inside or just entered/exited
      const wasInside = await checkIfWasInside(employeeId, fence._id);
      const isInside = distance <= fence.radius;

      if (isInside && !wasInside && fence.alertOnEnter) {
        // Employee entered the geofence
        const alert = await GeoFenceAlert.create({
          employeeId,
          geoFenceId: fence._id,
          geoFenceName: fence.name,
          alertType: 'ENTER',
          employeeLatitude: latitude,
          employeeLongitude: longitude,
          distance: Math.round(distance)
        });
        alerts.push(alert);
      } else if (!isInside && wasInside && fence.alertOnExit) {
        // Employee exited the geofence
        const alert = await GeoFenceAlert.create({
          employeeId,
          geoFenceId: fence._id,
          geoFenceName: fence.name,
          alertType: 'EXIT',
          employeeLatitude: latitude,
          employeeLongitude: longitude,
          distance: Math.round(distance)
        });
        alerts.push(alert);
      }

      // Update employee's geofence status
      await updateGeofenceStatus(employeeId, fence._id, isInside);
    }

    return alerts;
  } catch (error) {
    console.error('Error checking geofences:', error);
    return [];
  }
};

// Helper to track if employee was inside a geofence (simple in-memory tracking)
const geofenceStatus = new Map();

const checkIfWasInside = async (employeeId, geoFenceId) => {
  const key = `${employeeId}_${geoFenceId}`;
  return geofenceStatus.get(key) || false;
};

const updateGeofenceStatus = async (employeeId, geoFenceId, isInside) => {
  const key = `${employeeId}_${geoFenceId}`;
  geofenceStatus.set(key, isInside);
};

// @desc    Update employee location
// @route   POST /api/location/update
// @access  Private (Employee)
const updateLocation = async (req, res) => {
  try {
    const { latitude, longitude, accuracy, timestamp } = req.body;
    const employeeId = req.user._id;

    // Validate coordinates
    if (!latitude || !longitude) {
      return res.status(400).json({ message: 'Latitude and longitude are required' });
    }

    // Update location in database
    const location = await Location.updateLatestLocation(employeeId, {
      latitude,
      longitude,
      accuracy: accuracy || 0,
      timestamp: timestamp ? new Date(timestamp) : new Date()
    });

    // Check geofences
    const alerts = await checkGeofences(employeeId, latitude, longitude);

    // Get employee details for socket emission
    const employee = await User.findById(employeeId).select('firstName lastName email photo');

    // Emit location update via Socket.io
    const io = req.app.get('io');
    if (io) {
      io.emit('locationUpdate', {
        employeeId,
        employee,
        location: {
          latitude,
          longitude,
          accuracy,
          timestamp: location.timestamp
        },
        alerts
      });
    }

    res.status(201).json({
      success: true,
      data: location,
      alerts
    });
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({ message: 'Server error updating location' });
  }
};

// @desc    Get all live locations
// @route   GET /api/location/live
// @access  Private (Admin)
const getLiveLocations = async (req, res) => {
  try {
    // Get all latest locations with employee details
    const locations = await Location.aggregate([
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: '$employeeId',
          location: { $first: '$$ROOT' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'employee'
        }
      },
      { $unwind: '$employee' },
      {
        $project: {
          _id: '$location._id',
          employeeId: '$_id',
          employeeName: { $concat: ['$employee.firstName', ' ', '$employee.lastName'] },
          employeeEmail: '$employee.email',
          employeePhoto: '$employee.photo',
          latitude: '$location.latitude',
          longitude: '$location.longitude',
          accuracy: '$location.accuracy',
          timestamp: '$location.timestamp'
        }
      },
      {
        $addFields: {
          isOnline: {
            $gte: [
              { $toDate: '$timestamp' },
              { $subtract: [new Date(), 5 * 60 * 1000] } // 5 minutes ago
            ]
          }
        }
      }
    ]);

    res.json({
      success: true,
      count: locations.length,
      data: locations
    });
  } catch (error) {
    console.error('Error getting live locations:', error);
    res.status(500).json({ message: 'Server error getting live locations' });
  }
};

// @desc    Get employee route history
// @route   GET /api/location/history/:employeeId
// @access  Private (Admin)
const getLocationHistory = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { startDate, endDate } = req.query;

    // Build query
    const query = { employeeId };
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const locations = await Location.find(query)
      .select('latitude longitude timestamp accuracy')
      .sort({ timestamp: 1 });

    res.json({
      success: true,
      count: locations.length,
      data: locations
    });
  } catch (error) {
    console.error('Error getting location history:', error);
    res.status(500).json({ message: 'Server error getting location history' });
  }
};

// @desc    Get single employee current location
// @route   GET /api/location/current/:employeeId
// @access  Private (Admin)
const getCurrentLocation = async (req, res) => {
  try {
    const { employeeId } = req.params;

    const location = await Location.findOne({ employeeId, isLatest: true })
      .populate({
        path: 'employeeId',
        select: 'firstName lastName email photo'
      });

    if (!location) {
      return res.status(404).json({ message: 'No location found for this employee' });
    }

    res.json({
      success: true,
      data: location
    });
  } catch (error) {
    console.error('Error getting current location:', error);
    res.status(500).json({ message: 'Server error getting current location' });
  }
};

// @desc    Get my location (for employee)
// @route   GET /api/location/my-location
// @access  Private (Employee)
const getMyLocation = async (req, res) => {
  try {
    const employeeId = req.user._id;

    const location = await Location.findOne({ employeeId, isLatest: true });

    if (!location) {
      return res.status(404).json({ message: 'No location found' });
    }

    res.json({
      success: true,
      data: location
    });
  } catch (error) {
    console.error('Error getting my location:', error);
    res.status(500).json({ message: 'Server error getting location' });
  }
};

// @desc    Get location status (online/offline)
// @route   GET /api/location/status/:employeeId
// @access  Private (Admin)
const getLocationStatus = async (req, res) => {
  try {
    const { employeeId } = req.params;

    const location = await Location.findOne({ employeeId, isLatest: true })
      .sort({ timestamp: -1 })
      .select('timestamp');

    if (!location) {
      return res.json({
        success: true,
        data: { isOnline: false, lastSeen: null }
      });
    }

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const isOnline = location.timestamp > fiveMinutesAgo;

    res.json({
      success: true,
      data: {
        isOnline,
        lastSeen: location.timestamp
      }
    });
  } catch (error) {
    console.error('Error getting location status:', error);
    res.status(500).json({ message: 'Server error getting location status' });
  }
};

module.exports = {
  updateLocation,
  getLiveLocations,
  getLocationHistory,
  getCurrentLocation,
  getMyLocation,
  getLocationStatus,
  calculateDistance
};
