const Holiday = require('../models/Holiday');
const User = require('../models/User');
const { createNotificationsForAllUsers } = require('./notificationController');
const webpush = require('web-push');

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

    // Create persistent notifications for all users
    try {
      await createNotificationsForAllUsers(
        'holiday_created',
        'New Holiday Added',
        `New holiday: ${name} on ${new Date(date).toLocaleDateString()}`,
        { holidayId: holiday._id, holidayName: name, holidayDate: date }
      );
    } catch (notificationError) {
      console.error('Error creating notifications:', notificationError);
      // Don't fail the holiday creation if notifications fail
    }

    // Get all users to send push notifications
    const allUsers = await User.find({ status: 'Active' });

    const io = req.app.get('io');
    allUsers.forEach(user => {
      io.emit(`holiday-notification-${user._id}`, {
        type: 'new_holiday',
        message: `New holiday: ${name}`,
        holiday: holiday
      });
    });

    // Send push notifications to all users
    const notificationPayload = {
      title: '🎉 New Holiday Added',
      body: `${name} on ${new Date(date).toLocaleDateString()}`,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      url: '/holidays',
      data: {
        holidayId: holiday._id,
        type: 'new_holiday'
      }
    };

    // Send push notifications to all subscribed users
    const pushPromises = allUsers.map(async (user) => {
      if (user.pushSubscriptions && user.pushSubscriptions.length > 0) {
        const promises = user.pushSubscriptions.map(subscription =>
          webpush.sendNotification(subscription, JSON.stringify(notificationPayload))
            .catch(error => {
              // Remove invalid subscriptions
              if (error.statusCode === 410) {
                User.findByIdAndUpdate(user._id, {
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

    // Create persistent notifications for all users
    try {
      await createNotificationsForAllUsers(
        'holiday_updated',
        'Holiday Updated',
        `Holiday "${holiday.name}" has been updated`,
        { holidayId: holiday._id, holidayName: holiday.name, holidayDate: holiday.date }
      );
    } catch (notificationError) {
      console.error('Error creating notifications:', notificationError);
      // Don't fail the holiday update if notifications fail
    }

    // Get all users to send push notifications
    const allUsers = await User.find({ status: 'Active' });

    const io = req.app.get('io');
    allUsers.forEach(user => {
      io.emit(`holiday-notification-${user._id}`, {
        type: 'updated_holiday',
        message: `Holiday updated: ${holiday.name}`,
        holiday: holiday
      });
    });

    // Send push notifications to all users
    const notificationPayload = {
      title: '🗓️ Holiday Updated',
      body: `${holiday.name} has been updated`,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      url: '/holidays',
      data: {
        holidayId: holiday._id,
        type: 'updated_holiday'
      }
    };

    // Send push notifications to all subscribed users
    const pushPromises = allUsers.map(async (user) => {
      if (user.pushSubscriptions && user.pushSubscriptions.length > 0) {
        const promises = user.pushSubscriptions.map(subscription =>
          webpush.sendNotification(subscription, JSON.stringify(notificationPayload))
            .catch(error => {
              console.error(`Error sending push notification to ${user.email}:`, error);
              // Remove invalid subscriptions
              if (error.statusCode === 410) {
                User.findByIdAndUpdate(user._id, {
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

    // Create persistent notifications for all users
    try {
      await createNotificationsForAllUsers(
        'holiday_deleted',
        'Holiday Removed',
        `Holiday "${holiday.name}" has been deleted`,
        { holidayId: holiday._id, holidayName: holiday.name, holidayDate: holiday.date }
      );
    } catch (notificationError) {
      console.error('Error creating notifications:', notificationError);
      // Don't fail the holiday deletion if notifications fail
    }

    // Get all users to send push notifications
    const allUsers = await User.find({ status: 'Active' });

    const io = req.app.get('io');
    allUsers.forEach(user => {
      io.emit(`holiday-notification-${user._id}`, {
        type: 'deleted_holiday',
        message: `Holiday deleted: ${holiday.name}`,
        holiday: holiday
      });
    });

    // Send push notifications to all users
    const notificationPayload = {
      title: '⚠️ Holiday Removed',
      body: `${holiday.name} has been deleted`,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      url: '/holidays',
      data: {
        holidayId: holiday._id,
        type: 'deleted_holiday'
      }
    };

    // Send push notifications to all subscribed users
    const pushPromises = allUsers.map(async (user) => {
      if (user.pushSubscriptions && user.pushSubscriptions.length > 0) {
        const promises = user.pushSubscriptions.map(subscription =>
          webpush.sendNotification(subscription, JSON.stringify(notificationPayload))
            .catch(error => {
              console.error(`Error sending push notification to ${user.email}:`, error);
              // Remove invalid subscriptions
              if (error.statusCode === 410) {
                User.findByIdAndUpdate(user._id, {
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