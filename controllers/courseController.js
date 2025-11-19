const Course = require('../models/Course');
const Category = require('../models/Category');
const User = require('../models/User');
const CourseProgress = require('../models/CourseProgress');
const PDFDocument = require('pdfkit');

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

const getCourseProgress = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const progress = await CourseProgress.findOne({ user: userId, course: id })
      .populate('courseDetails', 'title duration')
      .populate('userDetails', 'firstName lastName');

    if (!progress) {
      return res.json({
        progress: 0,
        watchedTime: 0,
        totalDuration: 0,
        completed: false,
        lastWatchedAt: null
      });
    }

    res.json(progress);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const updateCourseProgress = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const { watchedTime, totalDuration } = req.body;

    if (watchedTime === undefined || totalDuration === undefined) {
      return res.status(400).json({ message: 'watchedTime and totalDuration are required' });
    }

    // Calculate progress percentage
    const progress = totalDuration > 0 ? Math.min((watchedTime / totalDuration) * 100, 100) : 0;
    const completed = progress >= 100;

    const updatedProgress = await CourseProgress.findOneAndUpdate(
      { user: userId, course: id },
      {
        watchedTime,
        totalDuration,
        progress,
        completed,
        lastWatchedAt: new Date()
      },
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    ).populate('courseDetails', 'title duration');

    res.json({
      message: 'Progress updated successfully',
      progress: updatedProgress
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const generateCertificate = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    // ===== COURSE CHECKS =====
    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ message: "Course not found" });

    const progress = await CourseProgress.findOne({ user: userId, course: id });
    if (!progress || !progress.completed)
      return res.status(403).json({ message: "Course not completed" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // ===== PDF SETUP =====
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Certificate_${course.title.replace(/\s+/g, '_')}_${user.firstName}_${user.lastName}.pdf"`
    );

    doc.pipe(res);

    const W = doc.page.width;
    const H = doc.page.height;

    // ============================================================
    // BACKGROUND + MODERN DUAL CURVED BORDER
    // ============================================================
    doc.rect(0, 0, W, H).fill("#ffffff");

    const outerX = 20, outerY = 20, outerW = W - 40, outerH = H - 40, outerRadius = 20;
    const innerX = 25, innerY = 25, innerW = W - 50, innerH = H - 50, innerRadius = 15;

    // Outer border (Thick, Curved)
    doc.lineWidth(4).strokeColor("#003E82");
    doc.moveTo(outerX + outerRadius, outerY);
    doc.lineTo(outerX + outerW - outerRadius, outerY);
    doc.quadraticCurveTo(outerX + outerW, outerY, outerX + outerW, outerY + outerRadius);
    doc.lineTo(outerX + outerW, outerY + outerH - outerRadius);
    doc.quadraticCurveTo(outerX + outerW, outerY + outerH, outerX + outerW - outerRadius, outerY + outerH);
    doc.lineTo(outerX + outerRadius, outerY + outerH);
    doc.quadraticCurveTo(outerX, outerY + outerH, outerX, outerY + outerH - outerRadius);
    doc.lineTo(outerX, outerY + outerRadius);
    doc.quadraticCurveTo(outerX, outerY, outerX + outerRadius, outerY);
    doc.stroke();

    // Inner border (Thin, Curved)
    doc.lineWidth(1.2).strokeColor("#1C6DD0");
    doc.moveTo(innerX + innerRadius, innerY);
    doc.lineTo(innerX + innerW - innerRadius, innerY);
    doc.quadraticCurveTo(innerX + innerW, innerY, innerX + innerW, innerY + innerRadius);
    doc.lineTo(innerX + innerW, innerY + innerH - innerRadius);
    doc.quadraticCurveTo(innerX + innerW, innerY + innerH, innerX + innerW - innerRadius, innerY + innerH);
    doc.lineTo(innerX + innerRadius, innerY + innerH);
    doc.quadraticCurveTo(innerX, innerY + innerH, innerX, innerY + innerH - innerRadius);
    doc.lineTo(innerX, innerY + innerRadius);
    doc.quadraticCurveTo(innerX, innerY, innerX + innerRadius, innerY);
    doc.stroke();

    // ============================================================
    // HEADER AREA
    // ============================================================
  // ============================================================
  // HEADER AREA (UPDATED FONT SIZES)
  // ============================================================
  doc.fillColor("#003E82")
    .fontSize(26)                 // smaller
    .font("Helvetica-Bold")
    .text("SoSapient Inc.", 0, 45, { align: "center" });
  
  doc.fillColor("#003E82")
    .fontSize(45)                 // smaller
    .font("Helvetica-Bold")
    .text("CERTIFICATE", 0, 90, { align: "center", characterSpacing: 1 });
  
  doc.fontSize(24)                // smaller
    .font("Helvetica-Bold")
    .text("OF COMPLETION", 0, 140, { align: "center" });
  
  // Updated separator position for perfect spacing
  doc.moveTo(150, 185).lineTo(W - 150, 185).strokeColor("#1C6DD0").lineWidth(2).stroke();


    // ============================================================
    // MAIN BODY TEXT
    // ============================================================
    doc.fillColor("#444")
      .fontSize(20)
      .font("Helvetica")
      .text("This is to certify that", 0, 235, { align: "center" });
    
    doc.fillColor("#003E82")
      .fontSize(40)
      .font("Helvetica-Bold")
      .text(`${user.firstName} ${user.lastName}`, 0, 275, { align: "center" });
    
    doc.fillColor("#555")
      .fontSize(18)
      .font("Helvetica")
      .text("has successfully completed the course", 0, 320, { align: "center" });
    
    doc.fillColor("#003E82")
      .fontSize(28)
      .font("Helvetica-Bold")
      .text(`"${course.title}"`, 0, 360, { align: "center" });
    
    const completionDate = new Date(
      progress.lastWatchedAt || new Date()
    ).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
    
    doc.fillColor("#666")
      .fontSize(15)
      .text(`Completed on: ${completionDate}`, 0, 400, { align: "center" });
    
    // Short paragraph (clean centered)
    doc.fillColor("#777")
      .fontSize(12)
      .text(
        "This certificate acknowledges the successful completion of the course and recognizes the learner's dedication to personal growth and professional development.",
        120,
        420,
        {
          width: W - 240,
          align: "center",
          lineBreak: false
        }
      );

    // ============================================================
    // SIGNATURES
    // ============================================================
    const sigY = H - 120;

    // -- Left Signature --
    doc.fillColor("#333")
      .fontSize(12)
      .text("Authorized By:", 100, sigY);

    doc.moveTo(100, sigY + 40)
      .lineTo(270, sigY + 40)
      .strokeColor("#1C6DD0")
      .lineWidth(1.5)
      .stroke();

    doc.fillColor("#003E82")
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("Akash Raikwar", 100, sigY + 50, { width: 170, align: "center" });

    doc.fillColor("#666")
      .fontSize(10)
      .text("CEO & Founder", 100, sigY + 70, { width: 170, align: "center" });

    // -- Right Signature --
    doc.fillColor("#333")
      .fontSize(12)
      .text("Certificate Issued By:", W - 270, sigY);

    doc.moveTo(W - 270, sigY + 40)
      .lineTo(W - 100, sigY + 40)
      .strokeColor("#1C6DD0")
      .lineWidth(1.5)
      .stroke();

    doc.fillColor("#003E82")
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("SoSapient Inc.", W - 270, sigY + 50, {
        width: 170,
        align: "center"
      });

    doc.fillColor("#666")
      .fontSize(10)
      .text("HRMS Platform", W - 270, sigY + 70, {
        width: 170,
        align: "center"
      });

    // ============================================================
    // FOOTER (MODERN + CLEAN)
    // ============================================================
    
  const certificateId = `CERT-${Date.now()}-${userId.toString().slice(-6)}`;
    
    const pageWidth = doc.page.width;

// Left text (fixed x = 40)
doc.fillColor("#888")
   .fontSize(10)
   .text("SoSapient Inc. | B4, GECU IT Park, Ujjain Ring Road, Ujjain (M.P.) 456010 | www.sosapient.in", 40, H - 40);

// Right text (align to right side)
const rightText = `Certificate ID: ${certificateId}`;
const rightTextWidth = doc.widthOfString(rightText);

doc.fillColor("#999")
   .fontSize(9)
   .text(rightText, pageWidth - rightTextWidth - 40, H - 40);

    // END PDF
    doc.end();

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};


module.exports = {
  getCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  enrollInCourse,
  unenrollFromCourse,
  getCourseProgress,
  updateCourseProgress,
  generateCertificate
};