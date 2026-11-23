const Event = require('../models/Event');
const { notifyAllExceptActor } = require('./notificationController');

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

    // Create persistent notifications for all users except the actor
    const actorName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'An administrator';
    await notifyAllExceptActor({
      actor: req.user,
      type: 'event_created',
      title: 'New Event Added',
      message: `${actorName} has created a new event: ${name}.`,
      data: {
        action: 'created',
        eventId: event._id,
        eventName: name,
        eventDate: date,
        actorId: req.user._id,
        actorName,
        link: '/events',
      },
      entityType: 'Event',
      entityId: event._id,
      io: req.app.get('io'),
      pushTitle: '🎊 New Event Added',
      pushUrl: '/events',
    });

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

    // Notify every active user except the actor (Admin/SuperAdmin performing
    // the change). The central service handles real-time and push delivery.
    const actorName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'An administrator';
    await notifyAllExceptActor({
      actor: req.user,
      type: 'event_updated',
      title: 'Event Updated',
      message: `${actorName} has updated the event: ${event.name}.`,
      data: {
        action: 'updated',
        eventId: event._id,
        eventName: event.name,
        eventDate: event.date,
        actorId: req.user._id,
        actorName,
        link: '/events',
      },
      entityType: 'Event',
      entityId: event._id,
      io: req.app.get('io'),
      pushTitle: '📅 Event Updated',
      pushUrl: '/events',
    });

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

    // Notify every active user except the actor.
    const actorName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'An administrator';
    await notifyAllExceptActor({
      actor: req.user,
      type: 'event_deleted',
      title: 'Event Removed',
      message: `${actorName} has deleted the event: ${event.name}.`,
      data: {
        action: 'deleted',
        eventId: event._id,
        eventName: event.name,
        eventDate: event.date,
        actorId: req.user._id,
        actorName,
        link: '/events',
      },
      entityType: 'Event',
      entityId: event._id,
      io: req.app.get('io'),
      pushTitle: '🚫 Event Removed',
      pushUrl: '/events',
    });

    res.json({ message: 'Event deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = { getEvents, getEventById, createEvent, updateEvent, deleteEvent };