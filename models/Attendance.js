const mongoose = require('mongoose');

/**
 * A single location capture (either punch-in or punch-out).
 * Coordinates are the raw device-reported values; `accuracy` is the radius in
 * metres reported by the Geolocation API and is stored so reviewers can judge
 * how trustworthy the fix was.
 */
const attendanceLocationSchema = new mongoose.Schema(
  {
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
    accuracy: { type: Number, required: true, min: 0 },
    address: { type: String, maxlength: 500 },
    city: { type: String, maxlength: 120 },
    state: { type: String, maxlength: 120 },
    area: { type: String, maxlength: 160 },
    postalCode: { type: String, maxlength: 24 },
    capturedAt: { type: Date },
  },
  { _id: false }
);

const attendanceSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Start of the workday (local server time). Used for reporting + queries.
    date: {
      type: Date,
      required: true,
    },

    // Local calendar day as YYYY-MM-DD. Drives the "one attendance session per
    // employee per workday" guarantee through a partial unique index.
    dateKey: {
      type: String,
    },

    // --- Punch In (kept backwards compatible with the original model) ---
    punchInTime: {
      type: Date,
      required: true,
    },
    punchInSelfie: {
      type: String,
      // Stored filename (local disk) or absolute URL (Cloudinary).
    },
    punchInLocation: {
      type: attendanceLocationSchema,
    },

    // --- Punch Out ---
    punchOutTime: {
      type: Date,
    },
    punchOutSelfie: {
      type: String,
    },
    punchOutLocation: {
      type: attendanceLocationSchema,
    },

    totalWorkingMinutes: {
      type: Number,
      min: 0,
    },

    status: {
      type: String,
      enum: ['punched-in', 'punched-out'],
      default: 'punched-in',
      required: true,
    },

    // True when the session was closed automatically by the midnight cron job.
    autoPunchOut: {
      type: Boolean,
      default: false,
    },

    deviceInfo: {
      type: Object,
      default: {},
    },

    verificationStatus: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

// Fast employee timeline queries.
attendanceSchema.index({ employeeId: 1, punchInTime: -1 });

// Enforce a single attendance session per employee per workday. Partial so that
// legacy documents created before `dateKey` existed are ignored during index
// creation (they can never satisfy the filter). The key order intentionally
// differs from any older `employeeId + dateKey` index so MongoDB does not report
// an options conflict when this unique index is added to an existing database.
attendanceSchema.index(
  { dateKey: 1, employeeId: 1 },
  { unique: true, partialFilterExpression: { dateKey: { $type: 'string' } } }
);

module.exports = mongoose.model('Attendance', attendanceSchema);
