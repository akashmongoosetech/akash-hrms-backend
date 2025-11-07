const Holiday = require('../models/Holiday');
const User = require('../models/User');
const webpush = require('web-push');

const getHolidays = async (req, res) => {
  try {
    const search = req.query.search || '';

    let query = {};
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const holidays = await Holiday.find(query).sort({ date: 1 });

    res.json(holidays);
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

    // Get all employees to send push notifications
    const employees = await User.find({ role: 'Employee' });

    const io = req.app.get('io');
    employees.forEach(employee => {
      io.emit(`holiday-notification-${employee._id}`, {
        type: 'new_holiday',
        message: `New holiday: ${name}`,
        holiday: holiday
      });
    });

    // Send push notifications to all employees
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

    // Get all employees to send push notifications
    const employees = await User.find({ role: 'Employee' });
    
    const io = req.app.get('io');
    employees.forEach(employee => {
      io.emit(`holiday-notification-${employee._id}`, {
        type: 'updated_holiday',
        message: `Holiday updated: ${holiday.name}`,
        holiday: holiday
      });
    });
    
    // Send push notifications to all employees
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

    // Send push notifications to all subscribed employees
    const pushPromises = employees.map(async (employee) => {
      if (employee.pushSubscriptions && employee.pushSubscriptions.length > 0) {
        const promises = employee.pushSubscriptions.map(subscription =>
          webpush.sendNotification(subscription, JSON.stringify(notificationPayload))
            .catch(error => {
              console.error(`Error sending push notification to ${employee.email}:`, error);
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

    // Get all employees to send push notifications
    const employees = await User.find({ role: 'Employee' });

    const io = req.app.get('io');
    employees.forEach(employee => {
      io.emit(`holiday-notification-${employee._id}`, {
        type: 'deleted_holiday',
        message: `Holiday deleted: ${holiday.name}`,
        holiday: holiday
      });
    });

    // Send push notifications to all employees
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

    // Send push notifications to all subscribed employees
    const pushPromises = employees.map(async (employee) => {
      if (employee.pushSubscriptions && employee.pushSubscriptions.length > 0) {
        const promises = employee.pushSubscriptions.map(subscription =>
          webpush.sendNotification(subscription, JSON.stringify(notificationPayload))
            .catch(error => {
              console.error(`Error sending push notification to ${employee.email}:`, error);
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