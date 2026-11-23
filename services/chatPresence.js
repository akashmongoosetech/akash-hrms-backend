/**
 * Server-side chat presence registry.
 *
 * Presence is tracked per authenticated socket (one entry per browser tab or
 * device), never per user only. That is what makes multi-tab / multi-device
 * behaviour correct:
 *
 *   - Every socket carries its own current section, active conversation and
 *     visibility flag.
 *   - A user is online while at least one authenticated socket has a fresh
 *     heartbeat (or is still connected).
 *   - A user is "actively viewing" a 1:1 conversation only when a socket is in
 *     the Chat section, the tab is visible, and the exact conversation partner
 *     id is open.
 *
 * The registry is intentionally in-process (the same model the rest of this
 * app uses for Socket.IO). If the API is ever scaled horizontally this module
 * is the only place that needs to be backed by Redis.
 */

// userId -> Map<socketId, session>
const presenceByUser = new Map();

// A socket that has not sent a heartbeat for this long is considered stale.
// The client sends a heartbeat every 25s, so 75s tolerates two lost beats.
const SESSION_TTL_MS = 75 * 1000;

const normalizeUserId = (userId) => {
  const value = userId ? String(userId) : '';
  return /^[a-f\d]{24}$/i.test(value) ? value : null;
};

const normalizeSection = (section) =>
  typeof section === 'string' && section.trim()
    ? section.trim().toLowerCase().slice(0, 32)
    : null;

const normalizeConversationId = (conversationId) => {
  if (!conversationId) return null;
  const value = String(conversationId);
  // Conversation ids are the other participant's Mongo ObjectId. Anything else
  // is ignored so a malformed client payload cannot create a bogus "viewing"
  // state.
  return /^[a-f\d]{24}$/i.test(value) ? value : null;
};

const normalizeDeviceSessionId = (deviceSessionId) => {
  if (typeof deviceSessionId !== 'string') return null;
  const value = deviceSessionId.trim();
  return value ? value.slice(0, 128) : null;
};

const isFresh = (session, now = Date.now()) =>
  !!session && now - (session.lastHeartbeat || 0) <= SESSION_TTL_MS;

const getUserSockets = (userId) => {
  const key = normalizeUserId(userId);
  if (!key) return null;
  const sockets = presenceByUser.get(key);
  if (!sockets || !sockets.size) {
    if (sockets) presenceByUser.delete(key);
    return null;
  }
  return sockets;
};

const registerSocket = ({
  userId,
  role = null,
  socketId,
  deviceSessionId = null,
} = {}) => {
  const userKey = normalizeUserId(userId);
  const socketKey = socketId ? String(socketId) : '';
  if (!userKey || !socketKey) return null;

  let sockets = presenceByUser.get(userKey);
  if (!sockets) {
    sockets = new Map();
    presenceByUser.set(userKey, sockets);
  }

  const now = Date.now();
  const existing = sockets.get(socketKey);
  const session = {
    userId: userKey,
    role: role || existing?.role || null,
    socketId: socketKey,
    deviceSessionId:
      normalizeDeviceSessionId(deviceSessionId) || existing?.deviceSessionId || null,
    isOnline: true,
    currentSection: existing?.currentSection ?? null,
    activeConversationId: existing?.activeConversationId ?? null,
    visible: existing?.visible ?? true,
    connectedAt: existing?.connectedAt || now,
    lastSeen: now,
    lastHeartbeat: now,
  };

  sockets.set(socketKey, session);
  return { ...session };
};

/**
 * Merge presence fields for one socket. Fields that are not supplied are left
 * untouched, which lets a heartbeat update only `visible` without clearing the
 * active conversation.
 */
