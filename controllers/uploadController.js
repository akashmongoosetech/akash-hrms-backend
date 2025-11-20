const upload = require('../middleware/upload');
const User = require('../models/User');

// Upload image for CKEditor
const uploadImage = (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // For CKEditor, return the URL that can be accessed
    let imageUrl = req.file.path;

    // If it's a local file (not Cloudinary), construct the full URL
    if (!imageUrl.startsWith('http')) {
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const apiUrl = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.replace('5173', '5000') : 'http://localhost:5000';
      imageUrl = `${apiUrl}/api/uploads/${imageUrl}`;
    }

    res.json({ url: imageUrl });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Upload profile picture
const uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const userId = req.params.userId || req.user._id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check permissions: only own profile or admin
    if (req.user._id.toString() !== userId && !['Admin', 'SuperAdmin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
    }

    // Use Cloudinary URL
    const imageUrl = req.file.path;

    // Add to profilePictures array
    user.profilePictures.push(imageUrl);
    await user.save();

    res.json({ message: 'Profile picture uploaded successfully', url: imageUrl });
  } catch (error) {
    console.error('Error uploading profile picture:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get gallery pictures for user
const getGalleryPictures = async (req, res) => {
  try {
    const userId = req.params.userId || req.user._id;
    const user = await User.findById(userId).select('profilePictures firstName lastName photo');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check permissions: only own gallery or admin
    if (req.user._id.toString() !== userId && !['Admin', 'SuperAdmin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
    }

    res.json({
      user: { _id: user._id, firstName: user.firstName, lastName: user.lastName, photo: user.photo },
      pictures: user.profilePictures
    });
  } catch (error) {
    console.error('Error getting gallery pictures:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get all users' gallery pictures (for admins)
const getAllGalleryPictures = async (req, res) => {
  try {
    const users = await User.find({ status: 'Active' })
      .select('profilePictures firstName lastName _id photo')
      .sort({ createdAt: -1 });

    const gallery = users.map(user => ({
      user: { _id: user._id, firstName: user.firstName, lastName: user.lastName, photo: user.photo },
      pictures: user.profilePictures
    }));

    res.json({ gallery });
  } catch (error) {
    console.error('Error getting all gallery pictures:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Delete profile picture
const deleteProfilePicture = async (req, res) => {
  try {
    const { userId, pictureUrl } = req.params;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check permissions: only own profile or admin
    if (req.user._id.toString() !== userId && !['Admin', 'SuperAdmin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
    }

    // Remove from array
    user.profilePictures = user.profilePictures.filter(pic => pic !== pictureUrl);
    await user.save();

    res.json({ message: 'Profile picture deleted successfully' });
  } catch (error) {
    console.error('Error deleting profile picture:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  uploadImage,
  uploadProfilePicture,
  getGalleryPictures,
  getAllGalleryPictures,
  deleteProfilePicture
};