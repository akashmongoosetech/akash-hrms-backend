const Appraisal = require('../models/Appraisal');

// Get all appraisals with pagination and filtering
const getAppraisals = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = {};

    // Filter by employee if provided
    if (req.query.employeeId) {
      query.employee = req.query.employeeId;
    }

    // Filter by reviewer if provided
    if (req.query.reviewerId) {
      query.reviewer = req.query.reviewerId;
    }

    // Filter by status
    if (req.query.status) {
      query.status = req.query.status;
    }

    // Filter by period
    if (req.query.startDate && req.query.endDate) {
      query['period.startDate'] = { $gte: new Date(req.query.startDate) };
      query['period.endDate'] = { $lte: new Date(req.query.endDate) };
    }

    const appraisals = await Appraisal.find(query)
      .populate('employee', 'firstName lastName email photo')
      .populate('reviewer', 'firstName lastName email photo')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Appraisal.countDocuments(query);

    res.json({
      appraisals,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalAppraisals: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching appraisals:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get single appraisal by ID
const getAppraisalById = async (req, res) => {
  try {
    const appraisal = await Appraisal.findById(req.params.id)
      .populate('employee', 'firstName lastName email photo department')
      .populate('reviewer', 'firstName lastName email photo department');

    if (!appraisal) {
      return res.status(404).json({ message: 'Appraisal not found' });
    }

    res.json(appraisal);
  } catch (error) {
    console.error('Error fetching appraisal:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create new appraisal
const createAppraisal = async (req, res) => {
  try {
    const appraisalData = {
      ...req.body,
      employee: req.body.employeeId || req.body.employee,
      reviewer: req.body.reviewerId || req.body.reviewer
    };

    const appraisal = new Appraisal(appraisalData);
    await appraisal.save();

    const populatedAppraisal = await Appraisal.findById(appraisal._id)
      .populate('employee', 'firstName lastName email photo')
      .populate('reviewer', 'firstName lastName email photo');

    res.status(201).json(populatedAppraisal);
  } catch (error) {
    console.error('Error creating appraisal:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update appraisal
const updateAppraisal = async (req, res) => {
  try {
    console.log('Update appraisal request:', req.params.id, req.body);
    let updates = { ...req.body };

    // Map employeeId to employee and reviewerId to reviewer
    if (updates.employeeId) {
      updates.employee = updates.employeeId;
      delete updates.employeeId;
    }
    if (updates.reviewerId) {
      updates.reviewer = updates.reviewerId;
      delete updates.reviewerId;
    }

    console.log('Mapped updates:', updates);

    // Prevent updating certain fields if status is not draft
    const appraisal = await Appraisal.findById(req.params.id);
    if (!appraisal) {
      return res.status(404).json({ message: 'Appraisal not found' });
    }

    console.log('Appraisal status:', appraisal.status, 'User role:', req.user.role);

    if (appraisal.status !== 'Draft' && req.user.role !== 'Admin' && req.user.role !== 'SuperAdmin') {
      // Only allow updating comments and goals progress for non-draft appraisals
      const allowedFields = ['goals', 'comments'];
      const filteredUpdates = {};
      allowedFields.forEach(field => {
        if (updates[field] !== undefined) {
          filteredUpdates[field] = updates[field];
        }
      });
      updates = filteredUpdates;
      console.log('Filtered updates for non-draft:', updates);
    }

    console.log('Final updates:', updates);

    const updatedAppraisal = await Appraisal.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    )
      .populate('employee', 'firstName lastName email photo')
      .populate('reviewer', 'firstName lastName email photo');

    console.log('Updated appraisal:', updatedAppraisal);
    res.json(updatedAppraisal);
  } catch (error) {
    console.error('Error updating appraisal:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete appraisal
const deleteAppraisal = async (req, res) => {
  try {
    const appraisal = await Appraisal.findById(req.params.id);

    if (!appraisal) {
      return res.status(404).json({ message: 'Appraisal not found' });
    }

    // Allow deletion of submitted appraisals, approved/rejected only by admin/superadmin
    if ((appraisal.status === 'Approved' || appraisal.status === 'Rejected') &&
        req.user.role !== 'Admin' && req.user.role !== 'SuperAdmin') {
      return res.status(403).json({ message: 'Cannot delete approved or rejected appraisal' });
    }

    await Appraisal.findByIdAndDelete(req.params.id);
    res.json({ message: 'Appraisal deleted successfully' });
  } catch (error) {
    console.error('Error deleting appraisal:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Submit appraisal for review
const submitAppraisal = async (req, res) => {
  try {
    const appraisal = await Appraisal.findById(req.params.id);

    if (!appraisal) {
      return res.status(404).json({ message: 'Appraisal not found' });
    }

    if (appraisal.status !== 'Draft') {
      return res.status(400).json({ message: 'Appraisal already submitted' });
    }

    appraisal.status = 'Submitted';
    appraisal.submittedAt = new Date();
    await appraisal.save();

    const updatedAppraisal = await Appraisal.findById(appraisal._id)
      .populate('employee', 'firstName lastName email photo')
      .populate('reviewer', 'firstName lastName email photo');

    res.json(updatedAppraisal);
  } catch (error) {
    console.error('Error submitting appraisal:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Approve or reject appraisal
const reviewAppraisal = async (req, res) => {
  try {
    const { status, comments } = req.body;
    const appraisal = await Appraisal.findById(req.params.id);

    if (!appraisal) {
      return res.status(404).json({ message: 'Appraisal not found' });
    }

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    appraisal.status = status;
    appraisal.reviewedAt = new Date();
    if (comments) {
      appraisal.comments = comments;
    }

    await appraisal.save();

    const updatedAppraisal = await Appraisal.findById(appraisal._id)
      .populate('employee', 'firstName lastName email photo')
      .populate('reviewer', 'firstName lastName email photo');

    res.json(updatedAppraisal);
  } catch (error) {
    console.error('Error reviewing appraisal:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getAppraisals,
  getAppraisalById,
  createAppraisal,
  updateAppraisal,
  deleteAppraisal,
  submitAppraisal,
  reviewAppraisal
};