const upload = require('../middleware/upload');

// Upload image for CKEditor
const uploadImage = (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Return the URL of the uploaded image
    const imageUrl = `${req.protocol}://${req.get('host')}/api/uploads/${req.file.filename}`;
    res.json({ url: imageUrl });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  uploadImage
};