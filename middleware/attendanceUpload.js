const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Selfie uploads are deliberately kept separate from the generic upload
// middleware: they are smaller, images-only, and are validated again by the
// controller (magic-byte sniffing) before an attendance record is written.
// Selfies are kept outside the publicly served `uploads` directory and are only
// reachable through the authenticated /api/attendance/:id/selfie/:type endpoint.
const UPLOAD_DIR = path.join(__dirname, '../attendance-uploads');
const MAX_SELFIE_SIZE = 5 * 1024 * 1024; // 5 MB

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const employee = req.user && req.user._id ? String(req.user._id) : 'unknown';
    const kind = String(req.originalUrl || '').includes('out') ? 'out' : 'in';
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
    cb(null, `selfie-${kind}-${employee}-${unique}${safeExt}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_IMAGE_TYPES.has(String(file.mimetype).toLowerCase())) {
    return cb(null, true);
  }
  return cb(new Error(`Unsupported file type: ${file.mimetype}`));
};

const attendanceUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SELFIE_SIZE, files: 1 },
});

attendanceUpload.MAX_SELFIE_SIZE = MAX_SELFIE_SIZE;
attendanceUpload.UPLOAD_DIR = UPLOAD_DIR;

module.exports = attendanceUpload;
