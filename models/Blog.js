const mongoose = require('mongoose');

const sectionSchema = new mongoose.Schema({
  heading: { type: String, required: true },
  content: { type: String, required: true },
  image: String, // File path for section image
});

const blogSchema = new mongoose.Schema({
  title: { type: String, required: true },
  excerpt: String,
  content: String,
  featuredImage: String, // File path for featured image
  sections: [sectionSchema],
  status: { type: String, enum: ['Published', 'Draft'], default: 'Draft' },
  tags: [String],
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  slug: { type: String, unique: true, required: true },
}, { timestamps: true });

// Pre-save hook to generate slug from title
blogSchema.pre('save', function(next) {
  if (this.isModified('title') || this.isNew) {
    // Generate slug from title: lowercase, replace spaces with hyphens, remove special chars
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .trim(); // Trim whitespace
  }
  next();
});

module.exports = mongoose.model('Blog', blogSchema);