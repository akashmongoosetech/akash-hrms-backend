const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: [
      'event_created', 'event_updated', 'event_deleted',
      'todo_assigned', 'todo_created', 'todo_updated', 'todo_deleted',
      'ticket_assigned', 'ticket_created', 'ticket_updated', 'ticket_deleted',
      'holiday_added', 'holiday_created', 'holiday_updated', 'holiday_deleted',
      'team_created', 'team_manager_assigned', 'team_member_added',
      'employee_profile_updated',
      'leave_applied', 'leave_approved', 'leave_rejected', 'leave_status_updated',
      'project_created', 'project_updated', 'project_deleted',
      'ticket_progress_updated',
      'course_created', 'course_updated', 'course_deleted',
      'quiz_assigned', 'quiz_updated', 'quiz_deleted',
      'chat_message',
      'blog_created', 'blog_updated', 'blog_deleted'
    ],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  // The user who performed the action (never the recipient for self-triggered
  // events, but kept for display and auditability).
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  actorName: {
    type: String
  },
  // Generic relation back to the entity that produced this notification.
  entityType: {
    type: String
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId
  },
  data: {
    type: mongoose.Schema.Types.Mixed
  },
  read: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  },
  // Optional idempotency key. Chat notifications use
  // `chat:<messageId>:<recipientId>` so a retried request (or a reconnect) can
  // never create a second record for the same message.
  dedupeKey: {
    type: String,
    unique: true,
    sparse: true
  }
}, { timestamps: true });

// Index for efficient queries
notificationSchema.index({ user: 1, read: 1, createdAt: -1 });
// Conversation-scoped lookups used when a chat is opened / marked read.
notificationSchema.index({ user: 1, type: 1, 'data.senderId': 1, read: 1 });

module.exports = mongoose.model('Notification', notificationSchema);