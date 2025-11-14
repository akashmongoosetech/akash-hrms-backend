const Link = require('../models/Link');

const getLinks = async (req, res) => {
  try {
    const { type, page = 1, limit = 10 } = req.query;
    let query = {};
    if (type) {
      query.type = type;
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const totalItems = await Link.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limitNum);

    const links = await Link.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    res.json({
      links,
      totalPages,
      totalItems,
      currentPage: pageNum
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getLinkById = async (req, res) => {
  try {
    const link = await Link.findById(req.params.id);
    if (!link) return res.status(404).json({ message: 'Link not found' });
    res.json(link);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const createLink = async (req, res) => {
  try {
    const { type, title, url, image } = req.body;
    const file = req.file ? req.file.path : null;

    if (!type || !title) {
      return res.status(400).json({ message: 'Type and title are required' });
    }

    if (type === 'git' && !url) {
      return res.status(400).json({ message: 'URL is required for Git links' });
    }

    if ((type === 'excel' || type === 'codebase') && !url && !image && !file) {
      return res.status(400).json({ message: 'Either URL, Image, or File is required for Excel/Codebase links' });
    }

    const linkData = { type, title, url, image, file };
    const link = new Link(linkData);
    await link.save();

    res.status(201).json({ message: 'Link created successfully', link });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const updateLink = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, title, url, image } = req.body;
    const file = req.file ? req.file.path : undefined;

    const updates = { type, title, url, image };
    if (file !== undefined) {
      updates.file = file;
    }

    const link = await Link.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    if (!link) return res.status(404).json({ message: 'Link not found' });

    res.json({ message: 'Link updated successfully', link });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const deleteLink = async (req, res) => {
  try {
    const { id } = req.params;

    const link = await Link.findByIdAndDelete(id);
    if (!link) return res.status(404).json({ message: 'Link not found' });

    res.json({ message: 'Link deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getLinks, getLinkById, createLink, updateLink, deleteLink };