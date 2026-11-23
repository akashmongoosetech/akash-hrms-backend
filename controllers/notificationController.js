const mongoose = require('mongoose');
const webpush = require('web-push');
const Notification = require('../models/Notification');
const User = require('../models/User');
const Team = require('../models/Team');
const {
  getSessionsViewingConversation,
  getUserSessions,
} = require('../services/chatPresence');

const PRIVILEGED_ROLES = ['Admin', 'SuperAdmin'];
const HOLIDAY_RECIPIENT_ROLES = ['Employee', 'Admin', 'SuperAdmin'];

// Notifications are private. Nobody â€” including Admins and SuperAdmins â€” may
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

// ---------------------------------------------------------------------------
// Chat notification pipeline
// ---------------------------------------------------------------------------

const notificationCountFor = (userId) =>
  Notification.countDocuments({ user: userId, read: false });

/**
 * Emit the authoritative unread count to every session of a user. Counts are
 * always read back from MongoDB instead of being incremented client-side, which
 * removes the usual double-increment races when several tabs are open.
 */
const emitNotificationCount = async (io, userId) => {
  if (!io || !userId) return 0;
  const unreadCount = await notificationCountFor(userId);
  io.to(String(userId)).emit('notification:count:update', { unreadCount });
  return unreadCount;
};

const serializeNotification = (notification) => ({
  _id: String(notification._id),
  type: notification.type,
  title: notification.title,
  message: notification.message,
  data: notification.data,
  actorName: notification.actorName,
  read: !!notification.read,
  createdAt: notification.createdAt,
});

/**
 * Insert one notification idempotently. When `dedupeKey` is supplied and a
 * record already exists, the existing record is returned and `created` is
 * false so callers do not emit a duplicate real-time event.
 */
const persistNotification = async (document) => {
  if (!document) throw new Error('Notification document is required');

  if (document.dedupeKey) {
    const existing = await Notification.findOne({
      dedupeKey: document.dedupeKey,
    });
    if (existing) return { notification: existing, created: false };
  }

  try {
    const notification = await Notification.create(document);
    return { notification, created: true };
  } catch (error) {
    // Two simultaneous requests can both pass the pre-check; the unique sparse
    // index on dedupeKey resolves the race.
    if (error && error.code === 11000 && document.dedupeKey) {
      const existing = await Notification.findOne({
        dedupeKey: document.dedupeKey,
      });
      if (existing) return { notification: existing, created: false };
    }
    throw error;
  }
};

const chatPreviewOf = (message, fileName) => {
  const source =
    (message || '').trim() ||
    (fileName ? `Sent an attachment: ${fileName}` : 'New message');
  return source.length > 140 ? `${source.slice(0, 137)}...` : source;
};

/**
 * Central chat notification entry point.
 *
 * Policy (documented in Phase 7 of the chat work):
 *   1. The message is always delivered live to every recipient session by the
 *      chat controller.
 *   2. If at least one authenticated session is actively viewing the exact
 *      conversation, no persistent notification is created. Other sessions get
 *      an ephemeral `chat:notification:toast` event so a second tab is not left
 *      uninformed, but no duplicate database rows are produced.
 *   3. If no session is viewing the conversation (including the offline case),
 *      exactly one persistent notification is stored (idempotent by messageId)
 *      and then emitted to every session.
 *
 * The notification is persisted *before* any socket event is emitted, so a
 * failed/absent socket can never lose it.
 */
