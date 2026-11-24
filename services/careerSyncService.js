const Candidate = require('../models/Candidate');
const CareerSyncLock = require('../models/CareerSyncLock');

const CAREER_API_URL = process.env.CAREER_SOURCE_API_URL;
const CAREER_SYNC_API_KEY = process.env.CAREER_SYNC_API_KEY;
const SYNC_LOCK_TTL_MS = 10 * 60 * 1000;

/**
 * Structured sync error carrying HTTP status code, stage, and endpoint info.
 * Never includes stack traces or sensitive data.
 */
class SyncError extends Error {
  constructor(message, { statusCode = 500, stage, endpoint } = {}) {
    super(message);
    this.name = 'SyncError';
    this.statusCode = statusCode;
    this.stage = stage || 'unknown';
    this.endpoint = endpoint || null;
  }
}

/**
 * Fetch career records from the main API with timeout and retry handling.
 * @param {number} retries - Number of retry attempts
 * @param {number} timeoutMs - Request timeout in milliseconds
 * @returns {Promise<Array>} Array of career records
 */
async function fetchCareerData(retries = 3, timeoutMs = 30000) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const headers = {
        'Content-Type': 'application/json',
        ...(CAREER_SYNC_API_KEY ? { 'X-Career-Sync-Api-Key': CAREER_SYNC_API_KEY } : {}),
      };

      const response = await fetch(CAREER_API_URL, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 401 || response.status === 403) {
        throw new SyncError('Career source API authentication failed', {
          statusCode: 401,
          stage: 'auth',
          endpoint: CAREER_API_URL,
          upstreamStatus: response.status,
        });
      }

      if (!response.ok) {
        throw new SyncError(`External career API returned status ${response.status}`, {
          statusCode: response.status,
          stage: 'fetch',
          endpoint: CAREER_API_URL,
        });
      }

      const data = await response.json();

      const records = data.data || data || [];

      if (!Array.isArray(records)) {
        throw new SyncError('External career API response data is not an array', {
          statusCode: 502,
          stage: 'validate',
          endpoint: CAREER_API_URL,
        });
      }

      return records;
    } catch (err) {
      if (err instanceof SyncError) {
        throw err;
      }

      lastError = err;
      console.error(`Career sync fetch attempt ${attempt} failed:`, err.message);

      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  throw new SyncError(`External career API unreachable after ${retries} attempts: ${lastError && lastError.message}`, {
    statusCode: 502,
    stage: 'fetch',
    endpoint: CAREER_API_URL,
  });
}

/**
 * Extract the stable external identifier from a source career record.
 * The source API's MongoDB _id is used as the durable external reference.
 * @param {Object} record - Source career record
 * @returns {String|null} The external career ID
 */
function getExternalId(record) {
  return record._id || record.id || record.externalCareerId || null;
}

/**
 * Fields owned by the source career API. Only these are synchronized.
 * Candidate-specific fields (isDeleted, etc.) are intentionally excluded
 * and preserved during updates.
 */
const SOURCE_MAPPED_FIELDS = [
  'name', 'email', 'phone', 'position', 'currentCompany', 'experience',
  'expectedSalary', 'noticePeriod', 'coverLetter', 'resume', 'status',
];

/**
 * Build a Candidate document payload from a source career record.
 * Only source-mapped fields are included.
 * @param {Object} record - Source career record
 * @param {String} externalId - The source career ID
 * @returns {Object} Mapped Candidate fields
 */
function mapSourceToCandidate(record, externalId) {
  const mapped = {
    externalCareerId: String(externalId),
    syncedAt: new Date(),
  };

  for (const field of SOURCE_MAPPED_FIELDS) {
    if (record[field] !== undefined) {
      mapped[field] = record[field];
    }
  }

  return mapped;
}

/**
 * Compare source-mapped fields between an existing Candidate and an incoming
 * source record to determine if an update is needed.
 * @param {Object} existing - Existing Candidate document
 * @param {Object} incoming - Source career record
 * @returns {Boolean} True if any source-mapped field differs
 */
function hasSourceFieldChanged(existing, incoming) {
  for (const field of SOURCE_MAPPED_FIELDS) {
    const existingVal = existing[field] || '';
    const incomingVal = incoming[field] || '';
    if (String(existingVal).trim() !== String(incomingVal).trim()) {
      return true;
    }
  }
  return false;
}

/**
 * Acquire a distributed sync lock using MongoDB.
 * Expired locks are cleaned up before attempting acquisition.
 * @param {ObjectId} userId - The user triggering the sync
 * @returns {Promise<boolean>} true if lock acquired
 */
