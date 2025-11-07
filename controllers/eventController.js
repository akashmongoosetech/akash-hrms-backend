const Event = require('../models/Event');
const User = require('../models/User');
const webpush = require('web-push');

const getEvents = async (req, res) => {
  try {
    const events = await Event.find().sort({ date: 1 });
    res.json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getEventById = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    res.json(event);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const createEvent = async (req, res) => {
  try {
    const { name, date } = req.body;

    if (!name || !date) {
      return res.status(400).json({ message: 'Name and date are required' });
    }

    const event = new Event({ name, date });
    await event.save();

    // Get all employees to send push notifications
    const employees = await User.find({ role: 'Employee' });

    // Send push notifications to all employees
    const notificationPayload = {
      title: '🎊 New Event Added',
      body: `${name} on ${new Date(date).toLocaleDateString()}`,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      url: '/events',
      data: {
        eventId: event._id,
        type: 'new_event'
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

    res.status(201).json({ message: 'Event created successfully', event });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const updateEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const event = await Event.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    if (!event) return res.status(404).json({ message: 'Event not found' });

    // Get all employees to send push notifications
    const employees = await User.find({ role: 'Employee' });

    // Send push notifications to all employees
    const notificationPayload = {
      title: '📅 Event Updated',
      body: `${event.name} has been updated`,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      url: '/events',
      data: {
        eventId: event._id,
        type: 'updated_event'
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

    res.json({ message: 'Event updated successfully', event });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;

    const event = await Event.findByIdAndDelete(id);
    if (!event) return res.status(404).json({ message: 'Event not found' });

    // Get all employees to send push notifications
    const employees = await User.find({ role: 'Employee' });

    // Send push notifications to all employees
    const notificationPayload = {
      title: '🚫 Event Removed',
      body: `${event.name} has been deleted`,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      url: '/events',
      data: {
        eventId: event._id,
        type: 'deleted_event'
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

    res.json({ message: 'Event deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getEvents, getEventById, createEvent, updateEvent, deleteEvent };