const handleChatNotification = async ({
  sender,
  recipient,
  messageId,
  message,
  fileName,
  io,
} = {}) => {
  try {
    const senderId = toIdString(sender);
    const recipientId = toIdString(recipient);
    const messageIdStr = toIdString(messageId);
    if (!senderId || !recipientId || !messageIdStr) return { created: false };
    if (senderId === recipientId) return { created: false };

    const senderName =
      [sender?.firstName, sender?.lastName].filter(Boolean).join(' ').trim() ||
      'A teammate';
    const preview = chatPreviewOf(message, fileName);
    // In a 1:1 chat the conversation the recipient should open is the sender.
    const conversationId = senderId;
    const link = `/chat?userId=${senderId}`;
    const data = {
      action: 'message_received',
      senderId,
      senderName,
      receiverId: recipientId,
      messageId: messageIdStr,
      conversationId,
      preview,
      link,
      notificationType: 'chat_message',
    };

    const viewingSocketIds = getSessionsViewingConversation(
      recipientId,
      senderId,
    );

    if (viewingSocketIds.length > 0) {
      // The recipient is looking at this exact conversation somewhere. Do not
      // create a separate persistent notification. Tell the other tabs/devices
      // through an ephemeral event only.
      const viewing = new Set(viewingSocketIds);
      const otherSocketIds = getUserSessions(recipientId)
        .map((session) => session.socketId)
        .filter((socketId) => !viewing.has(socketId));

      if (io && otherSocketIds.length) {
        io.to(otherSocketIds).emit('chat:notification:toast', {
          ...data,
          isRead: false,
          createdAt: new Date().toISOString(),
        });
      }

      return { created: false, suppressed: true };
    }

    const dedupeKey = `chat:${messageIdStr}:${recipientId}`;
    const { notification, created } = await persistNotification({
      user: recipientId,
      type: 'chat_message',
      title: `New message from ${senderName}`,
      message: `${senderName}: ${preview}`,
      data,
      actor: senderId,
      actorName: senderName,
      entityType: 'Message',
      entityId: messageIdStr,
      dedupeKey,
    });

    if (!created) {
      // A retry of the same message: the record already exists and was already
      // announced. Never emit it twice.
      return { created: false, notification };
    }

    const payload = serializeNotification(notification);

    if (io) {
      io.to(recipientId).emit('notification:new', {
        notification: payload,
      });
      // Legacy event kept for existing clients/components.
      io.to(recipientId).emit(
        `notification-created-${recipientId}`,
        payload,
      );
      await emitNotificationCount(io, recipientId);
    }

    // Web Push is best-effort and never blocks persistence or socket delivery.
    try {
      const recipientUser = await User.findById(recipientId)
        .select('_id pushSubscriptions')
        .lean();
      if (recipientUser) {
        await sendPushNotifications([recipientUser], {
          title: `💬 ${senderName}`,
          body: preview,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          url: link,
          data: { ...data, type: 'chat_message', link },
        });
      }
    } catch (pushError) {
      console.error('Error sending chat push notification:', pushError.message);
    }

    return { created: true, notification };
  } catch (error) {
    // A notification failure must never fail the message send. The message is
    // already saved and will be re-surfaced by the unread API on next load.
    console.error('Error handling chat notification:', error);
    return { created: false, error };
  }
};

/**
 * Mark the chat notifications belonging to one conversation as read and push
 * the new authoritative unread count to every session.
 */