async function acquireLock(userId) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - SYNC_LOCK_TTL_MS);

  await CareerSyncLock.deleteMany({ lockedAt: { $lt: cutoff } });

  const existingLock = await CareerSyncLock.findOne({});
  if (existingLock) {
    throw new Error('A synchronization is already in progress. Please wait.');
  }

  await CareerSyncLock.create({
    lockedAt: now,
    lockedBy: userId || null,
  });

  return true;
}

/**
 * Release the distributed sync lock.
 */
async function releaseLock() {
  await CareerSyncLock.deleteMany({});
}

/**
 * One-way, non-destructive synchronization of career data from the main API
 * into the HRMS Candidates collection.
 *
 * Rules:
 *  - New source career  -> INSERT into Candidates
 *  - Updated source career -> UPDATE the same Candidate document (preserve _id and non-source fields)
 *  - Unchanged source career -> DO NOTHING
 *  - Deleted source career -> KEEP existing Candidate untouched (no deletion sync)
 *
 * @param {Object} user - The user triggering the sync (for audit trail)
 * @returns {Promise<Object>} Sync summary with counts and affected titles
 */
async function syncCareerData(user) {
  let lockAcquired = false;

  try {
    await acquireLock(user ? user._id : null);
    lockAcquired = true;

    const apiRecords = await fetchCareerData();

    // Load existing candidates keyed by externalCareerId for lookups.
    const existingRecords = await Candidate.find({}).lean();
    const existingMap = new Map();
    existingRecords.forEach((rec) => {
      if (rec.externalCareerId) {
        existingMap.set(String(rec.externalCareerId), rec);
      }
    });

    const newRecords = [];
    const updatedRecords = [];
    const unchangedIds = new Set();
    const incomingIds = new Set();

    // Classify each source record.
    for (const apiRecord of apiRecords) {
      const externalId = getExternalId(apiRecord);
      if (!externalId) {
        continue;
      }

      const externalIdStr = String(externalId);
      incomingIds.add(externalIdStr);

      const existing = existingMap.get(externalIdStr);

      if (!existing) {
        newRecords.push(apiRecord);
      } else if (hasSourceFieldChanged(existing, apiRecord)) {
        updatedRecords.push({ existing, incoming: apiRecord });
      } else {
        unchangedIds.add(externalIdStr);
      }
    }

    // NO deletion sync: records no longer in the source API are left untouched.

    const insertedTitles = [];
    const updatedTitles = [];
    let insertedCount = 0;

    // Insert new candidates.
    for (const record of newRecords) {
      const externalId = getExternalId(record);
      const mapped = mapSourceToCandidate(record, externalId);

      try {
        const created = await Candidate.create(mapped);
        if (created && created._id) {
          insertedCount += 1;
          insertedTitles.push(record.position || record.name || 'Untitled');
        } else {
          throw new Error('Insert returned no document');
        }
      } catch (err) {
        // Duplicate-key race: another sync may have inserted it. Treat as unchanged.
        if (err && err.code === 11000) {
          unchangedIds.add(String(externalId));
        } else {
          throw err;
        }
      }
    }

    // Update changed candidates (only source-mapped fields).
    for (const { existing, incoming } of updatedRecords) {
      const externalId = String(existing.externalCareerId);
      const mappedUpdates = mapSourceToCandidate(incoming, externalId);
      // Remove externalCareerId from updates (immutable identifier).
      delete mappedUpdates.externalCareerId;
      delete mappedUpdates.syncedAt;

      try {
        const updated = await Candidate.findOneAndUpdate(
          { externalCareerId: externalId },
          { $set: mappedUpdates },
          { new: true, runValidators: true }
        );
        if (updated) {
          updatedTitles.push(incoming.position || incoming.name || 'Untitled');
        } else {
          throw new Error('Update returned no document');
        }
      } catch (err) {
        throw err;
      }
    }

    const summary = {
      totalFetched: apiRecords.length,
      new: insertedCount,
      updated: updatedTitles.length,
      unchanged: unchangedIds.size,
      deleted: 0, // Deletion synchronization is intentionally disabled.
      status: 'Success',
      newCareers: insertedTitles.map((title) => ({ title })),
      updatedCareers: updatedTitles.map((title) => ({ title })),
    };

    return summary;
  } catch (error) {
    throw error;
  } finally {
    if (lockAcquired) {
      await releaseLock();
    }
  }
}

module.exports = {
  syncCareerData,
  fetchCareerData,
  hasSourceFieldChanged,
  acquireLock,
  releaseLock,
};
