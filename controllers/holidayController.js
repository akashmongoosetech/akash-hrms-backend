const Holiday = require('../models/Holiday');
const User = require('../models/User');
const { notifyRolesExceptActor } = require('./notificationController');
const webpush = require('web-push');

const formatHolidayDate = (date) => {
  if (!date) return 'an unscheduled date';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const getHolidays = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';

    let query = {};
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const totalHolidays = await Holiday.countDocuments(query);
    const holidays = await Holiday.find(query).sort({ date: 1 }).skip(skip).limit(limit);

    res.json({
      holidays,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalHolidays / limit),
        totalItems: totalHolidays,
        itemsPerPage: limit
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getHolidayById = async (req, res) => {
  try {
    const holiday = await Holiday.findById(req.params.id);
    if (!holiday) return res.status(404).json({ message: 'Holiday not found' });
    res.json(holiday);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const createHoliday = async (req, res) => {
  try {
    const { name, date } = req.body;

    if (!name || !date) {
      return res.status(400).json({ message: 'Name and date are required' });
    }

    const holiday = new Holiday({ name, date });
    await holiday.save();

    // Notify every employee/admin/super-admin except the person who created it.
    const actorName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'An administrator';
    await notifyRolesExceptActor({
      actor: req.user,
      type: 'holiday_created',
      title: 'New Holiday Added',
      message: `A new holiday, ${name}, has been added by ${actorName}.`,
      data: {
        action: 'created',
        holidayId: holiday._id,
        holidayName: holiday.name,
        holidayDate: holiday.date,
        actorId: req.user._id,
        actorName,
        link: '/holidays',
      },
      entityType: 'Holiday',
      entityId: holiday._id,
      io: req.app.get('io'),
      pushTitle: '🎉 New Holiday Added',
      pushUrl: '/holidays',
    });

    res.status(201).json({ message: 'Holiday created successfully', holiday });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const updateHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const holiday = await Holiday.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    if (!holiday) return res.status(404).json({ message: 'Holiday not found' });

    const actorName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'An administrator';
    await notifyRolesExceptActor({
      actor: req.user,
      type: 'holiday_updated',
      title: 'Holiday Updated',
      message: `${actorName} has updated the holiday ${holiday.name} (${formatHolidayDate(holiday.date)}).`,
      data: {
        action: 'updated',
        holidayId: holiday._id,
        holidayName: holiday.name,
        holidayDate: holiday.date,
        actorId: req.user._id,
        actorName,
        link: '/holidays',
      },
      entityType: 'Holiday',
      entityId: holiday._id,
      io: req.app.get('io'),
      pushTitle: '🗓️ Holiday Updated',
      pushUrl: '/holidays',
    });

    res.json({ message: 'Holiday updated successfully', holiday });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const deleteHoliday = async (req, res) => {
  try {
    const { id } = req.params;

    const holiday = await Holiday.findByIdAndDelete(id);
    if (!holiday) return res.status(404).json({ message: 'Holiday not found' });

    const actorName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'An administrator';
    await notifyRolesExceptActor({
      actor: req.user,
      type: 'holiday_deleted',
      title: 'Holiday Removed',
      message: `${actorName} has deleted the holiday ${holiday.name}.`,
      data: {
        action: 'deleted',
        holidayId: holiday._id,
        holidayName: holiday.name,
        holidayDate: holiday.date,
        actorId: req.user._id,
        actorName,
        link: '/holidays',
      },
      entityType: 'Holiday',
      entityId: holiday._id,
      io: req.app.get('io'),
      pushTitle: '⚠️ Holiday Removed',
      pushUrl: '/holidays',
    });

    res.json({ message: 'Holiday deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Test endpoint to manually send push notifications
const testPushNotification = async (req, res) => {
  try {
    const { message } = req.body;

    // Get all employees to send push notifications
    const employees = await User.find({ role: 'Employee' });

    console.log(`Test: Sending notifications to ${employees.length} employees`);

    const notificationPayload = {
      title: '🧪 Test Notification',
      body: message || 'This is a test push notification',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      url: '/holidays',
      data: {
        type: 'test_notification'
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

    await Promise.all(pushPromises);

    res.json({
      message: 'Test notifications sent',
      employeeCount: employees.length,
      subscriptionsCount: employees.reduce((sum, emp) => sum + (emp.pushSubscriptions?.length || 0), 0)
    });
  } catch (error) {
    console.error('Test notification error:', error);
    res.status(500).json({ message: 'Test failed', error: error.message });
  }
};

module.exports = { getHolidays, getHolidayById, createHoliday, updateHoliday, deleteHoliday, testPushNotification };