const updateSocketPresence = (userId, socketId, updates = {}) => {
  const userKey = normalizeUserId(userId);
  const socketKey = socketId ? String(socketId) : '';
  if (!userKey || !socketKey) return null;

  let sockets = presenceByUser.get(userKey);
  if (!sockets) {
    sockets = new Map();
    presenceByUser.set(userKey, sockets);
  }

  const now = Date.now();
  const existing = sockets.get(socketKey) || {
    userId: userKey,
    role: null,
    socketId: socketKey,
    deviceSessionId: null,
    isOnline: true,
    currentSection: null,
    activeConversationId: null,
    visible: true,
    connectedAt: now,
    lastSeen: now,
    lastHeartbeat: now,
  };

  const hasSection = Object.prototype.hasOwnProperty.call(updates, 'section');
  const hasConversation = Object.prototype.hasOwnProperty.call(
    updates,
    'conversationId',
  );
  const hasVisible = Object.prototype.hasOwnProperty.call(updates, 'visible');

  const session = {
    ...existing,
    isOnline: true,
    lastSeen: now,
    lastHeartbeat: now,
  };

  if (hasSection) session.currentSection = normalizeSection(updates.section);
  if (hasConversation) {
    session.activeConversationId = normalizeConversationId(updates.conversationId);
  }
  if (hasVisible) session.visible = updates.visible !== false;

  // Any update is also a heartbeat: a client that is actively reporting its
  // location cannot be considered stale.
  sockets.set(socketKey, session);
  return { ...session };
};

const heartbeat = (userId, socketId, updates = {}) =>
  updateSocketPresence(userId, socketId, updates);

const removeSocket = (userId, socketId) => {
  const userKey = normalizeUserId(userId);
  const socketKey = socketId ? String(socketId) : '';
  if (!userKey || !socketKey) return { removed: false, userWentOffline: false };

  const sockets = presenceByUser.get(userKey);
  if (!sockets) return { removed: false, userWentOffline: false };

  const removed = sockets.delete(socketKey);
  const userWentOffline = sockets.size === 0;
  if (userWentOffline) presenceByUser.delete(userKey);

  return { removed, userWentOffline };
};

const getSession = (userId, socketId) => {
  const sockets = getUserSockets(userId);
  if (!sockets) return null;
  const session = sockets.get(String(socketId));
  return session && isFresh(session) ? { ...session } : null;
};

const getUserSessions = (userId) => {
  const sockets = getUserSockets(userId);
  if (!sockets) return [];
  const now = Date.now();
  return [...sockets.values()]
    .filter((session) => isFresh(session, now))
    .map((session) => ({ ...session }));
};

const isUserOnline = (userId) => getUserSessions(userId).length > 0;

/**
 * Returns the socket ids for a user that are currently looking at the exact
 * conversation with `conversationPartnerId`.
 */
const getSessionsViewingConversation = (userId, conversationPartnerId) => {
  const partnerId = normalizeConversationId(conversationPartnerId);
  if (!partnerId) return [];

  return getUserSessions(userId)
    .filter(
      (session) =>
        session.visible !== false &&
        session.currentSection === 'chat' &&
        session.activeConversationId === partnerId,
    )
    .map((session) => session.socketId);
};

const isUserActivelyViewingConversation = (userId, conversationPartnerId) =>
  getSessionsViewingConversation(userId, conversationPartnerId).length > 0;

/**
 * Remove stale sessions. Returns the user ids that transitioned from online to
 * offline so callers can broadcast presence changes if they want to.
 */
const sweepStaleSessions = (now = Date.now()) => {
  const wentOffline = [];

  for (const [userId, sockets] of presenceByUser.entries()) {
    for (const [socketId, session] of sockets.entries()) {
      if (!isFresh(session, now)) sockets.delete(socketId);
    }
    if (!sockets.size) {
      presenceByUser.delete(userId);
      wentOffline.push(userId);
    }
  }

  return wentOffline;
};

const getPresenceSnapshot = (userId) => {
  const sessions = getUserSessions(userId);
  return {
    userId: normalizeUserId(userId),
    isOnline: sessions.length > 0,
    sessions: sessions.map((session) => ({
      socketId: session.socketId,
      role: session.role,
      deviceSessionId: session.deviceSessionId,
      currentSection: session.currentSection,
      activeConversationId: session.activeConversationId,
      visible: session.visible,
      lastSeen: new Date(session.lastSeen).toISOString(),
      lastHeartbeat: new Date(session.lastHeartbeat).toISOString(),
    })),
  };
};

module.exports = {
  SESSION_TTL_MS,
  registerSocket,
  setSocketPresence: updateSocketPresence,
  updateSocketPresence,
  heartbeat,
  removeSocket,
  clearSocketPresence: removeSocket,
  getSession,
  getUserSessions,
  isUserOnline,
  getSessionsViewingConversation,
  isUserActivelyViewingConversation,
  sweepStaleSessions,
  getPresenceSnapshot,
  normalizeSection,
  normalizeConversationId,
  normalizeDeviceSessionId,
};
