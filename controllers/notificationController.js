const mongoose = require('mongoose');
const webpush = require('web-push');
const Notification = require('../models/Notification');
const User = require('../models/User');
const Team = require('../models/Team');

const PRIVILEGED_ROLES = ['Admin', 'SuperAdmin'];
const HOLIDAY_RECIPIENT_ROLES = ['Employee', 'Admin', 'SuperAdmin'];

// Notifications are private. Nobody — including Admins and SuperAdmins — may
// read or mutate another user's notification feed. Admin-only maintenance
// operations (cleanup) are handled separately below.
const canAccessUserNotifications = (req, userId) =>
  String(req.user._id) === String(userId);

const toIdString = (value) => {
  if (!value) return null;
  const raw = value._id || value;
  const id = String(raw);
  return mongoose.Types.ObjectId.isValid(id) ? id : null;
};

const uniqueRecipientIds = (recipients = [], excludeId = null) => {
  const ids = new Set();
  for (const recipient of recipients) {
    const id = toIdString(recipient);
    if (id && id !== excludeId) ids.add(id);
  }
  return [...ids];
};

const fullName = (user) =>
  [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || 'System';

const sendPushNotifications = (users, payload) => {
  const jobs = [];
  for (const user of users) {
    if (!Array.isArray(user.pushSubscriptions)) continue;
    for (const subscription of user.pushSubscriptions) {
      jobs.push(
        webpush.sendNotification(subscription, JSON.stringify(payload)).catch(async (error) => {
          if (error?.statusCode === 410) {
            try {
              await User.findByIdAndUpdate(user._id, {
                $pull: { pushSubscriptions: subscription }
              });
            } catch (cleanupError) {
              console.error('Failed to remove expired push subscription:', cleanupError.message);
            }
          }
        })
      );
    }
  }
  return Promise.all(jobs);
};

/**
 * Create notifications for an explicit list of recipients and deliver them in
 * real time. This is the single entry point used by feature controllers so
 * recipient de-duplication, actor exclusion, socket delivery and push delivery
 * all behave consistently.
 *
 * Never throws: a notification failure must not roll back the business action
 * that triggered it. Returns the number of notifications created.
 */
const notifyUsers = async ({
  recipients = [],
  exclude = null,
  type,
  title,
  message,
  data = {},
  actor = null,
  entityType = null,
  entityId = null,
  io = null,
  pushTitle = null,
  pushUrl = null,
} = {}) => {
  try {
    const excludeId = toIdString(exclude);
    const recipientIds = uniqueRecipientIds(recipients, excludeId);
    if (!recipientIds.length) return 0;

    const users = await User.find({
      _id: { $in: recipientIds },
      // Inactive users still receive notifications about themselves (e.g. an
      // employment-status change), but deleted accounts never do.
      status: { $ne: 'Deleted' },
    }).select('_id firstName lastName role pushSubscriptions');

    if (!users.length) return 0;

    const actorId = toIdString(actor);
    const actorName = actor ? fullName(actor) : null;

    const documents = users.map((user) => ({
      user: user._id,
      type,
      title,
      message,
      data,
      actor: actorId || undefined,
      actorName: actorName || undefined,
      entityType: entityType || undefined,
      entityId: toIdString(entityId) || undefined,
    }));

    const created = await Notification.insertMany(documents, { ordered: false });

    // Real-time delivery. The room is derived from the authenticated JWT, so a
    // client can never subscribe to another user's channel.
    if (io) {
      created.forEach((notification, index) => {
        const targetUser = users[index];
        if (!targetUser) return;
        io.to(String(targetUser._id)).emit(`notification-created-${targetUser._id}`, {
          _id: notification._id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data,
          actorName: notification.actorName,
          read: notification.read,
          createdAt: notification.createdAt,
        });
      });
    }

    const link = data?.link || pushUrl || '/dashboard';
    try {
      await sendPushNotifications(users, {
        title: pushTitle || title,
        body: message,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        url: link,
        data: { ...data, type, link },
      });
    } catch (pushError) {
      console.error('Error sending notification push:', pushError.message);
    }

    return created.length;
  } catch (error) {
    console.error('Error creating notifications:', error);
    return 0;
  }
};

/**
 * Deliver a notification to every active user in the given roles except the
 * actor. Used for company-wide announcements such as holiday changes.
 */
const notifyRolesExceptActor = async ({
  roles = HOLIDAY_RECIPIENT_ROLES,
  actor,
  type,
  title,
  message,
  data = {},
  entityType = null,
  entityId = null,
  io = null,
  pushTitle = null,
  pushUrl = null,
} = {}) => {
  try {
    const actorId = toIdString(actor);
    const query = { status: 'Active', role: { $in: roles } };
    if (actorId) query._id = { $ne: actorId };

    const users = await User.find(query).select('_id');
    return await notifyUsers({
      recipients: users.map((user) => user._id),
      exclude: actorId,
      type,
      title,
      message,
      data,
      actor,
      entityType,
      entityId,
      io,
      pushTitle,
      pushUrl,
    });
  } catch (error) {
    console.error('Error creating role notifications:', error);
    return 0;
  }
};


/**
 * Return the active user ids for a set of roles. Recipient selection always
 * happens here, on the server, from the database — never from client input.
 */
const getUserIdsByRoles = async (roles = [], { activeOnly = true } = {}) => {
  if (!Array.isArray(roles) || !roles.length) return [];
  const query = { role: { $in: roles } };
  if (activeOnly) query.status = 'Active';
  const users = await User.find(query).select('_id').lean();
  return uniqueRecipientIds(users.map((user) => user._id));
};

/**
 * Resolve an employee's assigned manager(s) through Team membership. An
 * employee can belong to more than one team, so every distinct active manager
 * is returned. Missing/invalid ids and deleted managers are ignored.
 */
const getManagerIdsForEmployee = async (employeeId) => {
  const id = toIdString(employeeId);
  if (!id) return [];

  const teams = await Team.find({ teamMembers: id, status: 'Active' })
    .select('manager')
    .lean();
  const managerIds = uniqueRecipientIds(teams.map((team) => team.manager));
  if (!managerIds.length) return [];

  const managers = await User.find({
    _id: { $in: managerIds },
    status: 'Active',
  }).select('_id').lean();

  return managers.map((manager) => String(manager._id));
};

// Get notifications for a user
const getUserNotifications = async (req, res) => {
  try {
    const userId = req.params.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    if (!canAccessUserNotifications(req, userId)) {
      return res.status(403).json({ message: 'Forbidden: you can only access your own notifications' });
    }

    const notifications = await Notification.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'firstName lastName');

    const total = await Notification.countDocuments({ user: userId });
    const unreadCount = await Notification.countDocuments({ user: userId, read: false });

    res.json({
      notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      unreadCount
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get unread notifications count
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.params.userId;

    if (!canAccessUserNotifications(req, userId)) {
      return res.status(403).json({ message: 'Forbidden: you can only access your own notifications' });
    }

    const unreadCount = await Notification.countDocuments({ user: userId, read: false });
    res.json({ unreadCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Mark notification as read
const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.id; // From auth middleware

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, user: userId },
      { read: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.json({ message: 'Notification marked as read', notification });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Mark all notifications as read for a user
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.params.userId;

    if (!canAccessUserNotifications(req, userId)) {
      return res.status(403).json({ message: 'Forbidden: you can only modify your own notifications' });
    }

    await Notification.updateMany(
      { user: userId, read: false },
      { read: true, readAt: new Date() }
    );

    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create notification for a user
const createNotification = async (userId, type, title, message, data = {}) => {
  try {
    const notification = new Notification({
      user: userId,
      type,
      title,
      message,
      data
    });

    await notification.save();
    return notification;
  } catch (err) {
    console.error('Error creating notification:', err);
    throw err;
  }
};

// Create notifications for all users (for events, holidays, etc.)
const createNotificationsForAllUsers = async (type, title, message, data = {}) => {
  try {
    const users = await User.find({ status: 'Active' });
    const notifications = users.map(user => ({
      user: user._id,
      type,
      title,
      message,
      data
    }));

    await Notification.insertMany(notifications);
    return notifications.length;
  } catch (err) {
    console.error('Error creating notifications for all users:', err);
    throw err;
  }
};

// Delete old read notifications (cleanup)
const cleanupOldNotifications = async (req, res) => {
  try {
    if (!PRIVILEGED_ROLES.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden: admin access required' });
    }

    const daysOld = parseInt(req.query.days) || 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await Notification.deleteMany({
      read: true,
      createdAt: { $lt: cutoffDate }
    });

    res.json({ message: `Deleted ${result.deletedCount} old notifications` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  createNotification,
  createNotificationsForAllUsers,
  notifyUsers,
  notifyRolesExceptActor,
  getUserIdsByRoles,
  getManagerIdsForEmployee,
  HOLIDAY_RECIPIENT_ROLES,
  cleanupOldNotifications
};