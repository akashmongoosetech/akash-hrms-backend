const Blog = require('../models/Blog');
const { notifyAllExceptActor } = require('./notificationController');

// Get all blogs with pagination
const getBlogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const totalBlogs = await Blog.countDocuments();
    const blogs = await Blog.find()
      .populate('author', 'firstName lastName email photo')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      blogs,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalBlogs / limit),
        totalItems: totalBlogs,
        itemsPerPage: limit
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get blog by slug
const getBlogBySlug = async (req, res) => {
  try {
    const blog = await Blog.findOne({ slug: req.params.slug })
      .populate('author', 'firstName lastName email photo');

    if (!blog) return res.status(404).json({ message: 'Blog not found' });

    res.json(blog);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create new blog
const createBlog = async (req, res) => {
  try {
    const { title, excerpt, content, sections, status, tags, author } = req.body;

    if (!title || !author) {
      return res.status(400).json({ message: 'Title and author are required' });
    }

    // Generate slug from title
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .trim(); // Trim whitespace

    // Parse sections if it's a string
    let parsedSections = sections;
    if (typeof sections === 'string') {
      parsedSections = JSON.parse(sections);
    }

    // Parse tags if it's a string
    let parsedTags = tags;
    if (typeof tags === 'string') {
      parsedTags = tags.split(',').map(tag => tag.trim()).filter(tag => tag);
    }

    const blogData = {
      title,
      slug,
      excerpt,
      content,
      sections: parsedSections || [],
      status: status || 'Draft',
      tags: parsedTags || [],
      author,
    };

    // Handle file uploads
    if (req.files) {
      if (req.files['featuredImage']) {
        blogData.featuredImage = req.files['featuredImage'][0].path;
      }

      // Handle section images - assuming they come as sectionImage0, sectionImage1, etc.
      if (parsedSections && Array.isArray(parsedSections)) {
        parsedSections.forEach((section, index) => {
          const sectionImageKey = `sectionImage${index}`;
          if (req.files[sectionImageKey]) {
            section.image = req.files[sectionImageKey][0].path;
          }
        });
      }
    }

    const blog = new Blog(blogData);
    await blog.save();

    // Notify all users except the actor only when the blog is actually
    // published. Draft creation is an internal authoring step.
    const actorName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'An administrator';
    if (blog.status === 'Published') {
      await notifyAllExceptActor({
        actor: req.user,
        type: 'blog_created',
        title: 'New Blog Published',
        message: `${actorName} has published a new blog: ${title}.`,
        data: {
          action: 'created',
          blogId: blog._id,
          blogTitle: blog.title,
          actorId: req.user._id,
          actorName,
          link: `/blogs/${blog.slug}`,
        },
        entityType: 'Blog',
        entityId: blog._id,
        io: req.app.get('io'),
        pushTitle: '📝 New Blog Published',
        pushUrl: `/blogs/${blog.slug}`,
      });
    }

    res.status(201).json({ message: 'Blog created successfully', blog });
  } catch (err) {
    console.error(err);
    if (err.code === 11000) { // Duplicate slug
      res.status(409).json({ message: 'Blog with this title already exists' });
    } else {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
};

// Update blog by slug
const updateBlog = async (req, res) => {
  try {
    const { slug } = req.params;
    const updates = req.body;

    // If title is being updated, regenerate slug
    if (updates.title) {
      updates.slug = updates.title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/-+/g, '-') // Replace multiple hyphens with single
        .trim(); // Trim whitespace
    }

    // Parse sections and tags if they are strings
    if (updates.sections && typeof updates.sections === 'string') {
      updates.sections = JSON.parse(updates.sections);
    }
    if (updates.tags && typeof updates.tags === 'string') {
      updates.tags = updates.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
    }

    // Handle file uploads
    if (req.files) {
      if (req.files['featuredImage']) {
        updates.featuredImage = req.files['featuredImage'][0].path;
      }

      // Handle section images
      if (updates.sections && Array.isArray(updates.sections)) {
        updates.sections.forEach((section, index) => {
          const sectionImageKey = `sectionImage${index}`;
          if (req.files[sectionImageKey]) {
            section.image = req.files[sectionImageKey][0].path;
          }
        });
      }
    }

    const previousBlog = await Blog.findOne({ slug }).select('status title slug');
    if (!previousBlog) return res.status(404).json({ message: 'Blog not found' });

    const blog = await Blog.findOneAndUpdate(
      { slug },
      updates,
      { new: true, runValidators: true }
    ).populate('author', 'firstName lastName email photo');

    if (!blog) return res.status(404).json({ message: 'Blog not found' });

    // Notify all users except the actor, but only for published content.
    // Draft edits, or edits to a blog that has never been published, stay
    // internal and must not produce company-wide notifications.
    const relevantStatusChange = blog.status === 'Published';
    const actorName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'An administrator';
    if (relevantStatusChange) {
      await notifyAllExceptActor({
        actor: req.user,
        type: 'blog_updated',
        title: 'Blog Updated',
        message: `${actorName} has updated the blog: ${blog.title}.`,
        data: {
          action: 'updated',
          blogId: blog._id,
          blogTitle: blog.title,
          actorId: req.user._id,
          actorName,
          link: `/blogs/${blog.slug}`,
        },
        entityType: 'Blog',
        entityId: blog._id,
        io: req.app.get('io'),
        pushTitle: '📝 Blog Updated',
        pushUrl: `/blogs/${blog.slug}`,
      });
    }

    res.json({ message: 'Blog updated successfully', blog });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Delete blog by slug
const deleteBlog = async (req, res) => {
  try {
    const { slug } = req.params;

    const blog = await Blog.findOneAndDelete({ slug });

    if (!blog) return res.status(404).json({ message: 'Blog not found' });

    // Notify all users except the actor, but only when a published blog is
    // removed. Deleting a draft is an internal authoring step.
    const actorName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'An administrator';
    if (blog.status === 'Published') {
      await notifyAllExceptActor({
        actor: req.user,
        type: 'blog_deleted',
        title: 'Blog Deleted',
        message: `${actorName} has deleted the blog: ${blog.title}.`,
        data: {
          action: 'deleted',
          blogId: blog._id,
          blogTitle: blog.title,
          actorId: req.user._id,
          actorName,
          link: '/blog',
        },
        entityType: 'Blog',
        entityId: blog._id,
        io: req.app.get('io'),
        pushTitle: '🗑️ Blog Removed',
        pushUrl: '/blog',
      });
    }

    res.json({ message: 'Blog deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getBlogs,
  getBlogBySlug,
  createBlog,
  updateBlog,
  deleteBlog
};