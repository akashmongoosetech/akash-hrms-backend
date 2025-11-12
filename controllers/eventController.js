const Event = require('../models/Event');
const User = require('../models/User');
const { createNotificationsForAllUsers } = require('./notificationController');
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

    // Create persistent notifications for all users
    try {
      await createNotificationsForAllUsers(
        'event_created',
        'New Event Added',
        `New event: ${name} on ${new Date(date).toLocaleDateString()}`,
        { eventId: event._id, eventName: name, eventDate: date }
      );
    } catch (notificationError) {
      console.error('Error creating notifications:', notificationError);
      // Don't fail the event creation if notifications fail
    }

    // Get all users to send push notifications
    const allUsers = await User.find({ status: 'Active' });

    // Emit real-time notification to all users
    const io = req.app.get('io');
    allUsers.forEach(user => {
      io.emit(`event-notification-${user._id}`, {
        type: 'new_event',
        message: `New event: ${name}`,
        event: event
      });
     });

    // Send push notifications to all users
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

    // Create persistent notifications for all users
    try {
      await createNotificationsForAllUsers(
        'event_updated',
        'Event Updated',
        `Event "${event.name}" has been updated`,
        { eventId: event._id, eventName: event.name, eventDate: event.date }
      );
    } catch (notificationError) {
      console.error('Error creating notifications:', notificationError);
      // Don't fail the event update if notifications fail
    }

    // Get all users to send push notifications
    const allUsers = await User.find({ status: 'Active' });

    const io = req.app.get('io');
    allUsers.forEach(user => {
      io.emit(`event-notification-${user._id}`, {
        type: 'updated_event',
        message: `Event Updated: ${event.name}`,
        event: event
      });
     });

    // Send push notifications to all users
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

    // Create persistent notifications for all users
    try {
      await createNotificationsForAllUsers(
        'event_deleted',
        'Event Removed',
        `Event "${event.name}" has been deleted`,
        { eventId: event._id, eventName: event.name, eventDate: event.date }
      );
    } catch (notificationError) {
      console.error('Error creating notifications:', notificationError);
      // Don't fail the event deletion if notifications fail
    }

    // Get all users to send push notifications
    const allUsers = await User.find({ status: 'Active' });

    const io = req.app.get('io');
    allUsers.forEach(user => {
      io.emit(`event-notification-${user._id}`, {
        type: 'deleted_event',
        message: `Event Deleted: ${event.name}`,
        event: event
      });
     });


    // Send push notifications to all users
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

    res.json({ message: 'Event deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = { getEvents, getEventById, createEvent, updateEvent, deleteEvent };