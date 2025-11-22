const Course = require('../models/Course');
const Category = require('../models/Category');
const User = require('../models/User');
const VideoProgress = require('../models/VideoProgress');
const CourseNotes = require('../models/CourseNotes');
const CourseProgress = require('../models/CourseProgress');
const PDFDocument = require('pdfkit');
const https = require('https');

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
      createdBy,
      modules: [] // Initialize empty modules array
    };

    // Handle file uploads
    if (req.files) {
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

    // Get the course to know the total number of videos
    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    // Calculate total videos in the course
    let totalVideos = 0;
    const videoIds = [];
    course.modules.forEach(module => {
      module.videos.forEach(video => {
        totalVideos++;
        videoIds.push({ moduleId: module._id.toString(), videoId: video._id.toString() });
      });
    });

    if (totalVideos === 0) {
      return res.json({
        progress: 0,
        watchedTime: 0,
        totalDuration: 0,
        completed: false,
        lastWatchedAt: null,
        videoProgress: []
      });
    }

    // Get all video progress for this course
    const videoProgresses = await VideoProgress.find({ user: userId, course: id });

    // Calculate overall course progress
    const completedVideos = videoProgresses.filter(vp => vp.completed).length;
    const overallProgress = (completedVideos / totalVideos) * 100;

    const totalWatchedTime = videoProgresses.reduce((sum, vp) => sum + vp.watchedTime, 0);
    const totalDuration = videoProgresses.reduce((sum, vp) => sum + vp.totalDuration, 0);

    const lastWatchedAt = videoProgresses.length > 0
      ? new Date(Math.max(...videoProgresses.map(vp => new Date(vp.lastWatchedAt).getTime())))
      : null;

    res.json({
      progress: Math.round(overallProgress),
      watchedTime: totalWatchedTime,
      totalDuration: totalDuration,
      completed: overallProgress >= 100,
      lastWatchedAt: lastWatchedAt,
      videoProgress: videoProgresses
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const updateVideoProgress = async (req, res) => {
  try {
    const { id, moduleId, videoId } = req.params;
    const userId = req.user._id;
    const { watchedTime, totalDuration } = req.body;

    if (watchedTime === undefined || totalDuration === undefined) {
      return res.status(400).json({ message: 'watchedTime and totalDuration are required' });
    }

    // Calculate progress percentage for this video
    const progress = totalDuration > 0 ? Math.min((watchedTime / totalDuration) * 100, 100) : 0;
    const completed = progress >= 100;

    const updatedProgress = await VideoProgress.findOneAndUpdate(
      { user: userId, course: id, moduleId, videoId },
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
    ).populate('courseDetails', 'title');

    res.json({
      message: 'Video progress updated successfully',
      progress: updatedProgress
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
// Helper function to generate PDF certificate
const generatePDFCertificate = (res, user, course, completionDate, certificateId) => {
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

  // Add logos
  if (logo1Buffer) {
    doc.image(logo1Buffer, 50, 35, { width: 70 });
  }
  if (logo2Buffer) {
    doc.image(logo2Buffer, W - 120, 35, { width: 70 });
  }

  // ============================================================
  // HEADER AREA (UPDATED FONT SIZES)
  // ============================================================
  doc.fillColor("#003E82")
    .fontSize(26)                 // smaller
    .font("Helvetica-Bold")
    .text("SoSapient Inc.", 0, 65, { align: "center" });

  doc.fillColor("#003E82")
    .fontSize(45)                 // smaller
    .font("Helvetica-Bold")
    .text("CERTIFICATE", 0, 110, { align: "center", characterSpacing: 1 });

  doc.fontSize(24)                // smaller
    .font("Helvetica-Bold")
    .text("OF COMPLETION", 0, 160, { align: "center" });

  // Updated separator position for perfect spacing
  doc.moveTo(150, 205).lineTo(W - 150, 205).strokeColor("#1C6DD0").lineWidth(2).stroke();


  // ============================================================
  // MAIN BODY TEXT
  // ============================================================
  doc.fillColor("#444")
    .fontSize(20)
    .font("Helvetica")
    .text("This is to certify that", 0, 255, { align: "center" });

  doc.fillColor("#003E82")
    .fontSize(40)
    .font("Helvetica-Bold")
    .text(`${user.firstName} ${user.lastName}`, 0, 295, { align: "center" });

  doc.fillColor("#555")
    .fontSize(18)
    .font("Helvetica")
    .text("has successfully completed the course", 0, 340, { align: "center" });

  doc.fillColor("#003E82")
    .fontSize(28)
    .font("Helvetica-Bold")
    .text(`"${course.title}"`, 0, 380, { align: "center" });

  const completionDateFormatted = completionDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  doc.fillColor("#666")
    .fontSize(15)
    .text(`Completed on: ${completionDateFormatted}`, 0, 420, { align: "center" });

  // Short paragraph (clean centered)
  doc.fillColor("#777")
    .fontSize(12)
    .text(
      "This certificate acknowledges the successful completion of the course and recognizes the learner's dedication to personal growth and professional development.",
      120,
      440,
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
};

const generateCertificate = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    // ===== COURSE CHECKS =====
    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ message: "Course not found" });

    // Check if all videos in the course are completed
    let totalVideos = 0;
    course.modules.forEach(module => {
      totalVideos += module.videos.length;
    });

    const completedVideos = await VideoProgress.countDocuments({
      user: userId,
      course: id,
      completed: true
    });

    if (completedVideos < totalVideos) {
      return res.status(403).json({ message: "Course not completed - all videos must be watched" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Get the latest completion date
    const latestProgress = await VideoProgress.findOne({ user: userId, course: id, completed: true })
      .sort({ lastWatchedAt: -1 });

    const completionDate = latestProgress ? latestProgress.lastWatchedAt : new Date();

    // Generate certificate ID
    const certificateId = `CERT-${Date.now()}-${userId.toString().slice(-6)}`;

    // Fetch logos
    const fetchImage = (url) => {
      return new Promise((resolve, reject) => {
        const request = https.get(url, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303) {
            // Follow redirect
            fetchImage(res.headers.location).then(resolve).catch(reject);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`Failed to fetch image: ${res.statusCode}`));
            return;
          }
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        });
        request.on('error', reject);
      });
    };

    let logo1Buffer, logo2Buffer;
    try {
      logo1Buffer = await fetchImage('https://upload.wikimedia.org/wikipedia/en/3/3e/Skill_India.png');
      logo2Buffer = await fetchImage('https://ik.imagekit.io/sentyaztie/Dlogo.png?updatedAt=1749928182723');
      console.log('Logos fetched successfully:', !!logo1Buffer, !!logo2Buffer);
    } catch (err) {
      console.error('Error fetching logos:', err);
      // Continue without logos
    }

    // Store certificate ID in CourseProgress
    await CourseProgress.findOneAndUpdate(
      { user: userId, course: id },
      {
        certificateId,
        completed: true,
        progress: 100
      },
      { upsert: true, new: true }
    );

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

    // Add logos
    if (logo1Buffer) {
      doc.image(logo1Buffer, 50, 35, { width: 70 });
    }
    if (logo2Buffer) {
      doc.image(logo2Buffer, W - 120, 35, { width: 70 });
    }

    // ============================================================
    // HEADER AREA
    // ============================================================
  // ============================================================
  // HEADER AREA (UPDATED FONT SIZES)
  // ============================================================
  doc.fillColor("#003E82")
    .fontSize(26)                 // smaller
    .font("Helvetica-Bold")
    .text("SoSapient Inc.", 0, 65, { align: "center" });
  
  doc.fillColor("#003E82")
    .fontSize(45)                 // smaller
    .font("Helvetica-Bold")
    .text("CERTIFICATE", 0, 110, { align: "center", characterSpacing: 1 });
  
  doc.fontSize(24)                // smaller
    .font("Helvetica-Bold")
    .text("OF COMPLETION", 0, 160, { align: "center" });
  
  // Updated separator position for perfect spacing
  doc.moveTo(150, 205).lineTo(W - 150, 205).strokeColor("#1C6DD0").lineWidth(2).stroke();


    // ============================================================
    // MAIN BODY TEXT
    // ============================================================
    doc.fillColor("#444")
      .fontSize(20)
      .font("Helvetica")
      .text("This is to certify that", 0, 255, { align: "center" });
    
    doc.fillColor("#003E82")
      .fontSize(40)
      .font("Helvetica-Bold")
      .text(`${user.firstName} ${user.lastName}`, 0, 295, { align: "center" });
    
    doc.fillColor("#555")
      .fontSize(18)
      .font("Helvetica")
      .text("has successfully completed the course", 0, 340, { align: "center" });
    
    doc.fillColor("#003E82")
      .fontSize(28)
      .font("Helvetica-Bold")
      .text(`"${course.title}"`, 0, 380, { align: "center" });

    const completionDateFormatted = completionDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
    
    doc.fillColor("#666")
      .fontSize(15)
      .text(`Completed on: ${completionDateFormatted}`, 0, 420, { align: "center" });
    
    // Short paragraph (clean centered)
    doc.fillColor("#777")
      .fontSize(12)
      .text(
        "This certificate acknowledges the successful completion of the course and recognizes the learner's dedication to personal growth and professional development.",
        120,
        440,
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

const getCourseNotes = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const courseNotes = await CourseNotes.findOne({ user: userId, course: id })
      .populate('courseDetails', 'title')
      .populate('userDetails', 'firstName lastName');

    if (!courseNotes) {
      return res.json({ notes: [] });
    }

    res.json(courseNotes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const addCourseNote = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Note content is required' });
    }

    const updatedNotes = await CourseNotes.findOneAndUpdate(
      { user: userId, course: id },
      {
        $push: {
          notes: {
            content: content.trim(),
            createdAt: new Date()
          }
        }
      },
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    ).populate('courseDetails', 'title');

    res.json({
      message: 'Note added successfully',
      notes: updatedNotes
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const updateCourseNote = async (req, res) => {
  try {
    const { id, noteId } = req.params;
    const userId = req.user._id;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Note content is required' });
    }

    const updatedNotes = await CourseNotes.findOneAndUpdate(
      { user: userId, course: id, 'notes._id': noteId },
      {
        $set: {
          'notes.$.content': content.trim(),
          'notes.$.createdAt': new Date()
        }
      },
      { new: true, runValidators: true }
    ).populate('courseDetails', 'title');

    if (!updatedNotes) {
      return res.status(404).json({ message: 'Note not found' });
    }

    res.json({
      message: 'Note updated successfully',
      notes: updatedNotes
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const deleteCourseNote = async (req, res) => {
  try {
    const { id, noteId } = req.params;
    const userId = req.user._id;

    const updatedNotes = await CourseNotes.findOneAndUpdate(
      { user: userId, course: id },
      {
        $pull: {
          notes: { _id: noteId }
        }
      },
      { new: true }
    );

    if (!updatedNotes) {
      return res.status(404).json({ message: 'Course notes not found' });
    }

    res.json({
      message: 'Note deleted successfully',
      notes: updatedNotes
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};


// Module management functions
const addModule = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, order } = req.body;

    if (!title) {
      return res.status(400).json({ message: 'Module title is required' });
    }

    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    const moduleOrder = order !== undefined ? order : course.modules.length;
    const moduleId = `module_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    course.modules.push({
      title,
      description: description || '',
      order: moduleOrder,
      videos: []
    });

    await course.save();

    res.json({
      message: 'Module added successfully',
      module: course.modules[course.modules.length - 1]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const updateModule = async (req, res) => {
  try {
    const { id, moduleId } = req.params;
    const { title, description, order } = req.body;

    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    const module = course.modules.id(moduleId);
    if (!module) return res.status(404).json({ message: 'Module not found' });

    if (title !== undefined) module.title = title;
    if (description !== undefined) module.description = description;
    if (order !== undefined) module.order = order;

    await course.save();

    res.json({
      message: 'Module updated successfully',
      module
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const deleteModule = async (req, res) => {
  try {
    const { id, moduleId } = req.params;

    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    course.modules.pull(moduleId);
    await course.save();

    // Delete all video progress for this module
    await VideoProgress.deleteMany({ course: id, moduleId });

    res.json({ message: 'Module deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Video management functions
const addVideo = async (req, res) => {
  try {
    const { id, moduleId } = req.params;
    const { title, description, order } = req.body;

    if (!title) {
      return res.status(400).json({ message: 'Video title is required' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Video file is required' });
    }

    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    const module = course.modules.id(moduleId);
    if (!module) return res.status(404).json({ message: 'Module not found' });

    const videoOrder = order !== undefined ? order : module.videos.length;
    const videoId = `video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    module.videos.push({
      title,
      description: description || '',
      videoFile: req.file.path,
      order: videoOrder
    });

    await course.save();

    res.json({
      message: 'Video added successfully',
      video: module.videos[module.videos.length - 1]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const updateVideo = async (req, res) => {
  try {
    const { id, moduleId, videoId } = req.params;
    const { title, description, order } = req.body;

    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    const module = course.modules.id(moduleId);
    if (!module) return res.status(404).json({ message: 'Module not found' });

    const video = module.videos.id(videoId);
    if (!video) return res.status(404).json({ message: 'Video not found' });

    if (title !== undefined) video.title = title;
    if (description !== undefined) video.description = description;
    if (order !== undefined) video.order = order;

    // Handle video file upload
    if (req.file) {
      video.videoFile = req.file.path;
    }

    await course.save();

    res.json({
      message: 'Video updated successfully',
      video
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const deleteVideo = async (req, res) => {
  try {
    const { id, moduleId, videoId } = req.params;

    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    const module = course.modules.id(moduleId);
    if (!module) return res.status(404).json({ message: 'Module not found' });

    module.videos.pull(videoId);
    await course.save();

    // Delete video progress for this video
    await VideoProgress.deleteMany({ course: id, moduleId, videoId });

    res.json({ message: 'Video deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const getVideoProgress = async (req, res) => {
  try {
    const { id, moduleId, videoId } = req.params;
    const userId = req.user._id;

    const progress = await VideoProgress.findOne({ user: userId, course: id, moduleId, videoId });

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

const verifyCertificate = async (req, res) => {
  try {
    const { certificateId } = req.body;

    if (!certificateId) {
      return res.status(400).json({ message: 'Certificate ID is required' });
    }

    // Find the course progress with this certificate ID
    const courseProgress = await CourseProgress.findOne({ certificateId })
      .populate('userDetails', 'firstName lastName email employeeCode photo department joiningDate mobile1 role status')
      .populate('courseDetails', 'title');

    if (!courseProgress) {
      return res.status(404).json({ message: 'Certificate not found or invalid' });
    }

    if (!courseProgress.completed) {
      return res.status(400).json({ message: 'Certificate is not valid - course not completed' });
    }

    res.json({
      valid: true,
      learner: {
        firstName: courseProgress.userDetails.firstName,
        lastName: courseProgress.userDetails.lastName,
        email: courseProgress.userDetails.email,
        employeeCode: courseProgress.userDetails.employeeCode,
        photo: courseProgress.userDetails.photo,
        department: courseProgress.userDetails.department,
        joiningDate: courseProgress.userDetails.joiningDate,
        mobile1: courseProgress.userDetails.mobile1,
        role: courseProgress.userDetails.role,
        status: courseProgress.userDetails.status
      },
      course: {
        title: courseProgress.courseDetails.title
      },
      certificateId: courseProgress.certificateId,
      completedAt: courseProgress.updatedAt
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const downloadCertificate = async (req, res) => {
  try {
    const { certificateId } = req.params;

    if (!certificateId) {
      return res.status(400).json({ message: 'Certificate ID is required' });
    }

    // Find the course progress with this certificate ID
    const courseProgress = await CourseProgress.findOne({ certificateId })
      .populate('userDetails', 'firstName lastName email')
      .populate('courseDetails', 'title');

    if (!courseProgress) {
      return res.status(404).json({ message: 'Certificate not found or invalid' });
    }

    if (!courseProgress.completed) {
      return res.status(400).json({ message: 'Certificate is not valid - course not completed' });
    }

    const user = courseProgress.userDetails;
    const course = courseProgress.courseDetails;
    const completionDate = courseProgress.updatedAt;

    // Fetch logos
    const fetchImage = (url) => {
      return new Promise((resolve, reject) => {
        const request = https.get(url, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303) {
            // Follow redirect
            fetchImage(res.headers.location).then(resolve).catch(reject);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`Failed to fetch image: ${res.statusCode}`));
            return;
          }
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        });
        request.on('error', reject);
      });
    };

    let logo1Buffer, logo2Buffer;
    try {
      logo1Buffer = await fetchImage('https://upload.wikimedia.org/wikipedia/en/3/3e/Skill_India.png');
      logo2Buffer = await fetchImage('https://ik.imagekit.io/sentyaztie/Dlogo.png?updatedAt=1749928182723');
      console.log('Logos fetched successfully:', !!logo1Buffer, !!logo2Buffer);
    } catch (err) {
      console.error('Error fetching logos:', err);
      // Continue without logos
    }

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

    const completionDateFormatted = completionDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });

    doc.fillColor("#666")
      .fontSize(15)
      .text(`Completed on: ${completionDateFormatted}`, 0, 400, { align: "center" });

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
  updateVideoProgress,
  generateCertificate,
  verifyCertificate,
  downloadCertificate,
  getCourseNotes,
  addCourseNote,
  updateCourseNote,
  deleteCourseNote,
  // Module management
  addModule,
  updateModule,
  deleteModule,
  // Video management
  addVideo,
  updateVideo,
  deleteVideo,
  getVideoProgress
};