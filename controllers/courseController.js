const Course = require('../models/Course');
const Category = require('../models/Category');
const User = require('../models/User');

const getCourses = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = {};

    // Filter by status if provided
    if (req.query.status) {
      query.status = req.query.status;
    }

    // Filter by category if provided
    if (req.query.category) {
      query.category = req.query.category;
    }

    // Filter by createdBy if provided
    if (req.query.createdBy) {
      query.createdBy = req.query.createdBy;
    }

    const totalCourses = await Course.countDocuments(query);
    const courses = await Course.find(query)
      .populate('categoryDetails', 'name')
      .populate('createdByDetails', 'firstName lastName email photo')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      courses,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCourses / limit),
        totalItems: totalCourses,
        itemsPerPage: limit
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getCourseById = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('categoryDetails', 'name description')
      .populate('createdByDetails', 'firstName lastName email photo')
      .populate('enrolledUsers', 'firstName lastName email');

    if (!course) return res.status(404).json({ message: 'Course not found' });
    res.json(course);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const createCourse = async (req, res) => {
  try {
    const { title, description, duration, status, category, createdBy } = req.body;

    if (!title || !description || !duration || !category || !createdBy) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Verify category exists
    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
      return res.status(400).json({ message: 'Invalid category' });
    }

    // Verify createdBy user exists
    const userExists = await User.findById(createdBy);
    if (!userExists) {
      return res.status(400).json({ message: 'Invalid user' });
    }

    const courseData = {
      title,
      description,
      duration,
      status: status || 'Draft',
      category,
      createdBy
    };

    // Handle file uploads
    if (req.files) {
      if (req.files['courseVideo']) {
        courseData.courseVideo = req.files['courseVideo'][0].path;
      }
      if (req.files['thumbnailImage']) {
        courseData.thumbnailImage = req.files['thumbnailImage'][0].path;
      }
    }

    const course = new Course(courseData);
    await course.save();

    // Populate the response
    await course.populate('categoryDetails', 'name');
    await course.populate('createdByDetails', 'firstName lastName email');

    res.status(201).json({
      message: 'Course created successfully',
      course
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const updateCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, duration, status, category, createdBy } = req.body;

    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    // Verify category exists if provided
    if (category) {
      const categoryExists = await Category.findById(category);
      if (!categoryExists) {
        return res.status(400).json({ message: 'Invalid category' });
      }
    }

    // Verify createdBy user exists if provided
    if (createdBy) {
      const userExists = await User.findById(createdBy);
      if (!userExists) {
        return res.status(400).json({ message: 'Invalid user' });
      }
    }

    const updateData = {
      title,
      description,
      duration,
      status,
      category,
      createdBy
    };

    // Handle file uploads
    if (req.files) {
      if (req.files['courseVideo']) {
        updateData.courseVideo = req.files['courseVideo'][0].path;
      }
      if (req.files['thumbnailImage']) {
        updateData.thumbnailImage = req.files['thumbnailImage'][0].path;
      }
    }

    const updatedCourse = await Course.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('categoryDetails', 'name')
      .populate('createdByDetails', 'firstName lastName email');

    res.json({
      message: 'Course updated successfully',
      course: updatedCourse
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;

    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    await Course.findByIdAndDelete(id);

    res.json({ message: 'Course deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const enrollInCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    // Check if user is already enrolled
    if (course.enrolledUsers.includes(userId)) {
      return res.status(400).json({ message: 'User already enrolled in this course' });
    }

    course.enrolledUsers.push(userId);
    await course.save();

    res.json({ message: 'Successfully enrolled in course' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const unenrollFromCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    // Check if user is enrolled
    const userIndex = course.enrolledUsers.indexOf(userId);
    if (userIndex === -1) {
      return res.status(400).json({ message: 'User not enrolled in this course' });
    }

    course.enrolledUsers.splice(userIndex, 1);
    await course.save();

    res.json({ message: 'Successfully unenrolled from course' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  enrollInCourse,
  unenrollFromCourse
};