const markChatNotificationsRead = async ({ userId, senderId, io } = {}) => {
  const userKey = toIdString(userId);
  const senderKey = toIdString(senderId);
  if (!userKey) return 0;

  const query = { user: userKey, type: 'chat_message', read: false };
  if (senderKey) query['data.senderId'] = senderKey;

  const result = await Notification.updateMany(query, {
    read: true,
    readAt: new Date(),
  });

  if (result.modifiedCount > 0 && io) {
    await emitNotificationCount(io, userKey);
    io.to(userKey).emit('chat:notifications:read', {
      senderId: senderKey || null,
    });
  }

  return result.modifiedCount || 0;
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
 * happens here, on the server, from the database â€” never from client input.
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

/**
 * Notify all employees/admins/superadmins except the action actor.
 * Used for EVENT_CREATED/UPDATED/DELETED, COURSE_CREATED/UPDATED/DELETED,
 * BLOG_CREATED/UPDATED/DELETED, and HOLIDAY actions.
 */
const notifyAllExceptActor = async ({
  roles = ['Employee', 'Admin', 'SuperAdmin'],
  actor,
  type,
  title,
  message,
  data = {},
  entityType,
  entityId,
  io,
  pushTitle,
  pushUrl,
} = {}) => {
  const actorId = toIdString(actor);
  const query = { status: 'Active', role: { $in: roles } };
  if (actorId) query._id = { $ne: actorId };

  const users = await User.find(query).select('_id firstName lastName role pushSubscriptions').lean();
  if (!users.length) return 0;

  const actorName = actor ? fullName(actor) : null;
  const documents = users.map((user) => ({
    user: user._id,
    type,
    title,
    message,
    data: { ...data, actorName },
    actor: actorId || undefined,
    actorName: actorName || undefined,
    entityType: entityType || undefined,
    entityId: toIdString(entityId) || undefined,
  }));

  const created = await Notification.insertMany(documents, { ordered: false });

  // Real-time delivery
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

  // Push delivery
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
};

/**
 * Notify all Admins and SuperAdmins except the action actor.
 * Used for leave status updates, ticket progress by employee, etc.
 */
const notifyAdminsSuperAdminsExceptActor = async ({
  actor,
  type,
  title,
  message,
  data = {},
  entityType,
  entityId,
  io,
  pushTitle,
  pushUrl,
} = {}) => {
  const actorId = toIdString(actor);
  const query = { status: 'Active', role: { $in: ['Admin', 'SuperAdmin'] } };
  if (actorId) query._id = { $ne: actorId };

  const users = await User.find(query).select('_id firstName lastName role pushSubscriptions').lean();
  if (!users.length) return 0;

  const actorName = actor ? fullName(actor) : null;
  const documents = users.map((user) => ({
    user: user._id,
    type,
    title,
    message,
    data: { ...data, actorName },
    actor: actorId || undefined,
    actorName: actorName || undefined,
    entityType: entityType || undefined,
    entityId: toIdString(entityId) || undefined,
  }));

  const created = await Notification.insertMany(documents, { ordered: false });

  // Real-time delivery
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

  // Push delivery
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
};

/**
 * Notify the assigned employee(s) for a task/ticket/quiz.
 * Used for TODO, QUIZ assignment, and ticket creation/updates/deletions.
 * Excludes the actor automatically.
 */
const notifyAssignedEmployee = async ({
  employeeId,
  actor,
  type,
  title,
  message,
  data = {},
  dueDate,
  entityType = null,
  entityId = null,
  io,
  pushTitle,
  pushUrl,
} = {}) => {
  const employeeIdStr = toIdString(employeeId);
  if (!employeeIdStr) return 0;

  // Exclude the actor from receiving their own notification
  const query = { _id: employeeIdStr, status: 'Active' };
  if (actor) {
    query._id = { $ne: toIdString(actor) };
  }

  const user = await User.findOne(query).select('_id firstName lastName role pushSubscriptions').lean();
  if (!user) return 0;

  const actorId = toIdString(actor);
  const actorName = actor ? fullName(actor) : null;
  const document = {
    user: user._id,
    type,
    title,
    message,
    data: {
      ...data,
      ...(dueDate !== undefined && { dueDate }),
      actorName,
    },
    actor: actorId || undefined,
    actorName: actorName || undefined,
    entityType: entityType || undefined,
    entityId: entityId ? toIdString(entityId) : undefined,
  };

  const created = await Notification.insertOne(document);

  // Real-time delivery
  if (io && created) {
    io.to(String(user._id)).emit(`notification-created-${user._id}`, {
      _id: created._id,
      type: created.type,
      title: created.title,
      message: created.message,
      data: created.data,
      actorName: created.actorName,
      read: created.read,
      createdAt: created.createdAt,
    });
  }

  // Push delivery
  const link = data?.link || pushUrl || '/dashboard';
  try {
    await sendPushNotifications([user], {
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

  return created ? 1 : 0;
};

/**
 * Notify a specific user (e.g., for ticket progress, quiz assignment).
 */
const notifySpecificUser = async ({
  userId,
  actor,
  type,
  title,
  message,
  data = {},
  entityType = null,
  entityId = null,
  io,
  pushTitle,
  pushUrl,
} = {}) => {
  const targetId = toIdString(userId);
  if (!targetId) return 0;

  // Exclude the actor from receiving their own notification
  const query = { _id: targetId, status: 'Active' };
  if (actor) {
    query._id = { $ne: toIdString(actor) };
  }

  const user = await User.findOne(query).select('_id firstName lastName role pushSubscriptions').lean();
  if (!user) return 0;

  const actorId = toIdString(actor);
  const actorName = actor ? fullName(actor) : null;
  const document = {
    user: user._id,
    type,
    title,
    message,
    data: {
      ...data,
      actorName,
    },
    actor: actorId || undefined,
    actorName: actorName || undefined,
    entityType: entityType || undefined,
    entityId: entityId ? toIdString(entityId) : undefined,
  };

  const created = await Notification.insertOne(document);

  // Real-time delivery
  if (io && created) {
    io.to(String(user._id)).emit(`notification-created-${user._id}`, {
      _id: created._id,
      type: created.type,
      title: created.title,
      message: created.message,
      data: created.data,
      actorName: created.actorName,
      read: created.read,
      createdAt: created.createdAt,
    });
  }

  // Push delivery
  const link = data?.link || pushUrl || '/dashboard';
  try {
    await sendPushNotifications([user], {
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

  return created ? 1 : 0;
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
    const userId = req.user._id; // From auth middleware

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, user: userId },
      { read: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    const io = req.app.get('io');
    const unreadCount = await emitNotificationCount(io, userId);

    res.json({ message: 'Notification marked as read', notification, unreadCount });
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

    const io = req.app.get('io');
    if (io) {
      io.to(String(userId)).emit('notification:count:update', { unreadCount: 0 });
    }

    res.json({ message: 'All notifications marked as read', unreadCount: 0 });
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
  handleChatNotification,
  markChatNotificationsRead,
  emitNotificationCount,
  notifyAllExceptActor,
  notifyAdminsSuperAdminsExceptActor,
  notifyAssignedEmployee,
  notifySpecificUser,
  getUserIdsByRoles,
  getManagerIdsForEmployee,
  HOLIDAY_RECIPIENT_ROLES,
  cleanupOldNotifications
};
