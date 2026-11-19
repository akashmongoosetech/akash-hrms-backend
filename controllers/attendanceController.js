const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const PunchTime = require('../models/PunchTime');
const User = require('../models/User');
const attendanceUpload = require('../middleware/attendanceUpload');

const ACCURACY_THRESHOLD = Number(
  process.env.PUNCH_IN_ACCURACY_THRESHOLD || process.env.ATTENDANCE_ACCURACY_THRESHOLD || 250
);
const MAX_TEXT_LENGTH = 500;
const PRIVILEGED_ROLES = ['HR', 'Manager', 'Admin', 'SuperAdmin'];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const pad = (n) => String(n).padStart(2, '0');

/** Start-of-day / end-of-day / YYYY-MM-DD for the server's local timezone. */
const getDayInfo = (input = new Date()) => {
  const start = new Date(input);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const dateKey = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  return { start, end, dateKey };
};

const cleanText = (value, max = MAX_TEXT_LENGTH) => {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, max);
};

const formatHours = (minutes) => {
  if (minutes === null || minutes === undefined) return null;
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${pad(h)}:${pad(m)}`;
};

const isPrivileged = (user) => !!user && PRIVILEGED_ROLES.includes(user.role);

const parseCoordinate = (value, field, min, max) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || num > max) {
    throw new HttpError(400, `Invalid ${field}. Expected a number between ${min} and ${max}.`);
  }
  return num;
};

const parseLocation = (body = {}, extra = {}) => {
  const latitude = parseCoordinate(body.latitude, 'latitude', -90, 90);
  const longitude = parseCoordinate(body.longitude, 'longitude', -180, 180);

  const accuracy = Number(body.accuracy);
  if (!Number.isFinite(accuracy) || accuracy < 0) {
    throw new HttpError(400, 'Invalid GPS accuracy value.');
  }
  if (accuracy > ACCURACY_THRESHOLD) {
    throw new HttpError(
      400,
      `GPS accuracy too low (${accuracy.toFixed(1)}m). Required within ${ACCURACY_THRESHOLD}m. Please move to an open area and retry.`
    );
  }

  let capturedAt = new Date();
  if (body.timestamp) {
    const parsed = new Date(body.timestamp);
    if (!Number.isNaN(parsed.getTime())) capturedAt = parsed;
  }

  return {
    latitude,
    longitude,
    accuracy,
    address: cleanText(extra.address ?? body.address),
    city: cleanText(extra.city ?? body.city, 120),
    state: cleanText(extra.state ?? body.state, 120),
    area: cleanText(extra.area ?? body.area, 160),
    postalCode: cleanText(extra.postalCode ?? body.postalCode, 24),
    capturedAt,
  };
};

const parseDeviceInfo = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

/** Sniff the first bytes of a local upload so a renamed .exe cannot pass as a JPEG. */
const isRealImage = (filePath) => {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(12);
    const read = fs.readSync(fd, buffer, 0, 12, 0);
    fs.closeSync(fd);
    if (read < 4) return false;

    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isPng =
      read >= 8 &&
      buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const isWebp =
      read >= 12 &&
      buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
      buffer.slice(8, 12).toString('ascii') === 'WEBP';

    return isJpeg || isPng || isWebp;
  } catch {
    return false;
  }
};

const storedRef = (file) => {
  if (!file) return null;
  if (typeof file.path === 'string' && /^https?:\/\//i.test(file.path)) return file.path;
  return file.filename || path.basename(file.path || '');
};

const removeLocalFile = (file) => {
  if (!file || !file.path || /^https?:\/\//i.test(file.path)) return;
  try {
    fs.unlinkSync(file.path);
  } catch {
    /* already gone */
  }
};

const validateUploadedSelfie = (file) => {
  if (!file) {
    throw new HttpError(400, 'A live selfie captured from the camera is required.');
  }
  if (file.path && !/^https?:\/\//i.test(file.path) && !isRealImage(file.path)) {
    removeLocalFile(file);
    throw new HttpError(400, 'The uploaded selfie is not a valid image.');
  }
  if (file.size && file.size > attendanceUpload.MAX_SELFIE_SIZE) {
    removeLocalFile(file);
    throw new HttpError(413, 'Selfie image is too large (maximum 5 MB).');
  }
  return storedRef(file);
};

const serialize = (record) => {
  if (!record) return null;

  const plain = typeof record.toObject === 'function' ? record.toObject() : record;
  const employee = plain.employeeId;

  const totalMinutes =
    plain.totalWorkingMinutes !== undefined && plain.totalWorkingMinutes !== null
      ? plain.totalWorkingMinutes
      : plain.punchOutTime && plain.punchInTime
        ? Math.max(0, Math.round((new Date(plain.punchOutTime) - new Date(plain.punchInTime)) / 60000))
        : null;

  const employeeSummary =
    employee && employee.firstName
      ? {
          _id: employee._id,
          id: employee._id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          email: employee.email,
          photo: employee.photo || null,
        }
      : undefined;

  return {
    id: plain._id,
    employeeId: employee && employee._id ? employee._id : employee,
    employee: employeeSummary,
    date: plain.date || plain.punchInTime,
    dateKey: plain.dateKey || null,
    status: plain.status || (plain.punchOutTime ? 'punched-out' : 'punched-in'),
    punchInTime: plain.punchInTime,
    punchOutTime: plain.punchOutTime || null,
    totalWorkingMinutes: totalMinutes,
    totalWorkingHours: formatHours(totalMinutes),
    punchIn: {
      time: plain.punchInTime,
      location: plain.punchInLocation || null,
      hasSelfie: !!plain.punchInSelfie,
    },
    punchOut: plain.punchOutTime
      ? {
          time: plain.punchOutTime,
          location: plain.punchOutLocation || null,
          hasSelfie: !!plain.punchOutSelfie,
        }
      : null,
    verificationStatus: plain.verificationStatus,
    autoPunchOut: !!plain.autoPunchOut,
    deviceInfo: plain.deviceInfo || {},
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };
};

const emit = (req, event, payload) => {
  try {
    const io = req.app && req.app.get('io');
    if (io) io.emit(event, payload);
  } catch {
    /* sockets are best-effort */
  }
};

/** Keep the legacy PunchTime collection in sync so older screens/reports work. */
const syncLegacyPunchIn = async (employeeId, punchInTime) => {
  try {
    const start = new Date(punchInTime);
    start.setHours(0, 0, 0, 0);
    const active = await PunchTime.findOne({
      employee: employeeId,
      punchOutTime: null,
      punchInTime: { $gte: start },
    });
    if (active) return;
    await PunchTime.create({ employee: employeeId, punchInTime });
  } catch (err) {
    console.error('Legacy punch-in sync failed:', err.message);
  }
};

const syncLegacyPunchOut = async (employeeId, punchOutTime) => {
  try {
    const start = new Date(punchOutTime);
    start.setHours(0, 0, 0, 0);
    const active = await PunchTime.findOne({
      employee: employeeId,
      punchOutTime: null,
      punchInTime: { $gte: start },
    }).sort({ punchInTime: -1 });
    if (!active) return;
    active.punchOutTime = punchOutTime;
    active.totalDuration = Math.max(0, new Date(punchOutTime) - new Date(active.punchInTime));
    await active.save();
  } catch (err) {
    console.error('Legacy punch-out sync failed:', err.message);
  }
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------------------------------------------------------------------------
// POST /api/attendance/punch-in
// ---------------------------------------------------------------------------
const punchIn = async (req, res, next) => {
  try {
    const employeeId = req.user._id;
    const now = new Date();
    const { start, end, dateKey } = getDayInfo(now);

    // Match both the new dateKey and any legacy record created today that
    // predates dateKey so a single session per workday is always enforced.
    const existing = await Attendance.findOne({
      employeeId,
      $or: [{ dateKey }, { punchInTime: { $gte: start, $lt: end } }],
    }).sort({ punchInTime: -1 });
    if (existing) {
      removeLocalFile(req.file);
      if (existing.status === 'punched-in') {
        throw new HttpError(409, 'You already have an active punch-in for today.');
      }
      throw new HttpError(409, 'Your attendance for today is already completed.');
    }

    const location = parseLocation(req.body);
    const selfieRef = validateUploadedSelfie(req.file);

    let attendance;
    try {
      attendance = await Attendance.create({
        employeeId,
        date: start,
        dateKey,
        punchInTime: now,
        punchInSelfie: selfieRef,
        punchInLocation: location,
        status: 'punched-in',
        verificationStatus: 'pending',
        deviceInfo: parseDeviceInfo(req.body.deviceInfo),
      });
    } catch (err) {
      removeLocalFile(req.file);
      if (err && err.code === 11000) {
        throw new HttpError(409, 'An attendance session already exists for today.');
      }
      throw err;
    }

    await syncLegacyPunchIn(employeeId, now);

    const populated = await Attendance.findById(attendance._id).populate(
      'employeeId',
      'firstName lastName email photo'
    );

    const serialized = serialize(populated);

    emit(req, 'punch-in', {
      attendance: serialized,
      employee: serialized.employee,
      punchTime: {
        _id: serialized.id,
        employee: serialized.employee,
        punchInTime: serialized.punchInTime,
        punchOutTime: serialized.punchOutTime,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Punched in successfully.',
      attendance: serialized,
    });
  } catch (err) {
    removeLocalFile(req.file);
    return next(err);
  }
};

// ---------------------------------------------------------------------------
// POST /api/attendance/punch-out
// ---------------------------------------------------------------------------
const punchOut = async (req, res, next) => {
  try {
    const employeeId = req.user._id;
    const now = new Date();
    const { start, end, dateKey } = getDayInfo(now);

    const record = await Attendance.findOne({
      employeeId,
      $or: [{ dateKey }, { punchInTime: { $gte: start, $lt: end } }],
    }).sort({ punchInTime: -1 });

    if (!record) {
      removeLocalFile(req.file);
      throw new HttpError(400, 'You have not punched in yet today.');
    }
    if (record.status === 'punched-out') {
      removeLocalFile(req.file);
      throw new HttpError(409, 'You have already punched out for today.');
    }

    const location = parseLocation(req.body);
    const selfieRef = validateUploadedSelfie(req.file);

    const totalWorkingMinutes = Math.max(
      0,
      Math.round((now.getTime() - new Date(record.punchInTime).getTime()) / 60000)
    );

    // Conditional update makes duplicate/concurrent punch-outs safe: only the
    // first request can transition the session from punched-in to punched-out.
    const updated = await Attendance.findOneAndUpdate(
      { _id: record._id, status: 'punched-in' },
      {
        $set: {
          punchOutTime: now,
          punchOutSelfie: selfieRef,
          punchOutLocation: location,
          totalWorkingMinutes,
          status: 'punched-out',
          autoPunchOut: false,
        },
      },
      { new: true, runValidators: true }
    );

    if (!updated) {
      removeLocalFile(req.file);
      throw new HttpError(409, 'You have already punched out for today.');
    }

    await syncLegacyPunchOut(employeeId, now);

    const populated = await Attendance.findById(updated._id).populate(
      'employeeId',
      'firstName lastName email photo'
    );

    const serialized = serialize(populated);

    emit(req, 'punch-out', {
      attendance: serialized,
      employee: serialized.employee,
      punchTime: {
        _id: serialized.id,
        employee: serialized.employee,
        punchInTime: serialized.punchInTime,
        punchOutTime: serialized.punchOutTime,
        totalDuration: serialized.totalWorkingMinutes
          ? serialized.totalWorkingMinutes * 60000
          : null,
      },
    });

    return res.json({
      success: true,
      message: 'Punched out successfully.',
      attendance: serialized,
    });
  } catch (err) {
    removeLocalFile(req.file);
    return next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /api/attendance/today
// ---------------------------------------------------------------------------
const getToday = async (req, res, next) => {
  try {
    const employeeId = req.user._id;
    const { start, end, dateKey } = getDayInfo();

    const record = await Attendance.findOne({
      employeeId,
      $or: [{ dateKey }, { punchInTime: { $gte: start, $lt: end } }],
    }).sort({ punchInTime: -1 });

    const attendance = serialize(record);
    return res.json({
      success: true,
      status: attendance ? attendance.status : 'not-punched-in',
      attendance,
    });
  } catch (err) {
    return next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /api/attendance/history
// ---------------------------------------------------------------------------
const getHistory = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const query = {};
    const privileged = isPrivileged(req.user);

    if (!privileged) {
      query.employeeId = req.user._id;
    } else if (req.query.employeeId && mongoose.Types.ObjectId.isValid(req.query.employeeId)) {
      query.employeeId = req.query.employeeId;
    }

    if (req.query.status && ['punched-in', 'punched-out'].includes(req.query.status)) {
      query.status = req.query.status;
    }

    if (req.query.fromDate || req.query.toDate) {
      query.punchInTime = {};
      if (req.query.fromDate) {
        const from = new Date(req.query.fromDate);
        if (!Number.isNaN(from.getTime())) {
          from.setHours(0, 0, 0, 0);
          query.punchInTime.$gte = from;
        }
      }
      if (req.query.toDate) {
        const to = new Date(req.query.toDate);
        if (!Number.isNaN(to.getTime())) {
          to.setHours(23, 59, 59, 999);
          query.punchInTime.$lte = to;
        }
      }
      if (!Object.keys(query.punchInTime).length) delete query.punchInTime;
    }

    if (privileged && req.query.search) {
      const rx = new RegExp(escapeRegex(String(req.query.search).slice(0, 60)), 'i');
      const matchedUsers = await User.find(
        { $or: [{ firstName: rx }, { lastName: rx }, { email: rx }] },
        '_id'
      ).limit(100);
      const ids = matchedUsers.map((u) => u._id);
      if (query.employeeId) {
        query.$and = [{ employeeId: query.employeeId }, { employeeId: { $in: ids } }];
        delete query.employeeId;
      } else {
        query.employeeId = { $in: ids };
      }
    }

    const [total, records] = await Promise.all([
      Attendance.countDocuments(query),
      Attendance.find(query)
        .populate('employeeId', 'firstName lastName email photo')
        .sort({ punchInTime: -1 })
        .skip(skip)
        .limit(limit),
    ]);

    return res.json({
      success: true,
      records: records.map(serialize),
      pagination: {
        currentPage: page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        totalItems: total,
        itemsPerPage: limit,
      },
    });
  } catch (err) {
    return next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /api/attendance/my-attendance (legacy alias used by older builds)
// ---------------------------------------------------------------------------
const getMyAttendance = async (req, res, next) => {
  try {
    const records = await Attendance.find({ employeeId: req.user._id })
      .sort({ punchInTime: -1 })
      .limit(30);
    return res.json({ success: true, attendanceRecords: records.map(serialize) });
  } catch (err) {
    return next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /api/attendance/current-location (legacy alias)
// ---------------------------------------------------------------------------
const getCurrentLocation = async (req, res, next) => {
  try {
    const latest = await Attendance.findOne({ employeeId: req.user._id })
      .sort({ punchInTime: -1 })
      .select('punchInLocation status punchInTime punchOutTime');

    if (!latest) {
      return res.json({ success: true, hasLocation: false });
    }

    return res.json({
      success: true,
      hasLocation: !!latest.punchInLocation,
      punchInLocation: latest.punchInLocation || null,
      status: latest.status,
      punchInTime: latest.punchInTime,
      punchOutTime: latest.punchOutTime || null,
    });
  } catch (err) {
    return next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /api/attendance/:id
// ---------------------------------------------------------------------------
const getById = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw new HttpError(400, 'Invalid attendance id.');
    }

    const record = await Attendance.findById(req.params.id).populate(
      'employeeId',
      'firstName lastName email photo'
    );
    if (!record) throw new HttpError(404, 'Attendance record not found.');

    const ownerId = String(record.employeeId && record.employeeId._id ? record.employeeId._id : record.employeeId);
    if (ownerId !== String(req.user._id) && !isPrivileged(req.user)) {
      throw new HttpError(403, 'You do not have access to this attendance record.');
    }

    return res.json({ success: true, attendance: serialize(record) });
  } catch (err) {
    return next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /api/attendance/:id/selfie/:type  (type = in | out)
// Streams the image only to the owner or a privileged reviewer, so raw storage
// references are never exposed to the client.
// ---------------------------------------------------------------------------
const getSelfie = async (req, res, next) => {
  try {
    const { id, type } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new HttpError(400, 'Invalid attendance id.');
    }
    if (!['in', 'out'].includes(type)) {
      throw new HttpError(400, 'Invalid selfie type.');
    }

    const record = await Attendance.findById(id).select(
      'employeeId punchInSelfie punchOutSelfie'
    );
    if (!record) throw new HttpError(404, 'Attendance record not found.');

    const ownerId = String(record.employeeId);
    if (ownerId !== String(req.user._id) && !isPrivileged(req.user)) {
      throw new HttpError(403, 'You do not have access to this selfie.');
    }

    const ref = type === 'in' ? record.punchInSelfie : record.punchOutSelfie;
    if (!ref) throw new HttpError(404, 'Selfie not found for this record.');

    if (/^https?:\/\//i.test(ref)) {
      return res.redirect(ref);
    }

    const safeName = path.basename(ref);
    const absolute = path.join(attendanceUpload.UPLOAD_DIR, safeName);
    if (!fs.existsSync(absolute)) {
      throw new HttpError(404, 'Selfie file is no longer available.');
    }

    res.set('Cache-Control', 'private, max-age=300');
    return res.sendFile(absolute);
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  punchIn,
  punchOut,
  getToday,
  getHistory,
  getMyAttendance,
  getCurrentLocation,
  getById,
  getSelfie,
  ACCURACY_THRESHOLD,
};
