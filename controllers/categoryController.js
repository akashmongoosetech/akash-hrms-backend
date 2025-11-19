const Category = require('../models/Category');

const getCategories = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = { status: 'Active' };

    const totalCategories = await Category.countDocuments(query);
    const categories = await Category.find(query)
      .populate('createdByDetails', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      categories,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCategories / limit),
        totalItems: totalCategories,
        itemsPerPage: limit
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getCategoryById = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id).populate('createdByDetails', 'firstName lastName email');
    if (!category) return res.status(404).json({ message: 'Category not found' });
    res.json(category);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const createCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Category name is required' });
    }

    const existingCategory = await Category.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (existingCategory) {
      return res.status(409).json({ message: 'Category with this name already exists' });
    }

    const category = new Category({
      name,
      description,
      createdBy: req.user._id
    });

    await category.save();
    await category.populate('createdByDetails', 'firstName lastName email');

    res.status(201).json({
      message: 'Category created successfully',
      category
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, status } = req.body;

    const category = await Category.findById(id);
    if (!category) return res.status(404).json({ message: 'Category not found' });

    // Check if another category with the same name exists
    if (name && name !== category.name) {
      const existingCategory = await Category.findOne({
        name: { $regex: new RegExp(`^${name}$`, 'i') },
        _id: { $ne: id }
      });
      if (existingCategory) {
        return res.status(409).json({ message: 'Category with this name already exists' });
      }
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      { name, description, status },
      { new: true, runValidators: true }
    ).populate('createdByDetails', 'firstName lastName email');

    res.json({
      message: 'Category updated successfully',
      category: updatedCategory
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await Category.findById(id);
    if (!category) return res.status(404).json({ message: 'Category not found' });

    // Check if category is being used by any courses
    const Course = require('../models/Course');
    const coursesUsingCategory = await Course.countDocuments({ category: id });

    if (coursesUsingCategory > 0) {
      return res.status(400).json({
        message: 'Cannot delete category. It is being used by courses.',
        coursesCount: coursesUsingCategory
      });
    }

    await Category.findByIdAndDelete(id);

    res.json({ message: 'Category deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory
};